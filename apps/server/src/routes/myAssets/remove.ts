import { lstat, rmdir, unlink } from "node:fs/promises";
import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().delete("/", validateFields({ path: z.string().min(1).max(4096) }), async (req, res) => {
  const root = await u.assets.getUserAssetsDirectory(getAuth(res).user.id);
  const target = await u.workspaceFile.resolveWorkspacePath(root, req.body.path);
  u.workspaceFile.protectWorkspaceRoot(target.directory, target.path);
  const release = u.workspaceFile.lockWorkspaceFiles([target.path]);
  try {
    if ((await lstat(target.path)).isDirectory()) await rmdir(target.path);
    else await unlink(target.path);
  } finally { release(); }
  res.json(success());
});
