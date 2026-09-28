import { Router } from "express";
import { getAuth } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().post("/", async (_req, res) => {
  const auth = getAuth(res);
  await u.auth.revokeSession(auth.sessionId, auth.user.id);
  u.auth.clearSessionCookie(res);
  if (auth.user.role === "admin") {
    await u.audit.writeAudit({ adminUserId: auth.user.id, action: "adminLogout", targetType: "session", targetId: auth.sessionId });
  }
  res.json(success());
});
