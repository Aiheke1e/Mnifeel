begin;

create table "schemaMigrations" (
  "name" text primary key,
  "appliedAt" timestamptz not null default now()
);

comment on table "schemaMigrations" is '数据库结构迁移记录';
comment on column "schemaMigrations"."name" is '迁移名称';
comment on column "schemaMigrations"."appliedAt" is '迁移应用时间';

create table "users" (
  "id" uuid primary key,
  "role" text not null check ("role" in ('admin', 'user')),
  "status" text not null default 'active' check ("status" in ('active', 'disabled')),
  "isWhitelist" boolean not null default false,
  "passwordHash" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

comment on table "users" is '用户账户';
comment on column "users"."id" is '用户唯一标识';
comment on column "users"."role" is '用户角色：admin 管理员，user 普通用户';
comment on column "users"."status" is '账户状态：active 正常，disabled 禁用';
comment on column "users"."isWhitelist" is '是否为免积分计费白名单用户';
comment on column "users"."passwordHash" is 'Argon2id 密码哈希，未设置密码时为空';
comment on column "users"."createdAt" is '创建时间';
comment on column "users"."updatedAt" is '更新时间';

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

comment on table "userIdentities" is '用户登录身份';
comment on column "userIdentities"."id" is '身份记录唯一标识';
comment on column "userIdentities"."userId" is '所属用户唯一标识';
comment on column "userIdentities"."type" is '身份类型：phone 手机号，mockGoogle 模拟 Google，google 正式 Google';
comment on column "userIdentities"."identifier" is '规范化后的手机号或邮箱等登录标识';
comment on column "userIdentities"."subject" is '外部身份供应商返回的稳定用户标识';
comment on column "userIdentities"."verifiedAt" is '身份验证通过时间';
comment on column "userIdentities"."createdAt" is '创建时间';

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

comment on table "userSessions" is '用户登录会话';
comment on column "userSessions"."id" is '会话唯一标识';
comment on column "userSessions"."userId" is '所属用户唯一标识';
comment on column "userSessions"."tokenHash" is '会话令牌的 SHA-256 哈希';
comment on column "userSessions"."userAgent" is '登录客户端的 User-Agent';
comment on column "userSessions"."ipAddress" is '登录客户端 IP 地址';
comment on column "userSessions"."createdAt" is '会话创建时间';
comment on column "userSessions"."lastUsedAt" is '会话最近使用时间';
comment on column "userSessions"."expiresAt" is '会话过期时间';
comment on column "userSessions"."revokedAt" is '会话撤销时间，未撤销时为空';

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

comment on table "verificationCodes" is '手机验证码';
comment on column "verificationCodes"."id" is '验证码记录唯一标识';
comment on column "verificationCodes"."phone" is '接收验证码的规范化手机号';
comment on column "verificationCodes"."purpose" is '验证码用途：登录、设置密码或重置密码';
comment on column "verificationCodes"."codeHash" is '验证码的 SHA-256 哈希';
comment on column "verificationCodes"."createdAt" is '创建时间';
comment on column "verificationCodes"."expiresAt" is '过期时间';
comment on column "verificationCodes"."consumedAt" is '使用时间，未使用时为空';

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

comment on table "providerConfigs" is 'AI 模型供应商配置';
comment on column "providerConfigs"."id" is '供应商配置唯一标识';
comment on column "providerConfigs"."type" is '供应商类型';
comment on column "providerConfigs"."displayName" is '供应商显示名称';
comment on column "providerConfigs"."baseUrl" is '供应商 API 基础地址';
comment on column "providerConfigs"."enabled" is '是否启用';
comment on column "providerConfigs"."apiKeyCiphertext" is 'API Key 的 AES-256-GCM 密文';
comment on column "providerConfigs"."apiKeyIv" is 'API Key 加密使用的初始化向量';
comment on column "providerConfigs"."apiKeyTag" is 'API Key 加密认证标签';
comment on column "providerConfigs"."connectionStatus" is '连接状态：pending 未测试，passed 通过，failed 失败';
comment on column "providerConfigs"."lastTestedAt" is '最近连接测试时间';
comment on column "providerConfigs"."lastTestMessage" is '最近连接测试结果说明';
comment on column "providerConfigs"."createdAt" is '创建时间';
comment on column "providerConfigs"."updatedAt" is '更新时间';

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

comment on table "modelConfigs" is '生成模型配置';
comment on column "modelConfigs"."id" is '模型配置唯一标识';
comment on column "modelConfigs"."providerId" is '所属供应商配置唯一标识';
comment on column "modelConfigs"."upstreamModelId" is '供应商侧模型标识';
comment on column "modelConfigs"."displayName" is '模型显示名称';
comment on column "modelConfigs"."mediaType" is '媒体类型：text 文本，image 图片，video 视频';
comment on column "modelConfigs"."enabled" is '是否启用';
comment on column "modelConfigs"."isDefault" is '是否为该媒体类型的默认模型';
comment on column "modelConfigs"."capabilities" is '模型能力配置 JSON';
comment on column "modelConfigs"."pricing" is '模型计费配置 JSON';
comment on column "modelConfigs"."createdAt" is '创建时间';
comment on column "modelConfigs"."updatedAt" is '更新时间';

create unique index "modelConfigsDefaultMediaIndex" on "modelConfigs" ("mediaType") where "isDefault" and "enabled";
create index "modelConfigsProviderIndex" on "modelConfigs" ("providerId", "mediaType");

create table "creditAccounts" (
  "userId" uuid primary key references "users" ("id") on delete cascade,
  "availableCredits" bigint not null default 0 check ("availableCredits" >= 0),
  "frozenCredits" bigint not null default 0 check ("frozenCredits" >= 0),
  "updatedAt" timestamptz not null default now()
);

comment on table "creditAccounts" is '用户积分账户';
comment on column "creditAccounts"."userId" is '所属用户唯一标识';
comment on column "creditAccounts"."availableCredits" is '可用积分余额';
comment on column "creditAccounts"."frozenCredits" is '任务执行期间冻结的积分余额';
comment on column "creditAccounts"."updatedAt" is '更新时间';

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

comment on table "projects" is '用户创作项目';
comment on column "projects"."id" is '项目唯一标识';
comment on column "projects"."userId" is '所属用户唯一标识';
comment on column "projects"."name" is '项目名称';
comment on column "projects"."description" is '项目描述';
comment on column "projects"."templateId" is '创建项目时使用的模板标识';
comment on column "projects"."status" is '项目状态：active 正常，archived 已归档';
comment on column "projects"."directoryPath" is '项目在工作区根目录内的相对路径';
comment on column "projects"."createdAt" is '创建时间';
comment on column "projects"."updatedAt" is '更新时间';

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

comment on table "projectAssets" is '项目素材索引';
comment on column "projectAssets"."id" is '素材记录唯一标识';
comment on column "projectAssets"."projectId" is '所属项目唯一标识';
comment on column "projectAssets"."relativePath" is '素材在项目目录内的相对路径';
comment on column "projectAssets"."mediaType" is '素材 MIME 类型';
comment on column "projectAssets"."sizeBytes" is '素材文件大小，单位为字节';
comment on column "projectAssets"."createdAt" is '创建时间';
comment on column "projectAssets"."updatedAt" is '更新时间';

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

comment on table "generationTasks" is 'AI 内容生成任务';
comment on column "generationTasks"."id" is '生成任务唯一标识';
comment on column "generationTasks"."userId" is '发起任务的用户唯一标识';
comment on column "generationTasks"."projectId" is '所属项目唯一标识';
comment on column "generationTasks"."modelId" is '使用的模型配置唯一标识';
comment on column "generationTasks"."taskType" is '任务类型：text 文本，image 图片，video 视频';
comment on column "generationTasks"."status" is '任务状态：等待、运行、成功、失败或取消';
comment on column "generationTasks"."idempotencyKey" is '用户范围内防止重复创建任务的幂等键';
comment on column "generationTasks"."requestSummary" is '已脱敏的请求摘要和计费快照 JSON';
comment on column "generationTasks"."result" is '任务结果 JSON';
comment on column "generationTasks"."providerTaskId" is '供应商侧异步任务标识';
comment on column "generationTasks"."progress" is '任务进度百分比，范围为 0 至 100';
comment on column "generationTasks"."frozenCredits" is '任务预先冻结的积分';
comment on column "generationTasks"."actualCredits" is '任务最终结算的积分';
comment on column "generationTasks"."refundedCredits" is '任务返还的积分';
comment on column "generationTasks"."errorCode" is '失败错误码';
comment on column "generationTasks"."errorMessage" is '已脱敏的失败原因';
comment on column "generationTasks"."createdAt" is '创建时间';
comment on column "generationTasks"."startedAt" is '开始执行时间';
comment on column "generationTasks"."heartbeatAt" is 'Worker 最近心跳时间';
comment on column "generationTasks"."completedAt" is '任务完成时间';
comment on column "generationTasks"."cancelRequestedAt" is '用户请求取消时间';

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

comment on table "creditTransactions" is '不可变的积分流水';
comment on column "creditTransactions"."id" is '积分流水唯一标识';
comment on column "creditTransactions"."userId" is '积分所属用户唯一标识';
comment on column "creditTransactions"."taskId" is '关联的生成任务唯一标识';
comment on column "creditTransactions"."type" is '流水类型：管理员发放、任务冻结、任务结算或任务退款';
comment on column "creditTransactions"."availableDelta" is '本次可用积分变动量';
comment on column "creditTransactions"."frozenDelta" is '本次冻结积分变动量';
comment on column "creditTransactions"."availableAfter" is '变动后的可用积分余额';
comment on column "creditTransactions"."frozenAfter" is '变动后的冻结积分余额';
comment on column "creditTransactions"."createdByAdminId" is '执行发放操作的管理员用户唯一标识';
comment on column "creditTransactions"."metadata" is '流水补充信息 JSON';
comment on column "creditTransactions"."createdAt" is '创建时间';

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

comment on table "auditLogs" is '不可变的管理员审计日志';
comment on column "auditLogs"."id" is '审计日志唯一标识';
comment on column "auditLogs"."adminUserId" is '执行操作的管理员用户唯一标识';
comment on column "auditLogs"."action" is '审计动作名称';
comment on column "auditLogs"."targetType" is '操作目标类型';
comment on column "auditLogs"."targetId" is '操作目标唯一标识';
comment on column "auditLogs"."details" is '已脱敏的操作详情 JSON';
comment on column "auditLogs"."createdAt" is '创建时间';

create index "auditLogsAdminIndex" on "auditLogs" ("adminUserId", "createdAt" desc);
create index "auditLogsTargetIndex" on "auditLogs" ("targetType", "targetId", "createdAt" desc);

create table "authRateLimits" (
  "key" char(64) primary key,
  "windowStartedAt" timestamptz not null,
  "count" integer not null check ("count" > 0),
  "updatedAt" timestamptz not null default now()
);

comment on table "authRateLimits" is '认证接口限流计数';
comment on column "authRateLimits"."key" is '限流维度组合值的 SHA-256 哈希';
comment on column "authRateLimits"."windowStartedAt" is '当前限流窗口开始时间';
comment on column "authRateLimits"."count" is '当前限流窗口内的请求次数';
comment on column "authRateLimits"."updatedAt" is '最近计数更新时间';

create index "authRateLimitsUpdatedIndex" on "authRateLimits" ("updatedAt");

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

comment on table "projectRenderTasks" is '本地 FFmpeg 成片合成任务，不关联模型、供应商或积分';
comment on column "projectRenderTasks"."inputSnapshot" is '冻结的已采用片段相对路径、顺序与指纹快照';

create index "projectRenderTasksQueueIndex" on "projectRenderTasks" ("status", "createdAt") where "status" in ('pending', 'running');
create index "projectRenderTasksProjectIndex" on "projectRenderTasks" ("projectId", "createdAt" desc);

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

commit;
