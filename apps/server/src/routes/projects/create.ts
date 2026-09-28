import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(4000).optional(),
  templateId: z.string().trim().min(1).max(120).optional(),
});

export default Router().post("/", validateFields(inputSchema.shape), async (req, res) => {
  const input = inputSchema.parse(req.body);
  const project = await u.projects.createProject(getAuth(res).user.id, input.name, input.description, input.templateId);
  res.status(201).json(success(project, "项目已创建"));
});
