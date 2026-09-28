import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({ projectId: z.uuid(), name: z.string().trim().min(1).max(120) });

export default Router().put("/", validateFields(inputSchema.shape), async (req, res) => {
  const input = inputSchema.parse(req.body);
  res.json(success(await u.projects.updateProject(getAuth(res).user.id, input.projectId, input.name)));
});
