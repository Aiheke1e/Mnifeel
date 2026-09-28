import type { Migration } from "@/utils/database/types";

const initialSchema: Migration = {
  name: "initialSchema",
  sql: `
    create table "users" (
      "id" uuid primary key,
      "role" text not null check ("role" in ('admin', 'user')),
      "status" text not null default 'active' check ("status" in ('active', 'disabled')),
      "isWhitelist" boolean not null default false,
      "passwordHash" text,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now()
    );

    create table "userIdentities" (
      "id" uuid primary key,
      "userId" uuid not null references "users" ("id") on delete cascade,
      "type" text not null check ("type" in ('phone', 'mockGoogle', 'google')),
      "identifier" text not null,
      "subject" text,
      "verifiedAt" timestamptz not null,
      "createdAt" timestamptz not null default now(),
      unique ("type", "identifier"),
      unique ("type", "subject")
    );

    create index "userIdentitiesUserIdIndex" on "userIdentities" ("userId");

    create table "userSessions" (
      "id" uuid primary key,
      "userId" uuid not null references "users" ("id") on delete cascade,
      "tokenHash" char(64) not null unique,
      "userAgent" varchar(512),
      "ipAddress" varchar(64),
      "createdAt" timestamptz not null default now(),
      "lastUsedAt" timestamptz not null default now(),
      "expiresAt" timestamptz not null,
      "revokedAt" timestamptz,
      check ("expiresAt" > "createdAt")
    );

    create index "userSessionsUserActiveIndex" on "userSessions" ("userId", "createdAt") where "revokedAt" is null;
    create index "userSessionsExpiryIndex" on "userSessions" ("expiresAt") where "revokedAt" is null;

    create table "verificationCodes" (
      "id" uuid primary key,
      "phone" varchar(32) not null,
      "purpose" text not null check ("purpose" in ('login', 'setPassword', 'resetPassword')),
      "codeHash" char(64) not null,
      "createdAt" timestamptz not null default now(),
      "expiresAt" timestamptz not null,
      "consumedAt" timestamptz,
      check ("expiresAt" > "createdAt")
    );

    create index "verificationCodesLookupIndex" on "verificationCodes" ("phone", "purpose", "createdAt" desc);

    create table "providerConfigs" (
      "id" uuid primary key,
      "type" text not null unique check ("type" in ('deepSeek', 'agnes', 'bananaPro')),
      "displayName" varchar(120) not null,
      "baseUrl" text not null,
      "enabled" boolean not null default false,
      "apiKeyCiphertext" text,
      "apiKeyIv" text,
      "apiKeyTag" text,
      "connectionStatus" text not null default 'pending' check ("connectionStatus" in ('pending', 'passed', 'failed')),
      "lastTestedAt" timestamptz,
      "lastTestMessage" text,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now(),
      check (
        ("apiKeyCiphertext" is null and "apiKeyIv" is null and "apiKeyTag" is null)
        or ("apiKeyCiphertext" is not null and "apiKeyIv" is not null and "apiKeyTag" is not null)
      )
    );

    create table "modelConfigs" (
      "id" uuid primary key,
      "providerId" uuid not null references "providerConfigs" ("id") on delete restrict,
      "upstreamModelId" text not null,
      "displayName" varchar(160) not null,
      "mediaType" text not null check ("mediaType" in ('text', 'image', 'video')),
      "enabled" boolean not null default false,
      "isDefault" boolean not null default false,
      "capabilities" jsonb not null default '{}'::jsonb,
      "pricing" jsonb not null default '{}'::jsonb,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now(),
      unique ("providerId", "upstreamModelId")
    );

    create unique index "modelConfigsDefaultMediaIndex" on "modelConfigs" ("mediaType") where "isDefault" and "enabled";
    create index "modelConfigsProviderIndex" on "modelConfigs" ("providerId", "mediaType");

    create table "creditAccounts" (
      "userId" uuid primary key references "users" ("id") on delete cascade,
      "availableCredits" bigint not null default 0 check ("availableCredits" >= 0),
      "frozenCredits" bigint not null default 0 check ("frozenCredits" >= 0),
      "updatedAt" timestamptz not null default now()
    );

    create table "projects" (
      "id" uuid primary key,
      "userId" uuid not null references "users" ("id") on delete cascade,
      "name" varchar(120) not null,
      "description" text not null default '',
      "templateId" varchar(120),
      "status" text not null default 'active' check ("status" in ('active', 'archived')),
      "directoryPath" text not null unique,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now()
    );

    create index "projectsUserUpdatedIndex" on "projects" ("userId", "updatedAt" desc);

    create table "projectAssets" (
      "id" uuid primary key,
      "projectId" uuid not null references "projects" ("id") on delete cascade,
      "relativePath" text not null,
      "mediaType" varchar(80) not null,
      "sizeBytes" bigint not null check ("sizeBytes" >= 0),
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now(),
      unique ("projectId", "relativePath")
    );

    create index "projectAssetsProjectIndex" on "projectAssets" ("projectId", "createdAt" desc);

    create table "generationTasks" (
      "id" uuid primary key,
      "userId" uuid not null references "users" ("id") on delete restrict,
      "projectId" uuid not null references "projects" ("id") on delete restrict,
      "modelId" uuid not null references "modelConfigs" ("id") on delete restrict,
      "taskType" text not null check ("taskType" in ('text', 'image', 'video')),
      "status" text not null default 'pending' check ("status" in ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
      "idempotencyKey" varchar(160) not null,
      "requestSummary" jsonb not null default '{}'::jsonb,
      "result" jsonb,
      "providerTaskId" text,
      "progress" integer not null default 0 check ("progress" between 0 and 100),
      "frozenCredits" bigint not null default 0 check ("frozenCredits" >= 0),
      "actualCredits" bigint not null default 0 check ("actualCredits" >= 0),
      "refundedCredits" bigint not null default 0 check ("refundedCredits" >= 0),
      "errorCode" varchar(120),
      "errorMessage" text,
      "createdAt" timestamptz not null default now(),
      "startedAt" timestamptz,
      "heartbeatAt" timestamptz,
      "completedAt" timestamptz,
      "cancelRequestedAt" timestamptz,
      unique ("userId", "idempotencyKey")
    );

    create index "generationTasksQueueIndex" on "generationTasks" ("status", "createdAt") where "status" in ('pending', 'running');
    create index "generationTasksUserIndex" on "generationTasks" ("userId", "createdAt" desc);
    create index "generationTasksProjectIndex" on "generationTasks" ("projectId", "createdAt" desc);

    create table "creditTransactions" (
      "id" uuid primary key,
      "userId" uuid not null references "users" ("id") on delete restrict,
      "taskId" uuid references "generationTasks" ("id") on delete restrict,
      "type" text not null check ("type" in ('adminGrant', 'taskFreeze', 'taskSettle', 'taskRefund')),
      "availableDelta" bigint not null,
      "frozenDelta" bigint not null,
      "availableAfter" bigint not null check ("availableAfter" >= 0),
      "frozenAfter" bigint not null check ("frozenAfter" >= 0),
      "createdByAdminId" uuid references "users" ("id") on delete restrict,
      "metadata" jsonb not null default '{}'::jsonb,
      "createdAt" timestamptz not null default now()
    );

    create index "creditTransactionsUserIndex" on "creditTransactions" ("userId", "createdAt" desc);
    create index "creditTransactionsTaskIndex" on "creditTransactions" ("taskId") where "taskId" is not null;

    create table "auditLogs" (
      "id" uuid primary key,
      "adminUserId" uuid not null references "users" ("id") on delete restrict,
      "action" varchar(120) not null,
      "targetType" varchar(80),
      "targetId" text,
      "details" jsonb not null default '{}'::jsonb,
      "createdAt" timestamptz not null default now()
    );

    create index "auditLogsAdminIndex" on "auditLogs" ("adminUserId", "createdAt" desc);
    create index "auditLogsTargetIndex" on "auditLogs" ("targetType", "targetId", "createdAt" desc);

    create function "preventImmutableMutation"() returns trigger language plpgsql as $$
    begin
      raise exception '% 不允许修改或删除', tg_table_name;
    end;
    $$;

    create trigger "creditTransactionsImmutableTrigger"
      before update or delete on "creditTransactions"
      for each row execute function "preventImmutableMutation"();

    create trigger "auditLogsImmutableTrigger"
      before update or delete on "auditLogs"
      for each row execute function "preventImmutableMutation"();
  `,
};

export default initialSchema;
