import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const querySchema = z.object({
  projectId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export default Router().get("/", validateFields(querySchema.shape, "query"), async (req, res) => {
  const tasks = await u.render.listRenderTasks(getAuth(res).user.id, querySchema.parse(req.query));
  res.set("Cache-Control", "no-store").json(success(tasks));
});
