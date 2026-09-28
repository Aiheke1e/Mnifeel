import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({
  modelId: z.uuid(),
  displayName: z.string().trim().min(1).max(160),
  mediaType: z.enum(["text", "image", "video"]),
  enabled: z.boolean(),
  isDefault: z.boolean(),
  capabilities: z.record(z.string(), z.json()),
  pricing: z.record(z.string(), z.number().int().nonnegative()),
});

export default Router().put("/", validateFields(inputSchema.shape), async (req, res) => {
  res.set("Cache-Control", "no-store").json(success(
    await u.providers.saveModel(getAuth(res).user.id, inputSchema.parse(req.body)),
  ));
});
