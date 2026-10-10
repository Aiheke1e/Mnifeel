import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const clipSchema = z.object({
  order: z.number().int().positive().max(9999),
  path: z.string().min(1).max(4096),
  fingerprint: z.string().min(8).max(200),
});
const inputSchema = z.object({
  projectId: z.uuid(),
  clips: z.array(clipSchema).min(1).max(200),
});

export default Router().post("/", validateFields(inputSchema.shape), async (req, res) => {
  const auth = getAuth(res);
  const input = inputSchema.parse(req.body);
  const task = await u.render.createRenderTask(auth.user.id, input.projectId, input.clips);
  res.set("Cache-Control", "no-store").json(success(task));
});
