import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().get("/", validateFields({ taskId: z.uuid() }, "query"), async (req, res) => {
  const auth = getAuth(res);
  const task = await u.generation.getGenerationTask(auth.user.id, auth.user.role, req.query.taskId as string);
  res.set("Cache-Control", "no-store").json(success(task));
});
