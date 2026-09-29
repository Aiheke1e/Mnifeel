import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { error, success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({
  fileName: z.string().max(128).optional(),
  base64: z.string().min(1).max(Math.ceil(20 * 1024 * 1024 / 3) * 4).base64().optional(),
  force: z.boolean().optional(),
}), async (req, res) => {
  if (!u.workspace.isLocalWorkspaceRequest(req)) return res.status(403).json(error("请在服务器本机管理后台安装团队", null, 403));
  const { fileName, base64, force } = req.body as { fileName?: string; base64?: string; force?: boolean };
  if (fileName === undefined || base64 === undefined) return res.status(400).json(error("请选择本地团队文件", null, 400));
  const result = await u.teams.installTeam(fileName, Buffer.from(base64, "base64"), force);
  res.json(success(result, "团队已安装"));
});
