import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const router = Router();

export default router.put("/", validateFields({ projectId: z.uuid(), path: z.string().max(4096), exclusive: z.enum(["true", "false"]).optional() }, "query"), async (req, res) => {
  if (!req.is("application/octet-stream") || (req.body !== undefined && !Buffer.isBuffer(req.body))) {
    throw Object.assign(new Error("请发送文件原始内容"), { status: 400 });
  }
  const projectId = req.query.projectId as string;
  const { directory, path, relativePath } = await u.workspaceFile.resolveProjectWorkspaceFile(getAuth(res).user.id, projectId, req.query.path as string);
  u.workspaceFile.protectWorkspaceRoot(directory, path);
  const release = u.workspaceFile.lockWorkspaceFiles([path]);
  try {
    await u.workspaceFile.writeWorkspaceFile(path, req.body ?? Buffer.alloc(0), req.query.exclusive === "true");
    await u.projects.indexProjectAsset(projectId, relativePath, path);
  }
  finally { release(); }
  res.json(success());
});
