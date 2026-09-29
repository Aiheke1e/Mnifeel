import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const maxGrantCredits = 1_000_000_000;
const inputSchema = z.object({
  userId: z.uuid(),
  amount: z.number().int().positive().max(maxGrantCredits),
});

export default Router().post("/", validateFields(inputSchema.shape), async (req, res) => {
  const input = inputSchema.parse(req.body);
  const adminUserId = getAuth(res).user.id;
  const account = await u.database.getDatabase().begin(async transaction => {
    const users = await transaction`
      select "id" from "users" where "id" = ${input.userId} and "role" = 'user' limit 1 for update
    `;
    if (!users.length) throw Object.assign(new Error("用户不存在"), { status: 404 });
    const rows = await transaction<{ availableCredits: string | number; frozenCredits: string | number }[]>`
      update "creditAccounts" set "availableCredits" = "availableCredits" + ${input.amount}, "updatedAt" = now()
      where "userId" = ${input.userId}
        and "availableCredits" <= ${Number.MAX_SAFE_INTEGER - input.amount}
      returning "availableCredits", "frozenCredits"
    `;
    const updated = rows[0];
    if (!updated) throw Object.assign(new Error("赠送后积分超过系统上限"), { status: 400 });
    await transaction`
      insert into "creditTransactions" (
        "id", "userId", "type", "availableDelta", "frozenDelta", "availableAfter",
        "frozenAfter", "createdByAdminId", "metadata"
      ) values (
        ${randomUUID()}, ${input.userId}, 'adminGrant', ${input.amount}, 0, ${updated.availableCredits},
        ${updated.frozenCredits}, ${adminUserId}, ${transaction.json({ amount: input.amount })}
      )
    `;
    await u.audit.writeAudit({
      adminUserId,
      action: "creditsGranted",
      targetType: "user",
      targetId: input.userId,
      details: { amount: input.amount, availableCredits: Number(updated.availableCredits) },
      database: transaction,
    });
    return {
      availableCredits: Number(updated.availableCredits),
      frozenCredits: Number(updated.frozenCredits),
    };
  });
  res.set("Cache-Control", "no-store").json(success(account));
});
