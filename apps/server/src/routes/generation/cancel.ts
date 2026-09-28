import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({ taskId: z.uuid() });

export default Router().post("/", validateFields(inputSchema.shape), async (req, res) => {
  const auth = getAuth(res);
  const task = await u.generation.cancelGenerationTask(auth.user.id, auth.user.role, inputSchema.parse(req.body).taskId);
  res.set("Cache-Control", "no-store").json(success(task));
});
