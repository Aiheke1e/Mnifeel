import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const router = Router();

export default router.post("/", validateFields({ projectId: z.uuid(), path: z.string().max(4096), target: z.string().min(1).max(4096) }), async (req, res) => {
  const source = await u.workspaceFile.resolveProjectWorkspaceFile(getAuth(res).user.id, req.body.projectId, req.body.path);
  const target = await u.workspaceFile.resolveWorkspacePath(source.directory, req.body.target);
  u.workspaceFile.protectWorkspaceRoot(source.directory, source.path);
  u.workspaceFile.protectWorkspaceRoot(target.directory, target.path);
  const release = u.workspaceFile.lockWorkspaceFiles([source.path, target.path]);
  try {
    await u.workspaceFile.renameWorkspaceFile(source.path, target.path);
    await u.projects.renameProjectAssets(req.body.projectId, source.relativePath, target.relativePath);
  }
  finally { release(); }
  res.json(success());
});
