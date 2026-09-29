import { Router } from "express";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const querySchema = z.object({
  phone: z.string().trim().max(32).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

type UserRow = {
  id: string;
  status: "active" | "disabled";
  isWhitelist: boolean;
  hasPassword: boolean;
  phone: string | null;
  email: string | null;
  availableCredits: string | number;
  frozenCredits: string | number;
  createdAt: Date;
  updatedAt: Date;
};

export default Router().get("/", async (req, res) => {
  const query = querySchema.parse(req.query);
  const database = u.database.getDatabase();
  const phone = query.phone ? `%${query.phone}%` : undefined;
  const users = await database<UserRow[]>`
    select u."id", u."status", u."isWhitelist", u."passwordHash" is not null as "hasPassword",
      (select i."identifier" from "userIdentities" i where i."userId" = u."id" and i."type" = 'phone' limit 1) as "phone",
      (select i."identifier" from "userIdentities" i where i."userId" = u."id" and i."type" in ('mockGoogle', 'google') order by i."type" desc limit 1) as "email",
      coalesce(c."availableCredits", 0) as "availableCredits", coalesce(c."frozenCredits", 0) as "frozenCredits",
      u."createdAt", u."updatedAt"
    from "users" u left join "creditAccounts" c on c."userId" = u."id"
    where u."role" = 'user'
      and (${query.status ?? null}::text is null or u."status" = ${query.status ?? null})
      and (${phone ?? null}::text is null or exists (
        select 1 from "userIdentities" i where i."userId" = u."id" and i."type" = 'phone' and i."identifier" ilike ${phone ?? null}
      ))
    order by u."createdAt" desc
  `;
  if (!users.length) return res.set("Cache-Control", "no-store").json(success([]));
  const userIds = users.map(user => user.id);
  const [sessions, projects] = await Promise.all([
    database<{
      id: string; userId: string; userAgent: string | null; ipAddress: string | null;
      createdAt: Date; lastUsedAt: Date; expiresAt: Date;
    }[]>`
      select "id", "userId", "userAgent", "ipAddress", "createdAt", "lastUsedAt", "expiresAt"
      from "userSessions"
      where "userId" in ${database(userIds)} and "revokedAt" is null and "expiresAt" > now()
      order by "createdAt" desc
    `,
    database<{
      id: string; userId: string; name: string; status: "active" | "archived"; updatedAt: Date;
      assetCount: string | number; assetBytes: string | number;
    }[]>`
      select p."id", p."userId", p."name", p."status", p."updatedAt",
        count(a."id") as "assetCount", coalesce(sum(a."sizeBytes"), 0) as "assetBytes"
      from "projects" p left join "projectAssets" a on a."projectId" = p."id"
      where p."userId" in ${database(userIds)}
      group by p."id" order by p."updatedAt" desc
    `,
  ]);
  res.set("Cache-Control", "no-store").json(success(users.map(user => ({
    ...user,
    availableCredits: Number(user.availableCredits),
    frozenCredits: Number(user.frozenCredits),
    sessions: sessions.filter(session => session.userId === user.id),
    projects: projects.filter(project => project.userId === user.id).map(project => ({
      ...project,
      assetCount: Number(project.assetCount),
      assetBytes: Number(project.assetBytes),
    })),
  }))));
});
