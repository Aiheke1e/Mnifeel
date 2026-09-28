import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().delete("/", validateFields({
  projectId: z.uuid(),
  sessionFile: z.string().regex(/^[\w-]+\.jsonl$/),
  entryIds: z.array(z.string().min(1).max(128)).min(1).max(1000).optional(),
  replyTo: z.string().min(1).max(128).optional(),
}), async (req, res) => {
  const { projectId, sessionFile, entryIds, replyTo } = req.body as {
    projectId: string; sessionFile: string; entryIds?: string[]; replyTo?: string;
  };
  const { directory: cwd, path } = await u.workspaceFile.resolveProjectWorkspaceFile(getAuth(res).user.id, projectId, `.agent/sessions/${sessionFile}`);
  res.set("Cache-Control", "no-store").json(success(await u.agent.deleteAgentMessage(cwd, path, { entryIds, replyTo })));
});
