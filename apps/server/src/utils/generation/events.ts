import type { TaskStatus } from "@/utils/database/types";

export type GenerationEvent = {
  taskId: string;
  status: TaskStatus;
  progress: number;
  result?: unknown;
  actualCredits?: number;
  refundedCredits?: number;
  errorMessage?: string;
  output?: { type: "text" | "reasoning"; delta: string };
};

type Listener = (event: GenerationEvent) => void;
const listeners = new Map<string, Set<Listener>>();

export function publishGenerationEvent(event: GenerationEvent) {
  for (const listener of listeners.get(event.taskId) ?? []) {
    try { listener(event); }
    catch { /* 已断开的 SSE 连接由路由清理，不能反向破坏任务事务。 */ }
  }
}

export function subscribeGenerationEvent(taskId: string, listener: Listener) {
  const taskListeners = listeners.get(taskId) ?? new Set<Listener>();
  taskListeners.add(listener);
  listeners.set(taskId, taskListeners);
  return () => {
    taskListeners.delete(listener);
    if (!taskListeners.size) listeners.delete(taskId);
  };
}
