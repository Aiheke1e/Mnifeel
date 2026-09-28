import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const router = Router();

export default router.get("/", validateFields({ projectId: z.uuid(), path: z.string().max(4096).optional() }, "query"), async (req, res) => {
  const projectId = req.query.projectId as string;
  const { directory, path } = await u.workspaceFile.resolveProjectWorkspaceFile(getAuth(res).user.id, projectId, (req.query.path as string | undefined) ?? "");
  const entries = await readdir(path, { withFileTypes: true });
  res.set("Cache-Control", "no-store").json(success({
    projectId,
    empty: entries.length === 0,
    entries: entries.filter(entry => entry.isFile() || entry.isDirectory()).map(entry => ({
      name: entry.name, path: relative(directory, join(path, entry.name)).split(sep).join("/"), type: entry.isDirectory() ? "directory" : "file",
    })).sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true })),
  }));
});
