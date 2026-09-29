import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({
  taskId: z.uuid().optional(),
  requestId: z.string().trim().min(8).max(150).optional(),
  projectId: z.uuid().optional(),
  outputDirectory: z.string().trim().min(1).max(1024).optional(),
}).refine(input => input.taskId || input.requestId || input.projectId && input.outputDirectory, "缺少任务标识");

export default Router().post("/", validateFields(inputSchema.shape), async (req, res) => {
  const auth = getAuth(res);
  const input = inputSchema.parse(req.body);
  let task = input.taskId
    ? await u.generation.cancelGenerationTask(auth.user.id, auth.user.role, input.taskId)
    : input.requestId
      ? await u.generation.cancelGenerationTaskByIdempotencyKey(auth.user.id, auth.user.role, `media:${input.requestId}`)
      : null;
  if (!task && input.projectId && input.outputDirectory) {
    task = await u.generation.cancelActiveGenerationTask(auth.user.id, auth.user.role, input.projectId, input.outputDirectory);
  }
  res.set("Cache-Control", "no-store").json(success(task));
});
