import type postgres from "postgres";
import { getDatabase } from "@/utils/database";
import type { MediaType, TaskStatus } from "@/utils/database/types";
import { refundTaskCredits, settleTaskCredits } from "@/utils/billing";
import { calculateCredits, type GenerationUsage, type Pricing } from "@/utils/billing/pricing";
import { publishGenerationEvent } from "@/utils/generation/events";
import { redactErrorMessage, redactSecretFields } from "@/utils/providers/redact";

type BillingSnapshot = {
  pricing: Pricing;
  estimatedUsage: GenerationUsage;
  billable: boolean;
};

type TaskSummary = {
  input: Record<string, unknown>;
  billing: BillingSnapshot;
};

type WorkerTaskRow = {
  id: string;
  userId: string;
  projectId: string;
  modelId: string;
  taskType: MediaType;
  status: TaskStatus;
  requestSummary: TaskSummary;
  result: unknown;
  providerTaskId: string | null;
  progress: number;
  frozenCredits: number;
  actualCredits: number;
  refundedCredits: number;
  errorCode: string | null;
  errorMessage: string | null;
};

export type GenerationExecutionTask = Pick<WorkerTaskRow, "id" | "userId" | "projectId" | "modelId" | "taskType"> & {
  input: Record<string, unknown>;
  estimatedUsage: GenerationUsage;
};

export type GenerationExecutionResult = {
  result: unknown;
  usage: GenerationUsage;
};

export type GenerationExecutionContext = {
  signal: AbortSignal;
  updateProgress(progress: number): Promise<void>;
  setProviderTaskId(providerTaskId: string): Promise<void>;
};

export type GenerationExecutor = (
  task: GenerationExecutionTask,
  context: GenerationExecutionContext,
) => Promise<GenerationExecutionResult>;

const executors = new Map<MediaType, GenerationExecutor>();
const activeTasks = new Map<string, { controller: AbortController; promise: Promise<void> }>();
let pollingTimer: ReturnType<typeof setInterval> | undefined;
let recoveryTimer: ReturnType<typeof setInterval> | undefined;
let workerStarted = false;
let pumping: Promise<void> | undefined;
let recovering: Promise<number> | undefined;

function workerConcurrency() {
  const value = Number(process.env.MINIFEEL_GENERATION_CONCURRENCY ?? 4);
  return Number.isInteger(value) && value >= 1 && value <= 32 ? value : 4;
}

function staleSeconds() {
  const value = Number(process.env.MINIFEEL_GENERATION_STALE_SECONDS ?? 120);
  return Number.isInteger(value) && value >= 30 && value <= 3600 ? value : 120;
}

function asNumber(value: number) {
  return Number(value);
}

function eventFromTask(task: WorkerTaskRow) {
  return {
    taskId: task.id,
    status: task.status,
    progress: task.progress,
    result: task.result ?? undefined,
    actualCredits: asNumber(task.actualCredits),
    refundedCredits: asNumber(task.refundedCredits),
    errorMessage: task.errorMessage ?? undefined,
  };
}

async function claimTask() {
  const types = [...executors.keys()];
  if (!types.length) return;
  return getDatabase().begin(async transaction => {
    const rows = await transaction<WorkerTaskRow[]>`
      select * from "generationTasks"
      where "status" = 'pending' and "taskType" in ${transaction(types)}
      order by "createdAt", "id"
      limit 1 for update skip locked
    `;
    const task = rows[0];
    if (!task) return;
    const claimed = await transaction<WorkerTaskRow[]>`
      update "generationTasks" set
        "status" = 'running', "startedAt" = coalesce("startedAt", now()),
        "heartbeatAt" = now(), "progress" = greatest("progress", 1)
      where "id" = ${task.id} and "status" = 'pending'
      returning *
    `;
    return claimed[0];
  });
}

async function updateProgress(taskId: string, progress: number) {
  const value = Math.max(1, Math.min(99, Math.floor(progress)));
  const rows = await getDatabase()<WorkerTaskRow[]>`
    update "generationTasks" set "progress" = ${value}, "heartbeatAt" = now()
    where "id" = ${taskId} and "status" = 'running' and "progress" < ${value}
    returning *
  `;
  if (rows[0]) publishGenerationEvent(eventFromTask(rows[0]));
}

async function setProviderTaskId(taskId: string, providerTaskId: string) {
  const safeId = providerTaskId.trim().slice(0, 1000);
  if (!safeId) throw new Error("供应商任务 ID 不能为空");
  await getDatabase()`
    update "generationTasks" set "providerTaskId" = ${safeId}, "heartbeatAt" = now()
    where "id" = ${taskId} and "status" = 'running'
  `;
}

async function completeTask(taskId: string, execution: GenerationExecutionResult) {
  const task = await getDatabase().begin(async transaction => {
    const rows = await transaction<WorkerTaskRow[]>`
      select * from "generationTasks" where "id" = ${taskId} limit 1 for update
    `;
    const current = rows[0];
    if (!current || current.status !== "running") return current;
    const summary = current.requestSummary;
    const actualCredits = summary.billing.billable
      ? calculateCredits(current.taskType, summary.billing.pricing, execution.usage)
      : 0;
    const settled = await settleTaskCredits(transaction, {
      id: current.id,
      userId: current.userId,
      frozenCredits: asNumber(current.frozenCredits),
    }, actualCredits);
    const result = redactSecretFields(execution.result) as postgres.JSONValue;
    const updated = await transaction<WorkerTaskRow[]>`
      update "generationTasks" set
        "status" = 'succeeded', "result" = ${transaction.json(result)}, "progress" = 100,
        "actualCredits" = ${settled.actualCredits}, "refundedCredits" = ${settled.refundedCredits},
        "heartbeatAt" = now(), "completedAt" = now(), "errorCode" = null, "errorMessage" = null
      where "id" = ${current.id}
      returning *
    `;
    return updated[0];
  });
  if (task) publishGenerationEvent(eventFromTask(task));
}

async function failTask(taskId: string, reason: unknown, code = "generationFailed") {
  const task = await getDatabase().begin(async transaction => {
    const rows = await transaction<WorkerTaskRow[]>`
      select * from "generationTasks" where "id" = ${taskId} limit 1 for update
    `;
    const current = rows[0];
    if (!current || current.status !== "running") return current;
    const refundedCredits = await refundTaskCredits(transaction, {
      id: current.id,
      userId: current.userId,
      frozenCredits: asNumber(current.frozenCredits),
    });
    const updated = await transaction<WorkerTaskRow[]>`
      update "generationTasks" set
        "status" = 'failed', "refundedCredits" = ${refundedCredits}, "heartbeatAt" = now(),
        "completedAt" = now(), "errorCode" = ${code.slice(0, 120)},
        "errorMessage" = ${redactErrorMessage(reason, "生成失败").slice(0, 2000)}
      where "id" = ${current.id}
      returning *
    `;
    return updated[0];
  });
  if (task) publishGenerationEvent(eventFromTask(task));
}

async function executeTask(task: WorkerTaskRow, controller: AbortController) {
  const executor = executors.get(task.taskType);
  if (!executor) {
    await failTask(task.id, new Error("任务执行器不可用"), "executorUnavailable");
    return;
  }
  publishGenerationEvent(eventFromTask(task));
  const heartbeat = setInterval(() => {
    void getDatabase()`
      update "generationTasks" set "heartbeatAt" = now()
      where "id" = ${task.id} and "status" = 'running'
    `.catch(() => undefined);
  }, 10_000);
  heartbeat.unref?.();
  try {
    const summary = task.requestSummary;
    const execution = await executor({
      id: task.id,
      userId: task.userId,
      projectId: task.projectId,
      modelId: task.modelId,
      taskType: task.taskType,
      input: summary.input,
      estimatedUsage: summary.billing.estimatedUsage,
    }, {
      signal: controller.signal,
      updateProgress: progress => updateProgress(task.id, progress),
      setProviderTaskId: providerTaskId => setProviderTaskId(task.id, providerTaskId),
    });
    await completeTask(task.id, execution);
  } catch (reason) {
    await failTask(task.id, reason, controller.signal.aborted ? "generationAborted" : "generationFailed");
  } finally {
    clearInterval(heartbeat);
  }
}

function pump() {
  if (!workerStarted) return Promise.resolve();
  if (pumping) return pumping;
  pumping = (async () => {
    while (workerStarted && activeTasks.size < workerConcurrency()) {
      const task = await claimTask();
      if (!task) break;
      const controller = new AbortController();
      const active = { controller, promise: Promise.resolve() };
      activeTasks.set(task.id, active);
      const promise = executeTask(task, controller).finally(() => {
        activeTasks.delete(task.id);
        void pump();
      });
      active.promise = promise;
    }
  })().finally(() => { pumping = undefined; });
  return pumping;
}

export function registerGenerationExecutor(taskType: MediaType, executor: GenerationExecutor) {
  executors.set(taskType, executor);
  void pump();
}

export function unregisterGenerationExecutor(taskType: MediaType) {
  executors.delete(taskType);
}

export function abortGenerationTask(taskId: string) {
  activeTasks.get(taskId)?.controller.abort(new DOMException("任务已取消", "AbortError"));
}

export function wakeGenerationWorker() {
  void pump();
}

export function recoverStaleGenerationTasks() {
  if (recovering) return recovering;
  recovering = (async () => {
    const recovered = await getDatabase().begin(async transaction => {
      const rows = await transaction<WorkerTaskRow[]>`
        select * from "generationTasks"
        where "status" = 'running'
          and ("heartbeatAt" is null or "heartbeatAt" < now() - ${staleSeconds()} * interval '1 second')
        order by "createdAt" for update skip locked
      `;
      const tasks: WorkerTaskRow[] = [];
      for (const current of rows) {
        // 当前进程仍持有执行上下文时继续依赖心跳和 AbortSignal，只回收真正失联的任务。
        if (activeTasks.has(current.id)) continue;
        const refundedCredits = await refundTaskCredits(transaction, {
          id: current.id,
          userId: current.userId,
          frozenCredits: asNumber(current.frozenCredits),
        });
        const updated = await transaction<WorkerTaskRow[]>`
          update "generationTasks" set
            "status" = 'failed', "refundedCredits" = ${refundedCredits}, "completedAt" = now(),
            "errorCode" = 'workerHeartbeatTimeout', "errorMessage" = '任务因服务中断未完成，冻结积分已退回'
          where "id" = ${current.id} and "status" = 'running'
          returning *
        `;
        if (updated[0]) tasks.push(updated[0]);
      }
      return tasks;
    });
    for (const task of recovered) publishGenerationEvent(eventFromTask(task));
    return recovered.length;
  })().finally(() => { recovering = undefined; });
  return recovering;
}

export async function startGenerationWorker() {
  if (workerStarted) return;
  await recoverStaleGenerationTasks();
  workerStarted = true;
  pollingTimer = setInterval(() => void pump(), 500);
  pollingTimer.unref?.();
  recoveryTimer = setInterval(() => {
    void recoverStaleGenerationTasks().catch(error => console.error("恢复失联生成任务失败：", error));
  }, Math.min(30_000, staleSeconds() * 500));
  recoveryTimer.unref?.();
  await pump();
}

export async function stopGenerationWorker() {
  workerStarted = false;
  clearInterval(pollingTimer);
  clearInterval(recoveryTimer);
  pollingTimer = undefined;
  recoveryTimer = undefined;
  await pumping;
  await recovering;
  for (const active of activeTasks.values()) active.controller.abort(new Error("服务正在关闭"));
  await Promise.allSettled([...activeTasks.values()].map(active => active.promise));
}
