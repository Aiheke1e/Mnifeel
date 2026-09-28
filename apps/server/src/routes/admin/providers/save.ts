import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({
  type: z.enum(["deepSeek", "agnes", "bananaPro"]),
  displayName: z.string().trim().min(1).max(120),
  baseUrl: z.url({ protocol: /^https?$/ }).max(2048),
  enabled: z.boolean(),
  apiKey: z.string().trim().min(1).max(8192).optional(),
});

export default Router().put("/", validateFields(inputSchema.shape), async (req, res) => {
  res.set("Cache-Control", "no-store").json(success(
    await u.providers.saveProvider(getAuth(res).user.id, inputSchema.parse(req.body)),
  ));
});
