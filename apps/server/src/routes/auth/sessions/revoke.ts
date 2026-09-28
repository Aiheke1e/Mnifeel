import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { error, success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({ sessionId: z.uuid() });

export default Router().delete("/", validateFields(inputSchema.shape), async (req, res) => {
  const auth = getAuth(res);
  const { sessionId } = inputSchema.parse(req.body);
  if (!await u.auth.revokeSession(sessionId, auth.user.id)) {
    res.status(404).json(error("会话不存在", null, 404));
    return;
  }
  if (sessionId === auth.sessionId) u.auth.clearSessionCookie(res);
  if (auth.user.role === "admin") {
    await u.audit.writeAudit({ adminUserId: auth.user.id, action: "adminSessionRevoked", targetType: "session", targetId: sessionId });
  }
  res.json(success());
});
