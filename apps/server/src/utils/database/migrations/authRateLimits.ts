import type { Migration } from "@/utils/database/types";

const authRateLimits: Migration = {
  name: "authRateLimits",
  sql: `
    create table "authRateLimits" (
      "key" char(64) primary key,
      "windowStartedAt" timestamptz not null,
      "count" integer not null check ("count" > 0),
      "updatedAt" timestamptz not null default now()
    );

    create index "authRateLimitsUpdatedIndex" on "authRateLimits" ("updatedAt");
  `,
};

export default authRateLimits;
