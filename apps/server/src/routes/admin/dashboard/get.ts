import { Router } from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

type CountRow = Record<string, string | number>;

export default Router().get("/", async (_req, res) => {
  const database = u.database.getDatabase();
  const [users, projects, tasks, credits, assets] = await Promise.all([
    database<CountRow[]>`
      select count(*) filter (where "role" = 'user') as "total",
        count(*) filter (where "role" = 'user' and "status" = 'active') as "active",
        count(*) filter (where "role" = 'user' and "isWhitelist") as "whitelist"
      from "users"
    `,
    database<CountRow[]>`
      select count(*) as "total", count(*) filter (where "status" = 'active') as "active"
      from "projects"
    `,
    database<CountRow[]>`
      select count(*) as "total",
        count(*) filter (where "status" = 'succeeded') as "succeeded",
        count(*) filter (where "status" = 'failed') as "failed",
        count(*) filter (where "status" in ('pending', 'running')) as "processing"
      from "generationTasks"
    `,
    database<CountRow[]>`select coalesce(sum("actualCredits"), 0) as "consumed" from "generationTasks"`,
    database<CountRow[]>`select coalesce(sum("sizeBytes"), 0) as "bytes" from "projectAssets"`,
  ]);
  const taskRow = tasks[0] ?? {};
  const succeeded = Number(taskRow.succeeded ?? 0);
  const failed = Number(taskRow.failed ?? 0);
  res.set("Cache-Control", "no-store").json(success({
    users: {
      total: Number(users[0]?.total ?? 0),
      active: Number(users[0]?.active ?? 0),
      whitelist: Number(users[0]?.whitelist ?? 0),
    },
    projects: {
      total: Number(projects[0]?.total ?? 0),
      active: Number(projects[0]?.active ?? 0),
    },
    tasks: {
      total: Number(taskRow.total ?? 0),
      succeeded,
      failed,
      processing: Number(taskRow.processing ?? 0),
      successRate: succeeded + failed ? Math.round(succeeded / (succeeded + failed) * 1000) / 10 : 0,
    },
    consumedCredits: Number(credits[0]?.consumed ?? 0),
    assetBytes: Number(assets[0]?.bytes ?? 0),
  }));
});
