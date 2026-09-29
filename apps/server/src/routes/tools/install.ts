import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { error, success } from "@/lib/responseFormat";

const router = Router();
const maxBytes = 20 * 1024 * 1024;

export default router.post("/", validateFields({
  fileName: z.string().max(104).regex(/^[a-z][a-zA-Z0-9]*\.tool\.js$/).optional(),
  source: z.string().min(1).max(maxBytes).optional(),
  force: z.boolean().optional(),
}), async (req, res) => {
  if (!u.workspace.isLocalWorkspaceRequest(req)) return res.status(403).json(error("请在服务器本机管理后台管理工具", null, 403));
  const { fileName, source, force } = req.body as { fileName?: string; source?: string; force?: boolean };
  if (fileName === undefined || source === undefined) return res.status(400).json(error("请选择本地工具文件", null, 400));
  const result = await u.pluginInstall.installTool(fileName, source, force);
  res.json(success(result, "工具已安装"));
});
