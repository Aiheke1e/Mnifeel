import { lstat, rm, rmdir } from "node:fs/promises";
import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const router = Router();

export default router.delete("/", validateFields({ projectId: z.uuid(), path: z.string().max(4096), recursive: z.boolean().optional() }), async (req, res) => {
  const { directory, path, relativePath } = await u.workspaceFile.resolveProjectWorkspaceFile(getAuth(res).user.id, req.body.projectId, req.body.path);
  u.workspaceFile.protectWorkspaceRoot(directory, path);
  const release = u.workspaceFile.lockWorkspaceFiles([path]);
  try {
    if ((await lstat(path)).isDirectory() && req.body.recursive !== true) await rmdir(path);
    else await rm(path, { recursive: req.body.recursive === true });
    await u.projects.removeProjectAssets(req.body.projectId, relativePath);
  } finally { release(); }
  res.json(success());
});
