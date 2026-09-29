import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({ path: z.string().min(1).max(4096), target: z.string().min(1).max(4096) }), async (req, res) => {
  const userId = getAuth(res).user.id;
  const root = await u.assets.getUserAssetsDirectory(userId);
  const source = await u.workspaceFile.resolveWorkspacePath(root, req.body.path);
  const target = await u.workspaceFile.resolveWorkspacePath(root, req.body.target);
  u.workspaceFile.protectWorkspaceRoot(source.directory, source.path);
  u.workspaceFile.protectWorkspaceRoot(target.directory, target.path);
  const release = u.workspaceFile.lockWorkspaceFiles([source.path, target.path]);
  try {
    await u.workspaceFile.renameWorkspaceFile(source.path, target.path);
    await u.assets.moveAssetMetadata(userId, req.body.path, req.body.target);
  }
  finally { release(); }
  res.json(success());
});
