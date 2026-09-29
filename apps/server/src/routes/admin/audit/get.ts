import { Router } from "express";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const querySchema = z.object({ action: z.string().trim().max(120).optional() });

export default Router().get("/", async (req, res) => {
  const query = querySchema.parse(req.query);
  const action = query.action ? `%${query.action}%` : undefined;
  const rows = await u.database.getDatabase()<{
    id: string; adminUserId: string; adminLabel: string | null; action: string;
    targetType: string | null; targetId: string | null; details: unknown; createdAt: Date;
  }[]>`
    select a."id", a."adminUserId",
      coalesce(
        (select i."identifier" from "userIdentities" i where i."userId" = a."adminUserId" and i."type" = 'phone' limit 1),
        (select i."identifier" from "userIdentities" i where i."userId" = a."adminUserId" and i."type" in ('mockGoogle', 'google') order by i."type" desc limit 1)
      ) as "adminLabel",
      a."action", a."targetType", a."targetId", a."details", a."createdAt"
    from "auditLogs" a
    where (${action ?? null}::text is null or a."action" ilike ${action ?? null})
    order by a."createdAt" desc limit 500
  `;
  res.set("Cache-Control", "no-store").json(success(rows.map(row => ({
    ...row,
    details: u.providers.redactSecretFields(row.details),
  }))));
});
