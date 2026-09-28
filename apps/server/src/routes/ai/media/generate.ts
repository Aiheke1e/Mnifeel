import { Router } from "express";
import { z } from "zod";
import { imageGenerationSchema, videoGenerationSchema } from "@minifeel/tool-media-generation/runtime";
import { getAuth, validateFields } from "@/lib/middleware";
import { success, error } from "@/lib/responseFormat";
import u from "@/utils";
import { redactErrorMessage } from "@/utils/providers/redact";

export default Router().post("/", validateFields({
  projectId: z.uuid(), mediaType: z.enum(["image", "video"]),
  requestId: z.string().trim().min(8).max(150).optional(),
}), async (req, res) => {
  const { projectId, mediaType, requestId, ...request } = req.body;
  const parsed = (mediaType === "image" ? imageGenerationSchema : videoGenerationSchema).safeParse(request);
  if (!parsed.success) {
    res.status(400).json(error("参数错误", parsed.error.issues, 400));
    return;
  }
  if (parsed.data.providerId !== "managed") {
    res.status(400).json(error("所选媒体模型与供应商不匹配", null, 400));
    return;
  }
  const auth = getAuth(res);
  const controller = new AbortController();
  let taskId: string | undefined;
  const close = () => controller.abort();
  const cancel = () => {
    if (taskId) void u.generation.cancelGenerationTask(auth.user.id, auth.user.role, taskId).catch(() => undefined);
  };
  res.once("close", close);
  req.once("aborted", close);
  req.socket.once("close", close);
  controller.signal.addEventListener("abort", cancel, { once: true });
  try {
    const created = await u.generation.createGenerationTask(auth.user.id, {
      projectId,
      modelId: parsed.data.modelId,
      request: parsed.data,
      idempotencyKey: requestId ? `media:${requestId}` : crypto.randomUUID(),
    }, { external: true });
    taskId = created.task.id;
    res.set({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Expose-Headers": "X-Minifeel-Task-Id",
      "X-Minifeel-Task-Id": created.task.id,
    });
    res.flushHeaders();
    if (controller.signal.aborted) await u.generation.cancelGenerationTask(auth.user.id, auth.user.role, created.task.id);
    else if (created.created) await u.generation.executeGenerationTask(created.task.id, controller.signal);
    const task = await u.generation.waitGenerationTask(auth.user.id, auth.user.role, created.task.id, controller.signal);
    if (task.status !== "succeeded") {
      throw Object.assign(new Error(task.errorMessage || (task.status === "cancelled" ? "生成已取消" : "生成失败")), { status: 409 });
    }
    const result = task.result as { files?: unknown } | null;
    if (!Array.isArray(result?.files)) throw new Error("媒体任务结果不完整");
    if (!res.destroyed) res.end(JSON.stringify(success(result.files)));
  } catch (reason) {
    if (!res.headersSent) throw reason;
    if (!res.destroyed) {
      const status = (reason as { status?: number } | null)?.status ?? 500;
      res.end(JSON.stringify(error(redactErrorMessage(reason, "生成失败"), null, status)));
    }
  } finally {
    res.off("close", close);
    req.off("aborted", close);
    req.socket.off("close", close);
    controller.signal.removeEventListener("abort", cancel);
  }
});
