import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({
  projectId: z.uuid(),
  modelId: z.uuid(),
  idempotencyKey: z.string().trim().min(8).max(160),
  request: z.record(z.string(), z.json()),
  // ACT: 已确认指纹；缺失时沿用高级画布的无指纹行为。
  expectedFingerprint: z.string().trim().min(8).max(200).optional(),
});

export default Router().post("/", validateFields(inputSchema.shape), async (req, res) => {
  const result = await u.generation.createGenerationTask(getAuth(res).user.id, inputSchema.parse(req.body));
  res.status(result.created ? 201 : 200).set("Cache-Control", "no-store").json(success(result));
});
