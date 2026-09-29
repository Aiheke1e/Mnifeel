import { lstat } from "node:fs/promises";
import { basename } from "node:path";
import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { getAuth, validateFields } from "@/lib/middleware";

export default Router().get("/", validateFields({ path: z.string().min(1).max(4096), download: z.literal("true").optional() }, "query"), async (req, res, next) => {
  const root = await u.assets.getUserAssetsDirectory(getAuth(res).user.id);
  const target = await u.workspaceFile.resolveWorkspacePath(root, req.query.path as string);
  u.workspaceFile.protectWorkspaceRoot(target.directory, target.path);
  if (!(await lstat(target.path)).isFile()) throw Object.assign(new Error("只能读取文件"), { status: 400 });
  if (req.query.download === "true") res.attachment(basename(target.path));
  res.set({ "Cache-Control": "no-store", "Content-Security-Policy": "sandbox", "X-Content-Type-Options": "nosniff" })
    .sendFile(target.path, { dotfiles: "allow" }, error => { if (error) next(error); });
});
