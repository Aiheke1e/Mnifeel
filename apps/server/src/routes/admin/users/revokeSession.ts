import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({ userId: z.uuid(), sessionId: z.uuid() });

export default Router().post("/", validateFields(inputSchema.shape), async (req, res) => {
  const input = inputSchema.parse(req.body);
  await u.database.getDatabase().begin(async transaction => {
    const sessions = await transaction`
      update "userSessions" set "revokedAt" = now()
      where "id" = ${input.sessionId} and "userId" = ${input.userId}
        and "revokedAt" is null and "expiresAt" > now()
      returning "id"
    `;
    if (!sessions.length) throw Object.assign(new Error("有效会话不存在"), { status: 404 });
    await u.audit.writeAudit({
      adminUserId: getAuth(res).user.id,
      action: "userSessionRevoked",
      targetType: "session",
      targetId: input.sessionId,
      details: { userId: input.userId },
      database: transaction,
    });
  });
  res.set("Cache-Control", "no-store").json(success(null));
});
