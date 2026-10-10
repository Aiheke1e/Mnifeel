import type { Migration } from "@/utils/database/types";

const projectRenderTasks: Migration = {
  name: "projectRenderTasks",
  sql: `
    create table "projectRenderTasks" (
      "id" uuid primary key,
      "userId" uuid not null references "users" ("id") on delete restrict,
      "projectId" uuid not null references "projects" ("id") on delete restrict,
      "status" text not null default 'pending' check ("status" in ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
      "inputSnapshot" jsonb not null default '{}'::jsonb,
      "outputPath" text,
      "progress" integer not null default 0 check ("progress" between 0 and 100),
      "errorCode" varchar(120),
      "errorMessage" text,
      "createdAt" timestamptz not null default now(),
      "startedAt" timestamptz,
      "heartbeatAt" timestamptz,
      "completedAt" timestamptz,
      "cancelRequestedAt" timestamptz
    );

    create index "projectRenderTasksQueueIndex" on "projectRenderTasks" ("status", "createdAt") where "status" in ('pending', 'running');
    create index "projectRenderTasksProjectIndex" on "projectRenderTasks" ("projectId", "createdAt" desc);
  `,
};

export default projectRenderTasks;
