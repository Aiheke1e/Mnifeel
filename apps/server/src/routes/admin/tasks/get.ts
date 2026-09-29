import { Router } from "express";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const querySchema = z.object({
  status: z.enum(["pending", "running", "succeeded", "failed", "cancelled"]).optional(),
  user: z.string().trim().max(160).optional(),
});

export default Router().get("/", async (req, res) => {
  const query = querySchema.parse(req.query);
  const database = u.database.getDatabase();
  const user = query.user ? `%${query.user}%` : undefined;
  const rows = await database<{
    id: string; userId: string; userLabel: string | null; projectId: string; projectName: string;
    modelName: string; providerName: string; taskType: string; status: string; progress: number;
    actualCredits: string | number; refundedCredits: string | number; errorCode: string | null;
    errorMessage: string | null; createdAt: Date; startedAt: Date | null; completedAt: Date | null;
    durationSeconds: string | number | null;
  }[]>`
    select t."id", t."userId",
      coalesce(
        (select i."identifier" from "userIdentities" i where i."userId" = t."userId" and i."type" = 'phone' limit 1),
        (select i."identifier" from "userIdentities" i where i."userId" = t."userId" and i."type" in ('mockGoogle', 'google') order by i."type" desc limit 1)
      ) as "userLabel",
      t."projectId", p."name" as "projectName", m."displayName" as "modelName",
      pc."displayName" as "providerName", t."taskType", t."status", t."progress",
      t."actualCredits", t."refundedCredits", t."errorCode", t."errorMessage",
      t."createdAt", t."startedAt", t."completedAt",
      extract(epoch from (coalesce(t."completedAt", now()) - t."startedAt")) as "durationSeconds"
    from "generationTasks" t
      join "projects" p on p."id" = t."projectId"
      join "modelConfigs" m on m."id" = t."modelId"
      join "providerConfigs" pc on pc."id" = m."providerId"
    where (${query.status ?? null}::text is null or t."status" = ${query.status ?? null})
      and (${user ?? null}::text is null or exists (
        select 1 from "userIdentities" i where i."userId" = t."userId" and i."identifier" ilike ${user ?? null}
      ))
    order by t."createdAt" desc limit 500
  `;
  res.set("Cache-Control", "no-store").json(success(rows.map(row => ({
    ...row,
    actualCredits: Number(row.actualCredits),
    refundedCredits: Number(row.refundedCredits),
    durationSeconds: row.durationSeconds === null ? null : Math.max(0, Math.round(Number(row.durationSeconds))),
    errorMessage: row.errorMessage ? u.providers.redactText(row.errorMessage) : null,
  }))));
});
