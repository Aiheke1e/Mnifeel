import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().get("/", validateFields({ projectId: z.uuid() }, "query"), async (req, res) => {
  const cwd = await u.projects.resolveProjectWorkspace(getAuth(res).user.id, req.query.projectId as string);
  res.set("Cache-Control", "no-store");
  try {
    const { path } = await u.workspaceFile.resolveWorkspacePath(cwd, ".agent/sessions");
    res.json(success(await u.agent.listAgentSessions(cwd, path)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    res.json(success([]));
  }
});
