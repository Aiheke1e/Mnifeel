import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { error, success } from "@/lib/responseFormat";

const router = Router();
const maxBytes = 20 * 1024 * 1024;

export default router.post("/", validateFields({
  fileName: z.string().max(128).optional(),
  base64: z.string().min(1).max(Math.ceil(maxBytes / 3) * 4).base64().optional(),
  force: z.boolean().optional(),
}), async (req, res) => {
  if (!u.workspace.isLocalWorkspaceRequest(req)) return res.status(403).json(error("请在服务器本机管理后台安装技能", null, 403));
  const { fileName, base64, force } = req.body as { fileName?: string; base64?: string; force?: boolean };
  if (fileName === undefined || base64 === undefined) return res.status(400).json(error("请选择本地技能文件", null, 400));
  const result = await u.pluginInstall.installSkill(fileName, Buffer.from(base64, "base64"), force);
  res.json(success(result, "技能已安装"));
});
