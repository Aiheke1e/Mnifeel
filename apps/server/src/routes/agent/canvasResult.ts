import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({
  projectId: z.uuid(),
  callId: z.uuid(),
  result: z.json().optional(),
  error: z.string().min(1).max(8000).optional(),
});

export default Router().post("/", validateFields(inputSchema.shape), async (req, res) => {
  const { projectId, callId, ...response } = req.body as z.infer<typeof inputSchema>;
  const cwd = await u.projects.resolveProjectWorkspace(getAuth(res).user.id, projectId);
  u.canvas.finishCanvasCall(cwd, callId, response);
  res.json(success());
});
