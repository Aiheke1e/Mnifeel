import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({ projectId: z.uuid() });

export default Router().post("/", validateFields(inputSchema.shape), async (req, res) => {
  const input = inputSchema.parse(req.body);
  const summary = await u.database.getDatabase().begin(async transaction => {
    const projects = await transaction<{
      id: string; userId: string; userLabel: string | null; name: string; description: string;
      templateId: string | null; status: string; createdAt: Date; updatedAt: Date;
      assetCount: string | number; assetBytes: string | number;
    }[]>`
      select p."id", p."userId", p."name", p."description", p."templateId", p."status",
        p."createdAt", p."updatedAt", count(a."id") as "assetCount",
        coalesce(sum(a."sizeBytes"), 0) as "assetBytes",
        coalesce(
          (select i."identifier" from "userIdentities" i where i."userId" = p."userId" and i."type" = 'phone' limit 1),
          (select i."identifier" from "userIdentities" i where i."userId" = p."userId" and i."type" in ('mockGoogle', 'google') order by i."type" desc limit 1)
        ) as "userLabel"
      from "projects" p left join "projectAssets" a on a."projectId" = p."id"
      where p."id" = ${input.projectId}
      group by p."id"
    `;
    const project = projects[0];
    if (!project) throw Object.assign(new Error("项目不存在"), { status: 404 });
    const media = await transaction<{ mediaType: string; assetCount: string | number; assetBytes: string | number }[]>`
      select "mediaType", count(*) as "assetCount", coalesce(sum("sizeBytes"), 0) as "assetBytes"
      from "projectAssets" where "projectId" = ${input.projectId} group by "mediaType" order by "mediaType"
    `;
    await u.audit.writeAudit({
      adminUserId: getAuth(res).user.id,
      action: "projectSummaryOpened",
      targetType: "project",
      targetId: input.projectId,
      details: { userId: project.userId, projectName: project.name },
      database: transaction,
    });
    return {
      ...project,
      assetCount: Number(project.assetCount),
      assetBytes: Number(project.assetBytes),
      media: media.map(item => ({
        ...item,
        assetCount: Number(item.assetCount),
        assetBytes: Number(item.assetBytes),
      })),
    };
  });
  res.set("Cache-Control", "no-store").json(success(summary));
});
