import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({
  legacyId: z.string().min(20).max(128),
  name: z.string().trim().min(1).max(120),
});

export default Router().post("/", validateFields(inputSchema.shape), async (req, res) => {
  const input = inputSchema.parse(req.body);
  const controller = new AbortController();
  const cancel = () => {
    if (!res.writableEnded) controller.abort(new Error("旧项目导入已取消"));
  };
  res.once("close", cancel);
  try {
    const project = await u.projects.importLegacyProject(getAuth(res).user.id, input.legacyId, input.name, controller.signal);
    res.status(201).json(success(project, "旧项目已复制导入"));
  } finally {
    res.off("close", cancel);
  }
});
