import { mkdir } from "node:fs/promises";
import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const router = Router();

export default router.post("/", validateFields({ projectId: z.uuid(), path: z.string().max(4096) }), async (req, res) => {
  const { directory, path } = await u.workspaceFile.resolveProjectWorkspaceFile(getAuth(res).user.id, req.body.projectId, req.body.path);
  u.workspaceFile.protectWorkspaceRoot(directory, path);
  const release = u.workspaceFile.lockWorkspaceFiles([path]);
  try {
    await mkdir(path);
    await u.projects.touchProject(req.body.projectId);
  }
  finally { release(); }
  res.json(success());
});
