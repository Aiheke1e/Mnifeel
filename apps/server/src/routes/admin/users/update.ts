import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({
  userId: z.uuid(),
  status: z.enum(["active", "disabled"]).optional(),
  isWhitelist: z.boolean().optional(),
}).refine(input => input.status !== undefined || input.isWhitelist !== undefined, "没有可保存的用户设置");

export default Router().put("/", validateFields(inputSchema.shape), async (req, res) => {
  const input = inputSchema.parse(req.body);
  const saved = await u.database.getDatabase().begin(async transaction => {
    const rows = await transaction<{ status: "active" | "disabled"; isWhitelist: boolean }[]>`
      select "status", "isWhitelist" from "users"
      where "id" = ${input.userId} and "role" = 'user' limit 1 for update
    `;
    const current = rows[0];
    if (!current) throw Object.assign(new Error("用户不存在"), { status: 404 });
    const status = input.status ?? current.status;
    const isWhitelist = input.isWhitelist ?? current.isWhitelist;
    const result = await transaction<{ id: string; status: string; isWhitelist: boolean; updatedAt: Date }[]>`
      update "users" set "status" = ${status}, "isWhitelist" = ${isWhitelist}, "updatedAt" = now()
      where "id" = ${input.userId}
      returning "id", "status", "isWhitelist", "updatedAt"
    `;
    if (status === "disabled") {
      await transaction`
        update "userSessions" set "revokedAt" = now()
        where "userId" = ${input.userId} and "revokedAt" is null
      `;
    }
    await u.audit.writeAudit({
      adminUserId: getAuth(res).user.id,
      action: "userUpdated",
      targetType: "user",
      targetId: input.userId,
      details: { status, isWhitelist },
      database: transaction,
    });
    return result[0]!;
  });
  res.set("Cache-Control", "no-store").json(success(saved));
});
