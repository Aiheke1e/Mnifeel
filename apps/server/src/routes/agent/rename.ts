import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().patch("/", validateFields({
  projectId: z.uuid(),
  sessionFile: z.string().regex(/^[\w-]+\.jsonl$/),
  name: z.string().trim().min(1).max(80),
}), async (req, res) => {
  const { projectId, sessionFile, name } = req.body as { projectId: string; sessionFile: string; name: string };
  const { directory: cwd, path } = await u.workspaceFile.resolveProjectWorkspaceFile(getAuth(res).user.id, projectId, `.agent/sessions/${sessionFile}`);
  res.json(success(await u.agent.renameAgentSession(cwd, path, name.trim())));
});
