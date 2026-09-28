import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().get("/", validateFields({
  projectId: z.uuid(), sessionFile: z.string().regex(/^[\w-]+\.jsonl$/),
}, "query"), async (req, res) => {
  const { projectId, sessionFile } = req.query as { projectId: string; sessionFile: string };
  const { directory: cwd, path } = await u.workspaceFile.resolveProjectWorkspaceFile(getAuth(res).user.id, projectId, `.agent/sessions/${sessionFile}`);
  res.set("Cache-Control", "no-store").json(success(await u.agent.getAgentSession(cwd, path)));
});
