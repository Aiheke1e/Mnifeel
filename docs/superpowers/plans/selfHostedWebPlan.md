# Minifeel 自托管 Web 迭代实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkboxes (`- [ ]`) for tracking.

**Goal:** 在现有仓库内将 Minifeel 改造成可本地独立运行的多用户 Web 应用，由本地 PostgreSQL 管理账号、权限、项目、模型、积分和任务，运行时只调用管理员配置的 DeepSeek、Agnes 与 BananaPro 模型接口。

**Architecture:** 继续使用一个 Bun/Express 应用服务承载 API、Vue 静态资源和同进程任务 Worker，PostgreSQL 保存结构化数据，本地数据目录保存项目文件和生成素材。浏览器只提交会话 Cookie、`projectId` 和工作区相对路径；服务端根据数据库归属解析真实目录。所有供应商请求通过统一网关进入任务、计费、密钥解密和脱敏链路。

**Tech Stack:** Bun 1.3.14、TypeScript、Express 5、Vue 3、Pinia、Vue Router、Element Plus、PostgreSQL、`postgres` 轻量客户端、Bun.password、Node.js `crypto`。

**Spec:** `docs/superpowers/specs/selfHostedWebDesign.md`

## 全局约束

- 所有新增自有文件、目录、变量、函数和组件遵守仓库的小驼峰命名规范；所有 `.vue` 文件保持 `<template>`、`<script>`、`<style>` 顺序。
- 不新增任何测试文件、测试框架或测试命令。每个任务只执行路由生成、类型检查、构建、临时数据库 HTTP 验证和浏览器实际验证。
- `apps/server/src/routes/` 继续一个接口一个文件；路由文件变化后先在 `apps/server` 执行 `bun run routes`，不手工编辑 `src/router.ts`。
- 所有新增服务端业务工具通过 `apps/server/src/utils.ts` 暴露；路由复用 `validateFields`、`success`、`error` 和统一错误处理中间件。
- 不把用户提供过的密钥或任何真实密钥写入代码、提交、示例配置、日志或计划。实施供应商联调前必须使用已经轮换的新密钥。
- 不改变现有画布、文档、Agent 会话和节点文件格式；只改变其项目寻址、权限和模型来源。
- 每完成一个任务，先填写本计划的状态、实际改动、验证结果和剩余事项，再与代码放入同一个提交。
- 任一任务的验证失败时保持该任务为“进行中”，先修复根因再提交，不用“后续修复”跳过阶段门槛。

## 评审重点

- 匿名请求只能访问登录、验证码和静态页面；角色、用户 ID、项目目录、余额和模型权限全部由服务端会话推导。
- 普通用户不能读到密钥、供应商内部配置、其他用户项目或管理员数据；管理员查看用户项目必须留下审计记录。
- 每次余额变化都有不可修改的流水；任务创建、冻结、结算和退款使用数据库事务并受幂等键保护。
- 密钥只以 AES-256-GCM 密文保存，只在供应商调用前解密；响应、任务错误和日志均不出现完整密钥。
- 旧项目只能经用户明确导入；原目录保留，导入失败不留下半成品项目。
- 删除 `api.minifeel.net`、遥测、充值、赞助商、远程插件市场、桌面入口和默认联网工具后，Web 生产构建仍可独立运行。

## 执行状态

| 任务 | 状态 | 实际改动 | 验证结果 | 剩余事项 |
| --- | --- | --- | --- | --- |
| 1. 本地工具与运行配置 | 已完成 | 安装 Bun 1.3.14 与 PostgreSQL 17；创建本地 `minifeel` 数据库；添加环境示例、迁移脚本入口和自托管开发说明 | 锁定依赖安装无变化；`select 1`、差异检查和密钥扫描通过 | 根类型检查受现有桌面 `.hutch` 类型缺失影响，随 Task 12 删除桌面入口解决 |
| 2. PostgreSQL 与数据库迁移 | 已完成 | 添加进程级 PostgreSQL 客户端、事务入口、串行迁移、12 张业务表、启动健康检查和优雅关闭 | 临时 schema 双迁移保持 1 条记录；12 张业务表、13 个外键和 36 个索引；不可连接时未监听端口；Server 类型检查与构建通过 | — |
| 3. 本地账号、会话与权限 | 已完成 | 添加手机号验证码、密码、模拟 Google、会话、管理员初始化、数据库限流、审计和统一 API 权限层 | 实际 HTTP 验证注册、登录、设置/重置密码、双会话、模拟开关、禁用账号、角色边界和管理员不覆盖均通过；路由生成、Server 类型检查与构建通过 | — |
| 4. 登录页与前端会话路由 | 已完成 | 添加统一登录页、会话 Store、同源 API 客户端、角色路由守卫和首页登出入口；移除外部引导与桌面启动流程 | Web 类型检查与生产构建通过；浏览器实际验证三种登录、刷新恢复、登出、角色边界、禁用提示、键盘操作和存储安全 | — |
| 5. 项目归属与文件隔离 | 已完成 | 添加用户项目接口与目录解析；工作区、画布、文档、素材、Agent、AI、FFmpeg 和 MCP 全部改用项目 ID；同步维护项目素材索引 | 路由生成、相关包类型检查、Server/Web 构建、临时数据库双用户 HTTP 隔离和浏览器画布/文档/素材验证通过 | 根类型检查仍受既有桌面 Electrobun 类型文件缺失影响，随 Task 12 删除桌面入口解决 |
| 6. 供应商密钥与模型管理 | 未开始 | — | — | — |
| 7. 三家模型供应商适配 | 未开始 | — | — | — |
| 8. 积分账本与生成任务 Worker | 未开始 | — | — | — |
| 9. 现有生成链路接入任务与计费 | 未开始 | — | — | — |
| 10. 用户端 UI 重构 | 未开始 | — | — | — |
| 11. 管理端 UI | 未开始 | — | — | — |
| 12. 外部依赖与桌面入口清理 | 未开始 | — | — | — |
| 13. 旧项目导入与全流程验收 | 未开始 | — | — | — |

---

## Task 1：本地工具与运行配置

**结果：** 开发机使用仓库指定的 Bun 版本，并选定一个本地 PostgreSQL 运行方式；仓库提供不含密钥的环境变量说明和可重复执行的开发命令。

**文件：**

- 修改：`package.json`
- 创建：`environment.example`
- 修改：`.gitignore`
- 修改：`README.md`
- 同步：`docs/superpowers/plans/selfHostedWebPlan.md`

**步骤：**

- [x] 安装 Bun 1.3.14，并确认 `bun --version` 与根 `packageManager` 一致。
- [x] 检查 Windows 是否能正常启用 Docker；能启用时只安装 Docker Desktop 并使用单个 PostgreSQL 容器，不能启用时只安装 PostgreSQL 本地服务，不同时维护两套数据库。
- [x] 在 `environment.example` 记录 `DATABASE_URL`、`MINIFEEL_DATA_DIR`、`MINIFEEL_SECRET_KEY`、`MINIFEEL_ADMIN_PHONE`、`MINIFEEL_ADMIN_PASSWORD`、`MINIFEEL_AUTH_MOCK_CODE`、`MINIFEEL_AUTH_MOCK_GOOGLE`、`MINIFEEL_SESSION_DAYS` 和 `PORT`，全部使用说明值或空值。
- [x] 在根脚本增加独立的数据库迁移和 Web 本地启动入口；依赖安装与数据库启动保持显式命令，不绑定到 `dev` 或 `build`。
- [x] 更新 README 的本地启动顺序、两服务生产结构和密钥轮换说明；明确旧对话中暴露的密钥不得继续使用。
- [x] 将真实 `.env`、本地数据库卷和 `data/` 保持在 Git 忽略范围。

**验证：**

- [x] 执行 `bun --version`，输出 `1.3.14`。
- [x] 执行 `bun install`，确认锁文件只包含计划引入的依赖变化。
- [x] 启动选定的 PostgreSQL，使用 `psql` 或容器内 `psql` 执行 `select 1`。
- [x] 执行 `git diff --check`，确认环境示例中没有真实密钥。

**提交：** `chore: 配置本地 Web 开发环境`

---

## Task 2：PostgreSQL 与数据库迁移

**结果：** Server 启动前可验证数据库并幂等执行初始迁移，所有本期业务表、约束和索引落在 PostgreSQL。

**文件：**

- 修改：`apps/server/package.json`
- 创建：`apps/server/src/utils/database/index.ts`
- 创建：`apps/server/src/utils/database/migrate.ts`
- 创建：`apps/server/src/utils/database/types.ts`
- 创建：`apps/server/src/utils/database/migrations/initialSchema.ts`
- 修改：`apps/server/src/utils.ts`
- 修改：`apps/server/src/app.ts`
- 修改：`apps/server/src/index.ts`
- 同步：`docs/superpowers/plans/selfHostedWebPlan.md`

**步骤：**

- [x] 给 `apps/server` 增加 `postgres` 依赖和单独的 `migrate` 脚本。
- [x] 创建进程级数据库客户端，要求 `DATABASE_URL` 存在；为事务、健康检查和关闭连接提供小而明确的入口。
- [x] 建立 `schemaMigrations` 表和串行迁移器；每个迁移在事务中只执行一次，失败时阻止应用启动。
- [x] 初始迁移创建 `users`、`userIdentities`、`userSessions`、`verificationCodes`、`providerConfigs`、`modelConfigs`、`creditAccounts`、`creditTransactions`、`projects`、`projectAssets`、`generationTasks`、`auditLogs`，并添加唯一约束、外键、状态检查、任务幂等索引和常用查询索引。
- [x] 金额统一使用整数积分，时间统一使用 `timestamptz`，业务 ID 使用应用生成的 UUID；结构化能力、价格、请求摘要和结果使用 `jsonb`。
- [x] 在 `createApp` 动态加载路由前完成数据库健康检查和迁移；在独立启动入口处理关闭信号并释放连接。

**验证：**

- [x] 对临时空数据库执行 `bun run migrate` 两次，第二次无重复对象错误且迁移记录不增加。
- [x] 查询 PostgreSQL 系统表，确认 12 个业务表、外键、唯一约束和索引存在。
- [x] 临时改成不可连接的 `DATABASE_URL` 启动 Server，确认明确失败且不开始监听端口。
- [x] 在 `apps/server` 执行 `bun run typecheck` 和 `bun run build`。

**提交：** `feat(server): 添加 PostgreSQL 持久化基础`

---

## Task 3：本地账号、会话与权限

**结果：** 支持手机号验证码自动注册/登录、密码登录与设置/重置、模拟 Google 登录、登出和双会话限制；管理员由环境变量首次初始化，API 权限由数据库会话决定。

**文件：**

- 创建：`apps/server/src/utils/auth/index.ts`
- 创建：`apps/server/src/utils/auth/password.ts`
- 创建：`apps/server/src/utils/auth/session.ts`
- 创建：`apps/server/src/utils/auth/verification.ts`
- 创建：`apps/server/src/utils/auth/google.ts`
- 创建：`apps/server/src/utils/audit/index.ts`
- 修改：`apps/server/src/lib/middleware.ts`
- 修改：`apps/server/src/utils.ts`
- 修改：`apps/server/src/app.ts`
- 创建：`apps/server/src/routes/auth/requestCode.ts`
- 创建：`apps/server/src/routes/auth/phone.ts`
- 创建：`apps/server/src/routes/auth/password.ts`
- 创建：`apps/server/src/routes/auth/google.ts`
- 创建：`apps/server/src/routes/auth/me.ts`
- 创建：`apps/server/src/routes/auth/logout.ts`
- 创建：`apps/server/src/routes/auth/passwordSet.ts`
- 创建：`apps/server/src/routes/auth/passwordReset.ts`
- 创建：`apps/server/src/routes/auth/sessions/get.ts`
- 创建：`apps/server/src/routes/auth/sessions/revoke.ts`
- 同步：`docs/superpowers/plans/selfHostedWebPlan.md`

**步骤：**

- [x] 使用 Bun.password 哈希密码，使用 `randomBytes` 生成会话令牌，数据库只保存 SHA-256 令牌哈希；Cookie 名固定为 `minifeelSession`。
- [x] 规范化国家/地区代码和手机号，验证码按用途保存哈希、有效期和消费时间；模拟模式仍生成六位码并只在服务端打印验证码，任意非空输入可通过。
- [x] 手机号首次验证码登录在一个事务中创建用户、手机号身份和 0 积分账户；已有手机号直接登录，禁用用户返回 403。
- [x] 登录成功后写入 `HttpOnly`、`SameSite=Lax` Cookie，生产环境启用 `Secure`；每个账号创建新会话后撤销最早会话，只保留两个有效会话。
- [x] 密码设置要求当前会话，密码重置要求手机号验证码；未设置密码的信息由 `/api/auth/me` 的 `hasPassword` 返回。
- [x] 模拟 Google 仅在 `MINIFEEL_AUTH_MOCK_GOOGLE=true` 时接受邮箱，并保存为 `mockGoogle` 身份；接口不把它标记为真实 OAuth。
- [x] 数据库没有管理员时，从管理员环境变量创建首个管理员；已经存在管理员时不覆盖密码或身份。
- [x] 在中间件中实现 `requireAuth`、`requireAdmin` 和基于数据库的简单速率限制；登录、验证码和模拟 Google 使用独立限制键。
- [x] 在 `createApp` 将会话解析放在业务路由前，并默认保护 `/api`、`/mcp` 和 `/a2a`，仅显式放行认证入口、健康检查和静态资源。
- [x] 管理员登录、登出和会话撤销写入 `auditLogs`，日志中不记录密码、验证码或 Cookie。

**验证：**

- [x] 执行 `bun run routes`、`bun run typecheck` 和 `bun run build`。
- [x] 用临时数据库实际请求验证码、任意非空码注册、再次登录、密码设置、密码登录、密码重置和登出。
- [x] 连续建立三个登录会话，确认第一个 Cookie 被撤销，后两个仍有效。
- [x] 关闭两个模拟开关后验证任意验证码和模拟 Google 均不能通过。
- [x] 验证普通用户访问管理员接口返回 403，匿名用户访问业务接口返回 401，响应和日志不含令牌及密码。

**提交：** `feat(server): 添加本地认证与权限控制`

---

## Task 4：登录页与前端会话路由

**结果：** 原 TF-Router 引导页替换为本地统一登录页，前端启动时恢复会话并按角色跳转，普通用户和管理员共享登录入口。

**文件：**

- 创建：`apps/web/src/lib/api.ts`
- 创建：`apps/web/src/stores/auth.ts`
- 创建：`apps/web/src/pages/login/index.vue`
- 创建：`apps/web/src/pages/login/loginArt.vue`
- 修改：`apps/web/src/router/index.ts`
- 修改：`apps/web/src/main.ts`
- 修改：`apps/web/src/App.vue`
- 修改：`apps/web/src/pages/home/index.vue`
- 修改：`apps/web/src/components/settings/panels/developer/index.vue`
- 修改：`apps/web/src/types/components.d.ts`
- 修改：`apps/web/vite.config.ts`
- 删除：`apps/web/src/pages/hello/index.vue`
- 删除：`apps/web/src/pages/hello/bg.vue`
- 删除：`apps/web/src/stores/hello.ts`
- 同步：`docs/superpowers/plans/selfHostedWebPlan.md`

**步骤：**

- [x] 创建统一 Axios 实例，固定携带同源 Cookie，并把 401 转为清空本地会话和跳转登录；业务组件不再各自拼接鉴权头。
- [x] `auth` Store 只保存当前用户安全字段、模拟 Google 是否启用和会话加载状态，不把 Cookie、密码或验证码持久化到 Pinia。
- [x] 登录页提供手机号验证码、手机号密码和条件显示的模拟 Google 三种入口；验证码按钮显示冷却状态，错误使用可访问的状态区域。
- [x] 手机号验证码不存在时自动注册，不另做重复注册页面；登录后根据 `role` 跳转 `/admin/dashboard` 或 `/app`。
- [x] 路由守卫等待一次 `/api/auth/me`，实现匿名、普通用户和管理员页面边界；旧 `/hello`、`/home`、`/workspace` 暂时重定向到对应的新入口，后续任务再移除兼容跳转。
- [x] 删除主入口中的桌面启动判断、WebView2 更新流程和匿名遥测注册，使 Web 启动只依赖设置、Pinia、路由和会话恢复。

**验证：**

- [x] 在 `apps/web` 执行 `bun run typecheck` 和 `bun run build`。
- [x] 浏览器验证三种登录入口、错误提示、刷新恢复、登出、禁用用户提示和角色跳转。
- [x] 检查浏览器存储，确认没有会话令牌、密码、验证码或供应商密钥。
- [x] 使用键盘完成登录页切换、表单提交和错误恢复。

**提交：** `feat(web): 使用本地登录替换外部引导`

---

## Task 5：项目归属与文件隔离

**结果：** 用户项目由 PostgreSQL 管理，所有工作区文件按 `data/workspaces/{userId}/{projectId}` 隔离；浏览器不再提交服务器绝对目录。

**文件：**

- 创建：`apps/server/src/utils/projects/index.ts`
- 修改：`apps/server/src/utils/workspace/index.ts`
- 修改：`apps/server/src/utils/workspace/files.ts`
- 修改：`apps/server/src/utils.ts`
- 创建：`apps/server/src/routes/projects/create.ts`
- 创建：`apps/server/src/routes/projects/get.ts`
- 创建：`apps/server/src/routes/projects/list.ts`
- 创建：`apps/server/src/routes/projects/update.ts`
- 创建：`apps/server/src/routes/projects/archive.ts`
- 修改：`apps/server/src/routes/workspaces/check.ts`
- 修改：`apps/server/src/routes/workspaces/files/list.ts`
- 修改：`apps/server/src/routes/workspaces/files/read.ts`
- 修改：`apps/server/src/routes/workspaces/files/write.ts`
- 修改：`apps/server/src/routes/workspaces/files/rename.ts`
- 修改：`apps/server/src/routes/workspaces/files/remove.ts`
- 修改：`apps/server/src/routes/workspaces/files/mkdir.ts`
- 修改：`apps/web/src/stores/workspace.ts`
- 修改：`apps/web/src/lib/workspaceFiles.ts`
- 修改：`apps/web/src/pages/workspace/index.vue`
- 修改：所有 `apps/web/src/components/agent/`、`apps/web/src/pages/workspace/` 和 `packages/nodeScaffold/src/nodeAi.ts` 中向 Server 传绝对目录的调用点
- 同步：`docs/superpowers/plans/selfHostedWebPlan.md`

**步骤：**

- [x] 项目创建事务写入数据库后创建用户项目目录；目录创建失败时回滚数据库，数据库失败时清理仅由本次创建的空目录。
- [x] 用 `resolveProjectWorkspace(userId, projectId)` 取代来自浏览器的目录解析；先校验项目归属和状态，再复用现有路径规范化、符号链接防护、文件锁和原子写入。
- [x] 项目列表与当前项目 Store 改为保存 `{ id, name, updatedAt }`，不在 localStorage 保存绝对路径。
- [x] `useWorkspaceFiles` 继续作为唯一文件入口，但固定实例改为项目 ID 快照；所有文件方法只传工作区相对 `path` 和 `target`。
- [x] 画布自动保存、文档读写、素材预览、节点剪贴板和 Agent 会话在跨 `await` 操作开始时固定 `projectId`，避免切换项目后写错位置。
- [x] 文件写入后更新 `projectAssets` 索引；删除和改名同步更新索引，索引失败时不吞掉错误。
- [x] 先保留旧工作区路由路径以减少前端改动，但将请求字段从 `directory` 改为 `projectId`，并移除 `x-minifeel-workspace` 作为权限依据。

**验证：**

- [x] 执行 `bun run routes`，再对 Server、Web 和受影响的节点包执行类型检查与构建。
- [x] 创建两个用户和各自项目，验证相同相对文件名落到不同磁盘目录。
- [x] 用用户 A 请求用户 B 的项目、文件、素材和 Agent 会话，确认均返回 404 或 403 且不泄露真实路径。
- [x] 验证 `..`、绝对路径、符号链接逃逸、同名创建和写入失败仍走原有安全及错误映射。
- [x] 浏览器打开现有画布和文档，验证读取、自动保存、改名、删除、素材预览和刷新恢复。

**提交：** `feat(server): 按登录用户隔离项目`

---

## Task 6：供应商密钥与模型管理

**结果：** 只有管理员能保存、测试和同步供应商；API Key 加密入库，普通用户只读取已启用模型的安全字段。

**文件：**

- 创建：`apps/server/src/utils/secrets/index.ts`
- 创建：`apps/server/src/utils/providers/index.ts`
- 创建：`apps/server/src/utils/providers/types.ts`
- 创建：`apps/server/src/utils/providers/redact.ts`
- 修改：`apps/server/src/utils.ts`
- 创建：`apps/server/src/routes/admin/providers/get.ts`
- 创建：`apps/server/src/routes/admin/providers/save.ts`
- 创建：`apps/server/src/routes/admin/providers/test.ts`
- 创建：`apps/server/src/routes/admin/providers/syncModels.ts`
- 创建：`apps/server/src/routes/admin/models/get.ts`
- 创建：`apps/server/src/routes/admin/models/save.ts`
- 创建：`apps/server/src/routes/models/get.ts`
- 修改：`apps/server/src/app.ts`
- 同步：`docs/superpowers/plans/selfHostedWebPlan.md`

**步骤：**

- [ ] 启动时要求 `MINIFEEL_SECRET_KEY` 可解码为 32 字节；用 AES-256-GCM 和每次随机 IV 保存 API Key 密文、IV 和认证标签。
- [ ] 供应商仅允许 `deepSeek`、`agnes`、`bananaPro` 三种类型；保存接口接收显示名、基础地址、启用状态和可选新密钥，不回传旧密钥。
- [ ] 修改地址或密钥后把供应商连接状态设为待测试；测试成功前不允许发起任务，也不自动清空已同步模型。
- [ ] 建立统一适配器契约：`testConnection`、`listModels`、`runText`、`runImage`、`createVideo`、`getVideo` 和可选 `cancelVideo`，各供应商只实现自身能力。
- [ ] 模型保存校验媒体类型、唯一默认模型、能力 JSON 和整数计价；只有连接测试成功的供应商模型才能启用。
- [ ] 普通模型接口只返回 ID、显示名、媒体类型、能力、默认状态和用户可见价格，不返回基础地址、供应商响应或密钥状态细节。
- [ ] 管理员保存、连接测试、同步模型、启停和改价均写审计日志；错误与响应先通过统一脱敏器。
- [ ] 移除 `createApp` 中基于用户 `settings.json` 的模型启动刷新，服务端模型来源改为数据库。

**验证：**

- [ ] 执行 `bun run routes`、Server 类型检查和构建。
- [ ] 用已知样例密钥写入后直接查询数据库，确认不存在明文；篡改密文或认证标签后解密明确失败。
- [ ] 验证普通用户不能访问任何管理员供应商路由，普通模型列表不含密钥和基础地址。
- [ ] 修改密钥或地址后验证供应商回到待测试状态，未测试时生成请求被拒绝。
- [ ] 检查连接错误、审计详情、HTTP 响应和控制台日志，确认常见认证头、密钥字段及 URL 查询密钥均被遮盖。

**提交：** `feat(server): 添加加密供应商管理`

---

## Task 7：三家模型供应商适配

**结果：** DeepSeek 文本、Agnes 视频和 BananaPro 图片通过本地统一适配器完成连接测试、模型同步和最小实际生成；未经真实接口验证的模型不能启用。

**文件：**

- 创建：`apps/server/src/utils/providers/deepSeek.ts`
- 创建：`apps/server/src/utils/providers/agnes.ts`
- 创建：`apps/server/src/utils/providers/bananaPro.ts`
- 修改：`apps/server/src/utils/providers/index.ts`
- 修改：`apps/server/src/utils/ai/index.ts`
- 修改：`apps/server/src/utils/ai/models.ts`
- 修改：`apps/server/src/utils/media/provider.ts`
- 修改：`apps/server/src/utils/media/generation.ts`
- 修改：`packages/providers/index.ts`
- 修改：`packages/providers/package.json`
- 删除：`packages/providers/src/language/tfRouter.ts`
- 删除：`packages/providers/src/media/tfRouter.ts`
- 同步：`docs/superpowers/plans/selfHostedWebPlan.md`

**步骤：**

- [ ] DeepSeek 复用现有 OpenAI 兼容流式能力，供应商配置来自数据库；解析并返回真实 token 用量供后续计费。
- [ ] 用管理员新密钥和供应商实际响应确认 Agnes 的认证头、模型列表、创建任务、状态轮询、结果地址和取消语义，再据此实现视频适配器；响应结构使用 Zod 校验。
- [ ] 用管理员新密钥和供应商实际响应确认 BananaPro 的认证、模型列表、文生图、参考图和结果格式，再据此实现图片适配器；参考文件只从当前项目读取。
- [ ] 三个适配器统一使用超时和 AbortSignal；只允许配置的 HTTPS 基础地址，开发环境本地联调地址需由明确环境开关放行。
- [ ] 下载生成结果时限制重定向、响应体大小和媒体类型，写入项目前使用现有安全文件接口；不把远程结果 URL 当成永久项目资源。
- [ ] 删除 TF-Router 导出与自动安装逻辑；旧 TF 配置只留在旧设置文件中，不再读取或迁移成新供应商。
- [ ] 连接测试和模型同步只有完全通过时才更新 `lastTestedAt`、状态和模型快照；失败保留已有可见模型但不可新建任务。

**验证：**

- [ ] 对 Server 和 providers 包执行类型检查与构建。
- [ ] 用轮换后的真实密钥分别完成三家连接测试和模型同步；记录已验证的基础地址、认证方式和响应字段到本计划“实际改动”，不记录密钥。
- [ ] 每家执行一个最小实际请求：DeepSeek 短文本、BananaPro 单张低规格图片、Agnes 最短视频；确认产物写入当前项目。
- [ ] 主动使用错误密钥、未知模型、超时和取消，确认状态明确、产物不残留、日志已脱敏。

**提交：** `feat(server): 接入管理员配置的生成模型`

---

## Task 8：积分账本与生成任务 Worker

**结果：** 任务创建时冻结积分，同进程 Worker 从 PostgreSQL 领取任务，成功结算、失败或取消退款，重启后处理失联任务。

**文件：**

- 创建：`apps/server/src/utils/billing/index.ts`
- 创建：`apps/server/src/utils/billing/pricing.ts`
- 创建：`apps/server/src/utils/generation/index.ts`
- 创建：`apps/server/src/utils/generation/worker.ts`
- 创建：`apps/server/src/utils/generation/events.ts`
- 修改：`apps/server/src/utils.ts`
- 修改：`apps/server/src/app.ts`
- 创建：`apps/server/src/routes/generation/create.ts`
- 创建：`apps/server/src/routes/generation/get.ts`
- 创建：`apps/server/src/routes/generation/list.ts`
- 创建：`apps/server/src/routes/generation/cancel.ts`
- 创建：`apps/server/src/routes/generation/events.ts`
- 同步：`docs/superpowers/plans/selfHostedWebPlan.md`

**步骤：**

- [ ] 价格结构固定为文本每百万输入/输出 token、图片每张、视频每次或每秒整数积分；所有计算使用整数和向上取整。
- [ ] 在同一数据库事务中校验模型、项目和供应商状态，按最大预计用量冻结积分并创建任务；`userId + idempotencyKey` 唯一冲突时返回原任务。
- [ ] 白名单仅在视频任务把冻结和实际消费设为 0；文本和图片仍执行正常计费。
- [ ] Worker 使用 `for update skip locked` 领取等待任务，按后台配置的全局并发数运行，写入开始时间和心跳。
- [ ] 成功事务写入结果、实际用量、结算流水并释放多余冻结；失败、取消和超时事务写入脱敏错误、退款流水并释放全部冻结。
- [ ] 进程启动时将超过心跳期限的运行任务标记失败并退款；供应商错误不做无条件重试。
- [ ] 任务事件在当前进程通过 SSE 推送，数据库保存最终状态和必要进度；刷新后 `/get` 和 `/list` 能恢复状态与结果。
- [ ] 取消接口只允许任务所有者或管理员操作，触发本地 AbortController；重复取消、完成后取消和重复结算保持幂等。

**验证：**

- [ ] 执行 `bun run routes`、Server 类型检查和构建。
- [ ] 用临时数据库手动验证余额不足、正常冻结/结算、失败退款、取消退款和同一幂等键重复提交。
- [ ] 验证管理员赠送之外没有直接覆盖余额的 SQL 路径，流水不能经 API 修改或删除。
- [ ] 将用户设为白名单后验证视频为 0 积分，文本和图片仍扣费。
- [ ] 人为终止运行中的 Worker 并重启，确认超时任务失败且只退款一次。
- [ ] 并发提交超过 Worker 并发数的任务，确认其余任务保持等待且没有重复领取。

**提交：** `feat(server): 添加积分账本与生成任务 Worker`

---

## Task 9：现有生成链路接入任务与计费

**结果：** 画布节点、媒体工具和 Agent 继续按原业务方式工作，但模型只能来自管理员启用列表，每次生成都有任务和积分记录。

**文件：**

- 修改：`apps/server/src/routes/ai/models.ts`
- 修改：`apps/server/src/routes/ai/media/models.ts`
- 修改：`apps/server/src/routes/ai/generate.ts`
- 修改：`apps/server/src/routes/ai/media/generate.ts`
- 修改：`apps/server/src/routes/agent.ts`
- 修改：`apps/server/src/agent/runtime/model.ts`
- 修改：`apps/server/src/agent/runtime/index.ts`
- 修改：`apps/server/src/utils/mcp/tools.ts`
- 修改：`apps/server/src/utils/mcp/operations.ts`
- 创建：`apps/web/src/lib/generation.ts`
- 修改：`packages/nodeScaffold/src/nodeAi.ts`
- 修改：`packages/tools/mediaGeneration/src/index.ts`
- 修改：`apps/web/src/components/agent/conversation.vue`
- 同步：`docs/superpowers/plans/selfHostedWebPlan.md`

**步骤：**

- [ ] 保留现有 `/api/ai/*` 对前端和节点包的调用契约，在内部改为创建任务、订阅任务事件和返回最终结果，避免同时维护第二套未计费生成逻辑。
- [ ] 文本 SSE 创建任务后转发 Worker 的文本增量，完成事件带任务 ID 和真实 token 用量；连接断开只停止推送，不把已经被供应商接受的任务误判为免费成功。
- [ ] 媒体生成接口等待对应任务完成后维持原文件数组返回值，新增任务 ID 响应头供新 UI 使用；取消信号转发给任务取消入口。
- [ ] Agent 每次模型调用使用当前用户、当前项目和已启用文本模型创建计费任务；工具内图片、视频调用沿用同一用户与项目上下文。
- [ ] MCP 和 A2A 不再接受客户端声明的绝对目录或模型密钥；调用时从已认证用户、目标项目和管理员模型列表解析。
- [ ] `nodeAi` 模型缓存继续使用原模型列表路径，但列表只包含管理员启用模型；生成请求用 `projectId` 替代 `directory`。
- [ ] 生成结果仍返回现有相对文件路径和媒体类型，保证画布节点与 Markdown 预览无需改变文件格式。

**验证：**

- [ ] 对 Server、Web、nodeScaffold 和 mediaGeneration 工具执行类型检查与构建。
- [ ] 在实际画布运行一个文本节点、图片节点和视频节点，确认输出格式、素材预览和自动保存与改造前兼容。
- [ ] 在 Agent 中发送一次文本请求并触发一次媒体工具，确认所有上游调用分别产生任务和流水。
- [ ] 刷新或断开文本流后查看任务中心，确认最终状态可恢复且没有重复扣费。
- [ ] 普通用户伪造供应商 ID、模型 ID、用户 ID、项目 ID和目录，确认服务端拒绝且不产生扣费。

**提交：** `feat(server): 为现有生成流程接入计费`

---

## Task 10：用户端 UI 重构

**结果：** 普通用户看到面向短剧创作的首页、项目页、任务中心和账户页，默认流程不出现 API、Agent、Skill、供应商或节点术语。

**文件：**

- 创建：`apps/web/src/pages/app/index.vue`
- 创建：`apps/web/src/pages/app/components/appSidebar.vue`
- 创建：`apps/web/src/pages/app/dashboard.vue`
- 创建：`apps/web/src/pages/app/tasks.vue`
- 创建：`apps/web/src/pages/app/account.vue`
- 创建：`apps/web/src/pages/app/projectCreate.vue`
- 创建：`apps/web/src/pages/project/index.vue`
- 创建：`apps/web/src/pages/project/components/projectHeader.vue`
- 创建：`apps/web/src/pages/project/components/projectStages.vue`
- 修改：`apps/web/src/pages/workspace/index.vue`
- 修改：`apps/web/src/pages/workspace/components/workspaceMenu.vue`
- 修改：`apps/web/src/pages/workspace/panels/canvas/index.vue`
- 修改：`apps/web/src/pages/workspace/panels/document/index.vue`
- 修改：`apps/web/src/stores/workspace.ts`
- 修改：`apps/web/src/router/index.ts`
- 修改：`apps/web/src/assets/main.scss`
- 删除：`apps/web/src/pages/home/index.vue`
- 删除：`apps/web/src/pages/home/bg.vue`
- 删除：`apps/web/src/pages/home/workspacePicker.vue`
- 同步：`docs/superpowers/plans/selfHostedWebPlan.md`

**步骤：**

- [ ] 建立普通用户应用外壳和统一视觉变量，首页只展示开始创作、最近项目、内置模板、积分和最近任务。
- [ ] 创建项目只收集名称、创作描述和模板；调用服务端创建工作区后进入 `/app/projects/:projectId`。
- [ ] 项目页默认显示创作阶段、内容区域、管理员启用模型、任务状态和下一步操作；不新增规格外的自动配音、字幕或成片能力。
- [ ] 高级模式复用现有工作区、无限画布、文档和 Agent，技术术语只在高级模式出现；模式选择存入用户浏览器偏好。
- [ ] 任务中心从持久任务接口显示等待、运行、成功、失败、取消、消费和退款，并支持取消可取消任务。
- [ ] 账户页显示手机号、密码设置提醒、两个有效会话、积分余额和不可修改的积分流水；支持设置密码、重置密码、撤销其他会话和登出。
- [ ] 移除普通用户设置中的供应商、API Key、插件市场、充值、赞助商、桌面更新、MCP/A2A 管理入口。

**验证：**

- [ ] 在 `apps/web` 执行类型检查和构建。
- [ ] 分别在桌面宽度和手机宽度浏览器走通登录、创建项目、打开项目、切换普通/高级模式、查看任务和账户。
- [ ] 使用键盘检查主导航、表单、对话框、模式切换和任务操作；检查可见焦点、标签关联和错误状态。
- [ ] 全局搜索普通模式页面，确认不出现 API Key、供应商、Agent、Skill、节点或工作区绝对路径。
- [ ] 打开已有画布项目，确认高级模式没有破坏节点、文档和 Agent 的既有交互。

**提交：** `feat(web): 重构短剧创作端界面`

---

## Task 11：管理端 UI

**结果：** 管理员拥有独立后台，可查看统计、管理用户与白名单、赠送积分、配置供应商和模型、查看任务与审计。

**文件：**

- 创建：`apps/server/src/routes/admin/dashboard/get.ts`
- 创建：`apps/server/src/routes/admin/users/get.ts`
- 创建：`apps/server/src/routes/admin/users/update.ts`
- 创建：`apps/server/src/routes/admin/users/grantCredits.ts`
- 创建：`apps/server/src/routes/admin/users/revokeSession.ts`
- 创建：`apps/server/src/routes/admin/tasks/get.ts`
- 创建：`apps/server/src/routes/admin/audit/get.ts`
- 创建：`apps/server/src/routes/admin/projects/open.ts`
- 创建：`apps/web/src/pages/admin/index.vue`
- 创建：`apps/web/src/pages/admin/components/adminSidebar.vue`
- 创建：`apps/web/src/pages/admin/dashboard.vue`
- 创建：`apps/web/src/pages/admin/users.vue`
- 创建：`apps/web/src/pages/admin/providers.vue`
- 创建：`apps/web/src/pages/admin/models.vue`
- 创建：`apps/web/src/pages/admin/tasks.vue`
- 创建：`apps/web/src/pages/admin/audit.vue`
- 修改：`apps/web/src/router/index.ts`
- 同步：`docs/superpowers/plans/selfHostedWebPlan.md`

**步骤：**

- [ ] 仪表盘接口按数据库聚合用户数、项目数、任务数、成功率、积分消费和 `projectAssets` 磁盘大小，不递归扫描全部文件阻塞请求。
- [ ] 用户列表支持按手机号和状态筛选；更新接口只允许改状态和白名单，禁用用户时撤销其有效会话。
- [ ] 赠送积分只接受正整数并创建 `adminGrant` 流水，页面不提供余额覆盖、扣减、删除或编辑流水能力。
- [ ] 供应商页支持地址、密钥替换、连接测试和模型同步；密钥框永不回显已有密钥，只显示是否已配置和最近测试结果。
- [ ] 模型页支持显示名、启停、默认模型、能力和价格，保存前展示媒体类型对应的计价单位。
- [ ] 任务页展示脱敏错误、耗时、消费和退款；审计页只读。
- [ ] 用户项目默认只展示名称、更新时间和素材统计；管理员明确点击查看时调用 `admin/projects/open`，服务端记录管理员、目标用户、项目和时间后返回只读摘要。
- [ ] 管理端路由统一要求管理员；普通用户即使直接输入 URL 也由前后端共同拒绝。

**验证：**

- [ ] 执行 `bun run routes`，再执行 Server 与 Web 类型检查和构建。
- [ ] 浏览器走通用户禁用/恢复、白名单切换、正积分赠送、会话撤销、供应商测试、模型启停和价格保存。
- [ ] 尝试赠送 0、负数、小数和超范围积分，确认拒绝且余额不变。
- [ ] 普通用户直接请求每个管理员接口，确认均返回 403。
- [ ] 管理员打开用户项目摘要后查询审计记录，确认敏感查看动作存在且不可修改。

**提交：** `feat(web): 添加本地管理后台`

---

## Task 12：外部依赖与桌面入口清理

**结果：** Web 运行时不再依赖 Minifeel 外部服务、桌面壳、外部插件市场、遥测或默认联网工具，生产构建只部署应用服务与 PostgreSQL。

**文件：**

- 修改：`package.json`
- 修改：`apps/server/src/app.ts`
- 修改：`apps/server/src/index.ts`
- 修改：`apps/server/src/utils.ts`
- 修改：`apps/web/src/main.ts`
- 修改：`apps/web/src/App.vue`
- 修改：`apps/web/src/components/settings/index.vue`
- 删除：`apps/web/src/lib/tf.ts`
- 删除：`apps/web/src/lib/anonymousData.ts`
- 删除：`apps/web/src/lib/desktopProtocol.ts`
- 删除：`apps/web/src/lib/saveFile.ts`
- 删除：`apps/web/src/stores/desktopUpdate.ts`
- 删除：`apps/web/src/components/settings/panels/pluginMarket/`
- 删除：`apps/server/src/routes/desktop/`
- 删除：`apps/server/src/utils/desktop/`
- 删除：不再被本地工作流引用的外部插件安装路由和工具
- 修改或移除工作区：`apps/desktop`、`apps/updateServer`、`packages/tools/webSearch`、`packages/tools/webFetch`
- 修改：所有仍引用上述模块、`api.minifeel.net`、赞助商、充值、外链社区或桌面协议的文件
- 同步：`docs/superpowers/plans/selfHostedWebPlan.md`

**步骤：**

- [ ] 先用 `rg` 列出全部外部 URL、TF、遥测、充值、赞助商、远程安装、桌面和默认联网工具调用方，逐条判断删除入口还是保留纯本地能力。
- [ ] 从根工作区与脚本移除桌面端和更新服务；Server 不再装配 `/api/desktop`，Web 不再注册桌面协议、更新或本地保存桥接。
- [ ] 删除 TF 余额、订单、充值、赞助商和插件市场 UI/API；保留现有本地内置节点、工具、技能和 Agent 运行能力，但不向普通用户暴露安装或配置入口。
- [ ] 移除默认 webSearch 和 webFetch 工具包及构建引用，确保 Agent 默认不能任意访问互联网。
- [ ] 删除运行时 FFmpeg 下载入口；改为启动时检查部署中预置的 FFmpeg，可用时启用相关既有能力，不可用时给管理员明确错误。
- [ ] 清理外部教程、社区、腾讯文档、飞书、企业微信和赞助链接；产品内只保留本地帮助文本。
- [ ] 保留构建所需开源依赖下载，不把第三方模型 API 误删；最终允许的业务外部域名来自三家管理员供应商配置。

**验证：**

- [ ] 执行根 `bun run typecheck` 和 `bun run build`。
- [ ] 执行 `rg -n "api\\.minifeel\\.net|TF-Router|anonymousData|recharge|sponsor|webSearch|webFetch|desktopProtocol|WebView2" apps packages package.json`，只允许迁移文档或明确的历史说明命中。
- [ ] 断开互联网并保留本地 PostgreSQL，验证登录、项目、画布、文档、账户和管理后台可用；生成操作给出供应商网络错误而不是应用崩溃。
- [ ] 检查生产构建目录和启动日志，确认不要求桌面程序、更新服务、远程插件市场或运行时下载 FFmpeg。

**提交：** `refactor: 移除托管平台与桌面端依赖`

---

## Task 13：旧项目导入与全流程验收

**结果：** 用户可明确导入旧项目副本；本地开发与生产构建按文档启动，普通用户和管理员核心流程完成最终验收。

**文件：**

- 创建：`apps/server/src/routes/projects/legacy/get.ts`
- 创建：`apps/server/src/routes/projects/legacy/import.ts`
- 修改：`apps/server/src/utils/projects/index.ts`
- 创建：`apps/web/src/pages/app/legacyImport.vue`
- 修改：`apps/web/src/pages/app/dashboard.vue`
- 修改：`README.md`
- 修改：`environment.example`
- 同步：`docs/superpowers/plans/selfHostedWebPlan.md`

**步骤：**

- [ ] 通过 `MINIFEEL_LEGACY_WORKSPACE_DIR` 配置唯一旧工作区根目录；列表接口只返回根目录下一层可导入目录的名称和不透明标识，不返回服务器绝对路径。
- [ ] 导入接口重新解析不透明标识并验证仍位于配置根目录，创建新项目后复制旧文件；忽略符号链接，限制单项目文件数与总大小，并保留原目录。
- [ ] 复制先进入新项目内临时目录，全部成功后原子切换；失败时删除本次临时内容和数据库项目记录，不影响源目录。
- [ ] 导入页面要求用户选择旧项目和新名称，并明确说明是复制；成功后进入新项目，高级模式直接读取原画布、文档和 Agent 文件格式。
- [ ] 更新 README 为最终本地安装、迁移、管理员初始化、开发启动、生产构建、数据备份和两服务部署说明。
- [ ] 按最终代码更新环境示例和本计划执行状态，逐项记录实际命令和结果。

**验证：**

- [ ] 用包含画布、文档、Agent 会话和媒体素材的旧项目完成导入，确认源目录未变化且新项目可读写。
- [ ] 验证目录穿越、符号链接、超大小、同名项目和复制中断不会越界或留下可见半成品。
- [ ] 从全新临时数据库按 README 完成迁移与首个管理员初始化，再创建普通用户并赠送积分。
- [ ] 实际走通管理员配置三家供应商和模型、普通用户创建项目、文本/图片/视频生成、成功结算、失败退款、白名单免费视频、任务恢复和会话撤销。
- [ ] 执行 `bun run routes`、根 `bun run typecheck`、根 `bun run build` 和 `git diff --check`。
- [ ] 在浏览器完成桌面与手机宽度的最终检查，确认普通模式无需理解 API、供应商、Agent、Skill 或节点即可开始创作。

**提交：** `feat: 完成自托管 Web 迁移`

---

## 实施记录规则

每次开始任务时，将状态从“未开始”改为“进行中”。任务提交前：

1. 将状态改为“已完成”或保留“进行中”。
2. 在“实际改动”中写入真实文件和最终接口变化。
3. 在“验证结果”中写入实际执行的命令、HTTP 场景和浏览器结果，不把计划中的命令直接复制成已通过。
4. 在“剩余事项”中只记录确实未完成且属于后续任务的依赖；当前任务的失败项必须先解决。
5. 将计划更新与该任务代码放入同一提交，确保 `dev` 分支上的文档始终对应当前实现。
