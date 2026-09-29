import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().put("/", validateFields({ path: z.string().min(1).max(4096) }, "query"), async (req, res) => {
  if (!req.is("application/octet-stream") || (req.body !== undefined && !Buffer.isBuffer(req.body))) {
    throw Object.assign(new Error("请发送文件原始内容"), { status: 400 });
  }
  const root = await u.assets.getUserAssetsDirectory(getAuth(res).user.id);
  const target = await u.workspaceFile.resolveWorkspacePath(root, req.query.path as string);
  u.workspaceFile.protectWorkspaceRoot(target.directory, target.path);
  const release = u.workspaceFile.lockWorkspaceFiles([target.path]);
  try { await u.workspaceFile.writeWorkspaceFile(target.path, req.body ?? Buffer.alloc(0), true); }
  finally { release(); }
  res.json(success());
});
