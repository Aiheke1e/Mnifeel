import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({
  projectId: z.uuid(),
  modelId: z.uuid(),
  request: z.record(z.string(), z.json()),
});

export default Router().post("/", validateFields(inputSchema.shape), async (req, res) => {
  const estimate = await u.generation.estimateGenerationTask(getAuth(res).user.id, inputSchema.parse(req.body));
  res.set("Cache-Control", "no-store").json(success(estimate));
});
