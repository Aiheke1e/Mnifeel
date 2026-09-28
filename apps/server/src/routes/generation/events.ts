import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import u from "@/utils";
import type { GenerationEvent } from "@/utils/generation";

export default Router().get("/", validateFields({ taskId: z.uuid() }, "query"), async (req, res) => {
  const taskId = req.query.taskId as string;
  const auth = getAuth(res);
  await u.generation.getGenerationTask(auth.user.id, auth.user.role, taskId);
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  let ready = false;
  const queued: GenerationEvent[] = [];
  const unsubscribe = u.generation.subscribeGenerationEvent(taskId, event => {
    if (!ready) queued.push(event);
    else if (!res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const socket = req.socket;
  const close = () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.off("close", close);
    socket.off("close", close);
  };
  res.once("close", close);
  socket.once("close", close);
  const task = await u.generation.getGenerationTask(auth.user.id, auth.user.role, taskId).catch(error => {
    close();
    throw error;
  });
  if (res.destroyed) {
    close();
    return;
  }
  res.write(`data: ${JSON.stringify({
    taskId: task.id,
    status: task.status,
    progress: task.progress,
    result: task.result,
    actualCredits: task.actualCredits,
    refundedCredits: task.refundedCredits,
    errorMessage: task.errorMessage,
  })}\n\n`);
  ready = true;
  let currentStatus = task.status;
  let currentProgress = task.progress;
  const statusOrder = { pending: 0, running: 1, succeeded: 2, failed: 2, cancelled: 2 };
  for (const event of queued) {
    const advancesStatus = statusOrder[event.status] > statusOrder[currentStatus];
    const advancesProgress = event.status === currentStatus && event.progress > currentProgress;
    if (!advancesStatus && !advancesProgress) continue;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    currentStatus = event.status;
    currentProgress = event.progress;
  }
  heartbeat = setInterval(() => {
    if (!res.destroyed) res.write(": keepalive\n\n");
  }, 20_000);
});
