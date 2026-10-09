import type postgres from "postgres";
import { randomUUID } from "node:crypto";
import { freezeTaskCredits, refundTaskCredits } from "@/utils/billing";
import { calculateCredits, estimateUsage, parsePricing, type GenerationUsage, type Pricing } from "@/utils/billing/pricing";
import { getDatabase, type Database, type DatabaseTransaction } from "@/utils/database";
import type { MediaType, TaskStatus, UserRole } from "@/utils/database/types";
import { publishGenerationEvent, subscribeGenerationEvent, type GenerationEvent } from "@/utils/generation/events";
import { abortGenerationTask, executeGenerationTask, wakeGenerationWorker } from "@/utils/generation/worker";
import { buildGenerationFingerprint, validateMediaGenerationRequest, type GenerationReferenceSummary } from "@/utils/media/generation";
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
    /** 冻结时的请求指纹；执行前与当前请求不一致则拒绝扣分。 */
    fingerprint?: string;
    /** 冻结时生效的视频能力版本；未声明能力的模型为 undefined。 */
    capabilityVersion?: number;
    /** 冻结时的引用角色与顺序，只保存工作区相对路径。 */
    references?: GenerationReferenceSummary[];
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
  fingerprint?: string;
  capabilityVersion?: number;
  references?: GenerationReferenceSummary[];
};

type GenerationOptions = {
  wakeWorker?: boolean;
  external?: boolean;
  estimatedUsage?: GenerationUsage;
  billable?: boolean;
  expectedTaskType?: MediaType;
  /** 已确认的指纹；与当前请求不一致时拒绝创建任务，不冻结积分。 */
  expectedFingerprint?: string;
};

const pendingTaskCancellations = new Map<string, number>();
const taskCancellationTtl = 60_000;

function taskCancellationKey(userId: string, kind: "request" | "output", value: string) {
  return `${userId}:${kind}:${value}`;
}

function markTaskCancellation(key: string) {
  const now = Date.now();
  for (const [candidate, expiresAt] of pendingTaskCancellations) {
    if (expiresAt <= now) pendingTaskCancellations.delete(candidate);
  }
  pendingTaskCancellations.set(key, now + taskCancellationTtl);
}

function takeTaskCancellation(key: string) {
  const expiresAt = pendingTaskCancellations.get(key);
  pendingTaskCancellations.delete(key);
  return expiresAt !== undefined && expiresAt > Date.now();
}

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
  const safeRequest = safeInput(input.request);
  // ACT: 图片与视频走同一份已校验请求，指纹只在这份请求上计算。
  const media = model.mediaType === "image" || model.mediaType === "video"
    ? { mediaType: model.mediaType, request: { ...validateMediaGenerationRequest(model.mediaType, safeRequest, model.capabilities, input.modelId) } }
    : undefined;
  const request = media?.request ?? safeRequest;
  const pricing = parsePricing(model.mediaType, model.pricing);
  const estimatedUsage = options.estimatedUsage ?? estimateUsage(model.mediaType, request, model.capabilities);
  const billable = options.billable ?? !(model.mediaType === "video" && model.isWhitelist);
  const estimatedCredits = billable ? calculateCredits(model.mediaType, pricing, estimatedUsage) : 0;
  // ACT: 指纹在鉴权、Schema、路径与能力校验之后生成；已确认指纹不符时不创建任务、不冻结积分。
  const frozen = media
    ? await buildGenerationFingerprint(userId, { projectId: input.projectId, mediaType: media.mediaType, request: media.request, capabilities: model.capabilities })
    : undefined;
  if (options.expectedFingerprint !== undefined && frozen?.fingerprint !== options.expectedFingerprint) {
    invalid("镜头素材、模型或参数已变化，请重新估价后再生成", 409);
  }
  return {
    taskType: model.mediaType,
    request,
    pricing,
    estimatedUsage,
    estimatedCredits,
    billable,
    fingerprint: frozen?.fingerprint,
    capabilityVersion: frozen?.capabilityVersion,
    references: frozen?.references,
  };
}

export async function estimateGenerationTask(userId: string, input: GenerationInput) {
  const estimate = await prepareGeneration(getDatabase(), userId, input);
  return {
    taskType: estimate.taskType,
    estimatedUsage: estimate.estimatedUsage,
    estimatedCredits: estimate.estimatedCredits,
    billable: estimate.billable,
    fingerprint: estimate.fingerprint,
  };
}

export async function createGenerationTask(userId: string, input: {
  projectId: string;
  modelId: string;
  idempotencyKey: string;
  request: Record<string, unknown>;
  /** 普通工作台传入已确认指纹；高级画布不传，行为与之前一致。 */
  expectedFingerprint?: string;
}, options: GenerationOptions = {}) {
  const result = await getDatabase().begin(async transaction => {
    const requestLock = `${userId}:request:${input.idempotencyKey}`;
    await transaction`select pg_advisory_xact_lock(hashtext(${requestLock}))`;
    const existing = await transaction<GenerationTaskRow[]>`
      select * from "generationTasks"
      where "userId" = ${userId} and "idempotencyKey" = ${input.idempotencyKey}
      limit 1
    `;
    if (existing[0]) return { task: existing[0], created: false };
    const outputDirectory = typeof input.request.outputDirectory === "string" && input.request.outputDirectory
      ? input.request.outputDirectory
      : undefined;
    if (outputDirectory) {
      const outputLock = `${userId}:output:${input.projectId}:${outputDirectory}`;
      await transaction`select pg_advisory_xact_lock(hashtext(${outputLock}))`;
      const active = await transaction<GenerationTaskRow[]>`
        select * from "generationTasks"
        where "userId" = ${userId} and "projectId" = ${input.projectId}
          and "status" in ('pending', 'running')
          and "requestSummary"->'input'->>'outputDirectory' = ${outputDirectory}
        order by "createdAt" desc
        limit 1
      `;
      if (active[0]) return { task: active[0], created: false };
      if (takeTaskCancellation(taskCancellationKey(userId, "output", `${input.projectId}:${outputDirectory}`))) invalid("生成已取消", 409);
    }
    if (takeTaskCancellation(taskCancellationKey(userId, "request", input.idempotencyKey))) invalid("生成已取消", 409);
    const estimate = await prepareGeneration(transaction, userId, input, { ...options, expectedFingerprint: options.expectedFingerprint ?? input.expectedFingerprint });
    const { taskType, request, pricing, estimatedUsage, billable, estimatedCredits, fingerprint, capabilityVersion, references } = estimate;
    const taskId = randomUUID();
    const status = options.external ? "running" : "pending";
    const startedAt = options.external ? new Date() : null;
    const progress = options.external ? 1 : 0;
    // ACT: 快照只保留能力版本、引用角色顺序、工作区相对路径、指纹与计费快照，不含密钥、绝对路径或媒体内容。
    const requestSummary = {
      input: request,
      billing: { pricing, estimatedUsage, billable },
      ...(fingerprint ? { fingerprint } : {}),
      ...(capabilityVersion === undefined ? {} : { capabilityVersion }),
      ...(references ? { references } : {}),
    };
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

export async function cancelGenerationTaskByIdempotencyKey(userId: string, role: UserRole, idempotencyKey: string) {
  const cancellationKey = taskCancellationKey(userId, "request", idempotencyKey);
  markTaskCancellation(cancellationKey);
  const taskId = await getDatabase().begin(async transaction => {
    await transaction`select pg_advisory_xact_lock(hashtext(${`${userId}:request:${idempotencyKey}`}))`;
    const rows = await transaction<Array<{ id: string }>>`
      select "id" from "generationTasks"
      where "userId" = ${userId} and "idempotencyKey" = ${idempotencyKey}
      limit 1
    `;
    return rows[0]?.id;
  });
  if (!taskId) return null;
  try {
    return await cancelGenerationTask(userId, role, taskId);
  } finally {
    pendingTaskCancellations.delete(cancellationKey);
  }
}

export async function cancelActiveGenerationTask(userId: string, role: UserRole, projectId: string, outputDirectory: string) {
  const outputValue = `${projectId}:${outputDirectory}`;
  const cancellationKey = taskCancellationKey(userId, "output", outputValue);
  markTaskCancellation(cancellationKey);
  const taskId = await getDatabase().begin(async transaction => {
    await transaction`select pg_advisory_xact_lock(hashtext(${`${userId}:output:${outputValue}`}))`;
    const rows = await transaction<Array<{ id: string }>>`
      select "id" from "generationTasks"
      where "userId" = ${userId} and "projectId" = ${projectId}
        and "status" in ('pending', 'running')
        and "requestSummary"->'input'->>'outputDirectory' = ${outputDirectory}
      order by "createdAt" desc
      limit 1
    `;
    return rows[0]?.id;
  });
  if (!taskId) return null;
  try {
    return await cancelGenerationTask(userId, role, taskId);
  } finally {
    pendingTaskCancellations.delete(cancellationKey);
  }
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
