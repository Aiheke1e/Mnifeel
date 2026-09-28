import { lstat } from "node:fs/promises";
import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { getAuth, validateFields } from "@/lib/middleware";

const router = Router();

export default router.get("/", validateFields({ projectId: z.uuid(), path: z.string().max(4096) }, "query"), async (req, res, next) => {
  const { path } = await u.workspaceFile.resolveProjectWorkspaceFile(getAuth(res).user.id, req.query.projectId as string, req.query.path as string);
  if (!(await lstat(path)).isFile()) throw Object.assign(new Error("只能读取文件"), { status: 400 });
  res.set("Cache-Control", "no-store").sendFile(path, { dotfiles: "allow" }, err => { if (err) next(err); });
});
