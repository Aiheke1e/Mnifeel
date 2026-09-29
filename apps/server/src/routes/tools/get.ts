import { Router } from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
import { getAuth } from "@/lib/middleware";

const router = Router();

export default router.get("/", async (req, res) => {
  const canManage = getAuth(res).user.role === "admin" && u.workspace.isLocalWorkspaceRequest(req);
  const tools = await u.plugins.listTools();
  res.json(success({ tools: canManage ? tools : tools.map(tool => ({ ...tool, config: {} })), canManage }));
});
