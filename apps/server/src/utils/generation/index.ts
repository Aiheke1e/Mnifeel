import type postgres from "postgres";
import { randomUUID } from "node:crypto";
import { freezeTaskCredits, refundTaskCredits } from "@/utils/billing";
import { calculateCredits, estimateUsage, parsePricing, type GenerationUsage, type Pricing } from "@/utils/billing/pricing";
import { getDatabase, type Database, type DatabaseTransaction } from "@/utils/database";
import type { MediaType, TaskStatus, UserRole } from "@/utils/database/types";
import { publishGenerationEvent, subscribeGenerationEvent, type GenerationEvent } from "@/utils/generation/events";
import { abortGenerationTask, executeGenerationTask, wakeGenerationWorker } from "@/utils/generation/worker";
import { redactSecretFields } from "@/utils/providers/redact";

type GenerationTaskRow = {
  id: string;
  userId: string;
  projectId: string;
  modelId: string;
  taskType: MediaType;
  status: TaskStatus;
  idempotencyKey: string;
  requestSummary: {
    input: Record<string, unknown>;
    billing: { pricing: Pricing; estimatedUsage: GenerationUsage; billable: boolean };
  };
  result: unknown;
  providerTaskId: string | null;
  progress: number;
  frozenCredits: number;
  actualCredits: number;
  refundedCredits: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  heartbeatAt: Date | null;
  completedAt: Date | null;
  cancelRequestedAt: Date | null;
};

type ModelRow = {
  mediaType: MediaType;
  pricing: Record<string, number>;
  capabilities: Record<string, unknown>;
  modelEnabled: boolean;
  providerEnabled: boolean;
  connectionStatus: string;
  userStatus: string;
  isWhitelist: boolean;
};

type GenerationInput = {
  projectId: string;
  modelId: string;
  request: Record<string, unknown>;
};

type GenerationEstimate = {
  taskType: MediaType;
  request: Record<string, unknown>;
  pricing: Pricing;
  estimatedUsage: GenerationUsage;
  estimatedCredits: number;
  billable: boolean;
};

type GenerationOptions = {
  wakeWorker?: boolean;
  external?: boolean;
  estimatedUsage?: GenerationUsage;
  billable?: boolean;
  expectedTaskType?: MediaType;
};

function invalid(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function numberValue(value: number) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("任务积分数据无效");
  return parsed;
}

function dateValue(value: Date | null) {
  return value?.toISOString() ?? null;
}

export function publicGenerationTask(task: GenerationTaskRow) {
  const batchId = typeof task.requestSummary.input.batchId === "string" ? task.requestSummary.input.batchId : task.id;
  return {
    ...task,
    batchId,
    frozenCredits: numberValue(task.frozenCredits),
    actualCredits: numberValue(task.actualCredits),
    refundedCredits: numberValue(task.refundedCredits),
    createdAt: task.createdAt.toISOString(),
    startedAt: dateValue(task.startedAt),
    heartbeatAt: dateValue(task.heartbeatAt),
    completedAt: dateValue(task.completedAt),
    cancelRequestedAt: dateValue(task.cancelRequestedAt),
  };
}

function eventFromTask(task: GenerationTaskRow) {
  return {
    taskId: task.id,
    status: task.status,
    progress: task.progress,
    result: task.result ?? undefined,
    actualCredits: numberValue(task.actualCredits),
    refundedCredits: numberValue(task.refundedCredits),
    errorMessage: task.errorMessage ?? undefined,
  };
}

function safeInput(input: Record<string, unknown>) {
  // 只移除结构化密钥字段，保留提示词中的普通文本原样参与生成。
  const redacted = redactSecretFields(input) as Record<string, unknown>;
  if (new TextEncoder().encode(JSON.stringify(redacted)).byteLength > 8 * 1024 * 1024) {
    invalid("生成请求超过 8 MB 限制", 413);
  }
  return redacted;
}

async function prepareGeneration(
  database: Database | DatabaseTransaction,
  userId: string,
  input: GenerationInput,
  options: GenerationOptions = {},
): Promise<GenerationEstimate> {
  const models = await database<ModelRow[]>`
    select m."mediaType", m."pricing", m."capabilities", m."enabled" as "modelEnabled",
      p."enabled" as "providerEnabled", p."connectionStatus", u."status" as "userStatus", u."isWhitelist"
    from "modelConfigs" m
    join "providerConfigs" p on p."id" = m."providerId"
    join "users" u on u."id" = ${userId}
    join "projects" pr on pr."id" = ${input.projectId} and pr."userId" = u."id" and pr."status" = 'active'
    where m."id" = ${input.modelId}
    limit 1
  `;
  const model = models[0] ?? invalid("项目或模型不存在", 404);
  if (model.userStatus !== "active") invalid("账号已被禁用", 403);
  if (options.expectedTaskType && model.mediaType !== options.expectedTaskType) invalid("所选模型类型已变更，请重新选择", 409);
  if (!model.modelEnabled || !model.providerEnabled || model.connectionStatus !== "passed") {
    invalid("所选模型尚未启用或供应商未通过连接测试", 409);
  }
  const pricing = parsePricing(model.mediaType, model.pricing);
  const request = safeInput(input.request);
  const estimatedUsage = options.estimatedUsage ?? estimateUsage(model.mediaType, request, model.capabilities);
  const billable = options.billable ?? !(model.mediaType === "video" && model.isWhitelist);
  const estimatedCredits = billable ? calculateCredits(model.mediaType, pricing, estimatedUsage) : 0;
  return { taskType: model.mediaType, request, pricing, estimatedUsage, estimatedCredits, billable };
}

export async function estimateGenerationTask(userId: string, input: GenerationInput) {
  const estimate = await prepareGeneration(getDatabase(), userId, input);
  return {
    taskType: estimate.taskType,
    estimatedUsage: estimate.estimatedUsage,
    estimatedCredits: estimate.estimatedCredits,
    billable: estimate.billable,
  };
}

export async function createGenerationTask(userId: string, input: {
  projectId: string;
  modelId: string;
  idempotencyKey: string;
  request: Record<string, unknown>;
}, options: GenerationOptions = {}) {
  const result = await getDatabase().begin(async transaction => {
    await transaction`select pg_advisory_xact_lock(hashtext(${`${userId}:${input.idempotencyKey}`}))`;
    const existing = await transaction<GenerationTaskRow[]>`
      select * from "generationTasks"
      where "userId" = ${userId} and "idempotencyKey" = ${input.idempotencyKey}
      limit 1
    `;
    if (existing[0]) return { task: existing[0], created: false };
    const estimate = await prepareGeneration(transaction, userId, input, options);
    const { taskType, request, pricing, estimatedUsage, billable, estimatedCredits } = estimate;
    const taskId = randomUUID();
    const status = options.external ? "running" : "pending";
    const startedAt = options.external ? new Date() : null;
    const progress = options.external ? 1 : 0;
    const requestSummary = { input: request, billing: { pricing, estimatedUsage, billable } };
    const rows = await transaction<GenerationTaskRow[]>`
      insert into "generationTasks" (
        "id", "userId", "projectId", "modelId", "taskType", "status", "idempotencyKey", "requestSummary",
        "frozenCredits", "progress", "startedAt", "heartbeatAt"
      ) values (
        ${taskId}, ${userId}, ${input.projectId}, ${input.modelId}, ${taskType}, ${status}, ${input.idempotencyKey},
        ${transaction.json(requestSummary as postgres.JSONValue)}, ${estimatedCredits}, ${progress}, ${startedAt}, ${startedAt}
      ) returning *
    `;
    const task = rows[0]!;
    await freezeTaskCredits(transaction, { id: taskId, userId, frozenCredits: estimatedCredits });
    return { task, created: true };
  });
  if (result.created) {
    publishGenerationEvent(eventFromTask(result.task));
    if (!options.external && options.wakeWorker !== false) wakeGenerationWorker();
  }
  return { task: publicGenerationTask(result.task), created: result.created };
}

export async function getGenerationTask(userId: string, role: UserRole, taskId: string) {
  const rows = await getDatabase()<GenerationTaskRow[]>`
    select * from "generationTasks"
    where "id" = ${taskId} and ("userId" = ${userId} or ${role} = 'admin')
    limit 1
  `;
  const task = rows[0] ?? invalid("生成任务不存在", 404);
  return publicGenerationTask(task);
}

export async function listGenerationTasks(userId: string, input: {
  projectId?: string;
  status?: TaskStatus;
  limit: number;
  offset: number;
}) {
  const projectId = input.projectId ?? null;
  const status = input.status ?? null;
  const rows = await getDatabase()<GenerationTaskRow[]>`
    select * from "generationTasks"
    where "userId" = ${userId}
      and (${projectId}::uuid is null or "projectId" = ${projectId})
      and (${status}::text is null or "status" = ${status})
    order by "createdAt" desc, "id" desc
    limit ${input.limit} offset ${input.offset}
  `;
  return rows.map(publicGenerationTask);
}

export async function cancelGenerationTask(userId: string, role: UserRole, taskId: string) {
  const task = await getDatabase().begin(async transaction => {
    const rows = await transaction<GenerationTaskRow[]>`
      select * from "generationTasks" where "id" = ${taskId} limit 1 for update
    `;
    const current = rows[0] ?? invalid("生成任务不存在", 404);
    if (current.userId !== userId && role !== "admin") invalid("无权取消这个任务", 403);
    if (["succeeded", "failed", "cancelled"].includes(current.status)) return current;
    const refundedCredits = await refundTaskCredits(transaction, {
      id: current.id,
      userId: current.userId,
      frozenCredits: numberValue(current.frozenCredits),
    });
    const updated = await transaction<GenerationTaskRow[]>`
      update "generationTasks" set
        "status" = 'cancelled', "cancelRequestedAt" = now(), "completedAt" = now(),
        "refundedCredits" = ${refundedCredits}, "errorCode" = null, "errorMessage" = null
      where "id" = ${taskId}
      returning *
    `;
    return updated[0]!;
  });
  abortGenerationTask(taskId);
  publishGenerationEvent(eventFromTask(task));
  return publicGenerationTask(task);
}

export async function waitGenerationTask(
  userId: string,
  role: UserRole,
  taskId: string,
  signal?: AbortSignal,
  onEvent?: (event: GenerationEvent) => void,
) {
  signal?.throwIfAborted();
  return new Promise<Awaited<ReturnType<typeof getGenerationTask>>>((resolve, reject) => {
    let settled = false;
    const finish = async () => {
      if (settled) return;
      settled = true;
      cleanup();
      try { resolve(await getGenerationTask(userId, role, taskId)); }
      catch (error) { reject(error); }
    };
    const unsubscribe = subscribeGenerationEvent(taskId, event => {
      try { onEvent?.(event); }
      catch { /* 观察者错误不能阻止任务终态被读取。 */ }
      if (["succeeded", "failed", "cancelled"].includes(event.status)) void finish();
    });
    const abort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(signal?.reason ?? new DOMException("任务等待已取消", "AbortError"));
    };
    const cleanup = () => {
      unsubscribe();
      signal?.removeEventListener("abort", abort);
    };
    signal?.addEventListener("abort", abort, { once: true });
    void getGenerationTask(userId, role, taskId).then(task => {
      if (["succeeded", "failed", "cancelled"].includes(task.status)) void finish();
    }, error => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
  });
}

export async function runGenerationTask(userId: string, input: {
  projectId: string;
  modelId: string;
  taskType: MediaType;
  request: Record<string, unknown>;
  idempotencyKey?: string;
}, signal?: AbortSignal, onEvent?: (event: GenerationEvent) => void) {
  const { taskType, ...generationInput } = input;
  const created = await createGenerationTask(userId, {
    ...generationInput,
    idempotencyKey: input.idempotencyKey ?? randomUUID(),
  }, { external: true, expectedTaskType: taskType });
  const abort = () => { void cancelGenerationTask(userId, "user", created.task.id).catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) await cancelGenerationTask(userId, "user", created.task.id);
  else if (created.created) await executeGenerationTask(created.task.id, signal);
  try {
    const task = await waitGenerationTask(userId, "user", created.task.id, signal, onEvent);
    if (task.status !== "succeeded") throw new Error(task.errorMessage || (task.status === "cancelled" ? "生成已取消" : "生成失败"));
    return task;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

export { subscribeGenerationEvent };
export type { GenerationEvent } from "@/utils/generation/events";
export {
  registerGenerationExecutor,
  unregisterGenerationExecutor,
  recoverStaleGenerationTasks,
  completeGenerationTask,
  beginExternalGenerationTask,
  executeGenerationTask,
  failGenerationTask,
  wakeGenerationWorker,
  startGenerationWorker,
  stopGenerationWorker,
} from "@/utils/generation/worker";
export type {
  GenerationExecutionContext,
  GenerationExecutionResult,
  GenerationExecutionTask,
  GenerationExecutor,
} from "@/utils/generation/worker";
