# Minifeel 导演式创作工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有四阶段原型渐进升级为剧本、资产设定、分镜、镜头制作、成片五阶段的导演式工作台；普通页与 Minifeel 高级画布继续共享同一份节点、连接、素材、任务和工作区文件。

**Architecture:** 普通工作台挂载现有 `canvasHost` 作为共享运行层，通过 `CanvasContext` 和已注册的节点工具修改同一份画布数据；`creativeViewAdapter.ts` 只把约定标签、真实画布边和节点输出转换为阶段卡片，不维护第二份业务数据。角色、场景、道具和风格资产通过真实画布边进入分镜与镜头素材包；估价、用户确认和正式生成必须复用同一份冻结请求。单镜头视频继续由现有媒体节点、任务 Worker 和积分事务执行，最终成片由服务端 FFmpeg/FFprobe 合成并写回同一项目工作区。

**Tech Stack:** Bun 1.3.14、TypeScript、Vue 3、Pinia、Vue Router、Element Plus、VueFlow、Express 5、PostgreSQL。

**Spec:** `docs/superpowers/specs/guidedStudioDesign.md`

## Global Constraints

- **强制复用原则：先复用 Toonflow 现成功能，只补 Minifeel 缺少的语义、连接、校验和普通用户操作流程；确实没有的部分才新增代码。** 禁止另建重复的画布、节点、生成、任务、素材、工作区文件、Agent、Skill、MCP 或 FFmpeg 体系。
- Task 15—22 每次开始实现前，必须先沿真实调用链列出：现有 Toonflow/Minifeel 能力、准备直接复用的入口、需要最小修改的缺口，以及确认不存在后才允许新增的文件或数据结构。若现有实现已经覆盖需求，应修改或组合现有入口，不得用新模块绕开它。
- 计划中的 `Create` 只是当前分析确认现有仓库缺少对应职责后的候选方案；正式实现时仍须重新搜索最新代码。若届时 Toonflow 或当前分支已经提供等价能力，必须改为复用，删除该新增方案，并在本计划的实际改动中记录原因。
- 新增代码也必须接入同一 `CanvasContext`、真实画布边、节点工具、生成任务、工作区文件和项目资产索引，不得形成只供普通创作页使用的第二份业务事实源。
- 所有新增自有文件、文件夹、组件、变量和函数使用小驼峰命名；自有组件模板标签也使用小驼峰。
- 所有 `.vue` 文件保持 `<template>`、`<script>`、`<style>` 顺序，组件属性使用小驼峰。
- 不新增测试文件、测试框架、模拟后端或占位业务组件；验证使用现有类型检查、构建、实际 HTTP 和浏览器冒烟流程。
- 前端文件操作统一使用 `useWorkspaceFiles`，跨 `await` 的保存流程固定项目 ID，不能跟随 Store 切换到其他项目。
- 不直接修改未经验证的画布 JSON；内容修改调用现有 `CanvasContext`、节点工具和画布保存队列。
- `apps/server/src/routes/` 一个接口一个文件；新增路由后执行 `bun run routes`，不手工修改 `apps/server/src/router.ts`。
- 普通用户只能选择管理员已经启用的模型，不能读取或修改供应商、API Key、计费规则和底层参数。
- 每个任务完成后更新本计划的执行状态、实际改动、验证结果和剩余事项，与代码放入同一个中文 Conventional Commit，并推送到 `origin/dev`。
- 任一阶段验证失败时保持“进行中”，修复根因后再提交；不以“后续处理”跳过阶段门槛。
- `.superpowers/` 是本地设计工具的临时目录，不进入提交。
- Task 15 起实行逐任务确认：Task 15—22 各自视为一个“实施步骤”。开始每个任务前先向用户说明本任务范围、可见结果、数据与成本风险，只有用户针对该任务明确确认后才能修改业务代码；Task 内 checkbox 属于该次确认的执行清单，上一任务完成、提交或用户此前的笼统“继续”不自动授权下一任务。
- 当前核心闭环不接入独立声音生成、角色声线、字词时间戳、口型同步、AI 视觉审片、字幕、背景音乐、复杂转场或专业时间线，也不为这些延期能力创建占位页面、空接口或重复数据结构。已有视频片段自带的音轨在最终合成时保留，当前质量验收由用户人工预览、采用或退回。
- 真实图片、视频和其他付费模型调用必须在对应任务中再次获得明确授权；本地实现、静态校验和复用已有结果不代表获准产生新费用。
- 服务器部署继续遵守仓库部署授权规则，任何任务的实现、提交和推送都不自动包含部署。

## Review Focus

- 画布文件缺失、损坏或不包含约定节点时，普通工作台必须显示可恢复提示，不能覆盖原文件；Task 3 的损坏文件与旧项目手动验证覆盖此项。
- 初始 Agent 消息只能发送给创建它的项目，并且必须等待画布运行层就绪；Task 2 的快速切换项目与刷新验证覆盖此项。
- 模型、积分或白名单状态可能在估价后变化，最终提交必须以后端事务为准并刷新余额；Task 4 的模型停用和积分变化 HTTP 验证覆盖此项。
- 页面刷新或服务重启后，运行中的任务必须从数据库恢复，不能依赖页面内存；Task 5 的刷新与容器重启验证覆盖此项。
- 保存失败、节点仍在生成或用户切换模式时不能静默丢数据；Task 2 和 Task 5 的断开 Server、繁忙状态与强制退出验证覆盖此项。

## 执行状态

| 任务 | 状态 | 实际改动 | 验证结果 | 剩余事项 |
| --- | --- | --- | --- | --- |
| 1. 工作台路由与三栏外壳 | 已完成 | 默认项目路由和首页新建/打开进入导演式工作台；完成响应式三栏外壳、阶段状态与高级画布往返 | Web 类型检查和生产构建通过；浏览器验证首页打开、普通页刷新、高级画布往返、390px 窄屏无页面横向溢出，控制台无错误 | — |
| 2. 共享画布运行层与导演助手 | 已完成 | 普通页复用固定尺寸隐藏画布运行层；普通与高级模式共用保存拦截；Agent 增加导演模式并隐藏技术入口；启动时补齐缺失的内置工具 | Web、Server 类型检查与构建通过；浏览器验证新项目首条消息只发送一次并创建真实文本节点、刷新不重复、普通模式隐藏技术卡片、高级模式保持完整、窄屏折叠无溢出；断开 Server 后保存失败会拦截退出，恢复后可保存 | — |
| 3. 创作视图适配、剧本与角色 | 已完成 | 新增画布标签适配器、剧本编辑确认、角色设定编辑锁定与已有预览；收紧首轮 Agent 指令，并让导演助手工具成功后刷新创作视图；并发刷新只提交最新结果且保留未保存输入 | Web 类型检查和生产构建通过；浏览器验证新项目只创建文本草稿节点，剧本与角色修改刷新后保留，保存一个角色不会覆盖另一个角色的未保存输入，高级画布读取同一数据；旧项目显示兼容提示且修复操作只填入 Agent；损坏 JSON 显示明确错误且原文件哈希恢复一致；干净页面无控制台错误 | — |
| 4. 生成估价与确认 | 已完成 | 新增只读生成估价接口并让估价与任务创建共用模型、项目、供应商、白名单及计费校验；角色阶段加入真实模型估价、积分确认、图片生成、账户与任务轮询 | Server 路由生成、类型检查和生产构建通过；Web 类型检查和生产构建通过；HTTP 验证估价无任务、流水或余额副作用，无权项目返回 404、停用模型返回 409、白名单视频估价为 0；浏览器验证取消无副作用，真实图片任务完成后扣除 1 积分、冻结归零、预览回填且刷新后保留，控制台无业务错误；已有失败任务记录确认冻结积分全额退回 | — |
| 5. 分镜、成片与任务恢复 | 已完成 | 新增分镜编辑、确认、排序、批量估价生成与成片预览下载；按模型能力选择图生或文生视频；浏览器刷新不再取消后台任务，完成结果可恢复到原节点 | Web、Server、节点脚手架及图片/视频节点类型检查通过，Web 与 Server 生产构建通过；浏览器验证 3 个分镜的批量确认、取消无副作用、排序刷新后保留及成片入口；遵守共享视频密钥限频，本轮未发起真实视频请求 | 真实视频调用继续按 CHECK-003 等待无并发窗口单次复验 |
| 6. 全流程验收与生产部署 | 已完成 | 已完成仓库级静态检查、本地普通用户流程、高级画布一致性、管理员权限边界、生产备份部署和线上低成本验收 | 根目录类型检查和生产构建通过；生产提交 `0c7e759`，PostgreSQL、Minifeel、Caddy 容器正常；普通用户线上登录、会话、项目列表和详情通过，管理员接口返回 403 | 共享视频接口按用户要求未调用，保留 CHECK-003；域名尚未配置，当前使用服务器 IP 访问 |
| 7. 宽屏布局与开发规范修正 | 已完成 | 项目创作页改为使用侧边栏外的可用宽度并统一主区与右栏边界；补充 Toonflow 继承边界和服务器部署授权规范 | Web 类型检查与生产构建通过；2048px 项目页由 1280px 扩展到 1806px，主区与右栏均高 1181px；1280px、720px 无横向溢出，控制台无错误 | 本阶段只提交并推送 `dev`，未部署服务器 |
| 8. 阶段导航与媒体预览优化 | 已完成 | 四阶段导航移到项目标题下方横向排列；角色和分镜图片按原始比例完整展示并支持点击放大 | Web 类型检查与生产构建通过；2048px 下角色四视图和三张分镜无裁剪且均可打开全屏预览；720px 页面无横向溢出，控制台无错误 | 本阶段只提交并推送 `dev`，未部署服务器 |
| 9. 普通用户一级入口视觉统一 | 已完成 | 创作首页、资产、任务和账户统一公共页面骨架、侧栏状态和响应式布局 | Web 类型检查与生产构建通过；2552px、2048px、1280px 与 720px 多页面浏览器复验无横向溢出或控制台错误 | 本阶段只提交并推送 `dev`，未部署服务器 |
| 10. 生产保存接口稳定性修复 | 已完成 | 保存与取消入口同时检查组件实例和公开方法；文档编辑器停用时避开已销毁实例 | Web 类型检查和生产构建通过；生产环境验证普通页加载、画布与文档往返及退出，无保存错误或 `flushSave` 异常 | — |
| 11. HTTP 生产环境 UUID 兼容 | 已完成 | 应用入口在浏览器缺少原生 `randomUUID` 时，使用 `getRandomValues` 补齐 UUID v4 | Web 类型检查和生产构建通过；生产 HTTP 环境验证 UUID、导演助手、普通项目、高级画布、文档切换与退出，控制台无应用错误 | — |
| 12. 生图等待体验修复 | 已完成 | 媒体轮询静默刷新并保留阶段内容；生图状态不再展示供应商未提供的百分比 | Web 类型检查与生产构建通过；本地前后端入口返回 200；静态调用链复核通过 | 未调用真实媒体接口，不消耗积分；未部署服务器 |
| 13. 导演助手历史消息与状态展示修复 | 已完成 | 分离模型输入与用户展示内容；普通导演模式只显示一条实时整理状态，隐藏内部技能指令和重复思考 | Server、Web 类型检查与生产构建通过；指定账号和项目的会话、页面及高级画布兼容性复验通过 | 未调用模型，不消耗积分；未部署服务器 |
| 14. 镜头素材链与视频模型能力规划 | 已完成（规划） | 保存 Minifeel 素材调用链和 Toonflow 视频生成链；定义视频模型准入能力、当前核心边界与逐步实施门槛 | 对 Toonflow 上游提交 `72a895c` 完成源码级静态核验；文档差异检查通过 | 业务实现拆分到 Task 15—22，均须逐项确认 |
| 15. 普通镜头制作安全基线 | 已完成（2026-10-09） | 停止批量删除视频节点入边；普通“镜头制作”不再展示旧视频模型并显示“暂无兼容模型”；估价、任务创建与媒体执行共享媒体 Schema 与模型能力校验并在扣分前失败；第四阶段改名为“镜头制作” | Web、Server 类型检查与生产构建通过；1280px 与 720px 浏览器验证第四阶段命名、无兼容模型提示与生成按钮禁用；HTTP 验证非法视频估价、非法视频创建与非法图片 Schema 均为 400，任务数、积分与流水不变 | 真实视频能力待 Task 17—19 建立契约并选定模型 |
| 16. 资产语义与真实画布连接 | 进行中（Step 1—4 完成） | `CreativeAssetType` 扩展为角色/场景/道具/风格；第二阶段 `characterStage.vue` 重命名为 `assetStage.vue` 并按四类分组；分镜页提供“本镜资产”选择，保存时用 `connectNodes` 携带 `data.minifeelRelationship=assetReference` 建立真实画布边并同步 `referenceOrder`；工作流 SKILL.md 补齐命名契约与“不无差别连接全部资产”约束 | 根目录类型检查 19 个包全部通过；代码复核确认资产边为真实 Vue Flow 边、分镜与镜头共用同一份 `assetReferences`、带引用的分镜保持禁用估价 | **Step 5 旧项目可审查补连流程尚未实现**，当前只有把提示词填入导演助手的入口；按计划规则本任务保持“进行中”，不标记完成 |
| 17. 可组合视频能力契约 | 未开始 | — | — | 依赖 Task 16，并须再次确认 |
| 18. 冻结镜头素材包与请求一致 | 未开始 | — | — | 依赖 Task 17，并须再次确认 |
| 19. 合格图片生视频模型适配 | 待选模型 | — | — | 依赖 Task 18；需用户选择模型并授权最小真实调用 |
| 20. 样片优先的镜头制作 | 未开始 | — | — | 依赖 Task 19，并须再次确认 |
| 21. FFmpeg 单一成片与人工交付 | 未开始 | — | — | 依赖 Task 20，并须再次确认 |
| 22. 核心闭环验收 | 未开始 | — | — | 依赖 Task 21，并须再次确认；部署另行授权 |

---

### Task 1: 工作台路由与三栏外壳

**Files:**

- Modify: `apps/web/src/router/index.ts`
- Modify: `apps/web/src/pages/app/dashboard.vue`
- Modify: `apps/web/src/pages/project/index.vue`
- Modify: `apps/web/src/pages/project/components/projectHeader.vue`
- Modify: `apps/web/src/pages/project/components/projectStages.vue`
- Modify: `apps/web/src/pages/workspace/index.vue`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

**Interfaces:**

- Consumes: `workspaceStore.createProject(...)`、`workspaceStore.openProject(projectId)`、`setProjectMode(mode)`。
- Produces: `/app/projects/:projectId` 渲染 `pages/project/index.vue`；`projectStages` 接收 `statuses: Record<ProjectStage, ProjectStageStatus>`；高级画布返回同一项目的普通工作台。

- [x] **Step 1: 将普通项目路径改为真实页面**

在 `router/index.ts` 中把当前重定向替换为组件路由：

```ts
{
  path: "projects/:projectId",
  component: () => import("@/pages/project/index.vue"),
}
```

保留 `/app/projects/:projectId/advanced` 指向原 `pages/workspace/index.vue`。

- [x] **Step 2: 修正首页的新建和打开行为**

`dashboard.vue` 创建项目后继续写入空画布和 `pendingAgentMessage`，随后改为：

```ts
setProjectMode("guided");
await router.push(`/app/projects/${project.id}`);
```

`openProject(project)` 也设置 `guided` 并进入普通项目地址。创建失败仍保存 `pendingIdea` 并回滚刚创建的项目。

- [x] **Step 3: 将项目页改成三栏外壳**

`project/index.vue` 只负责：加载项目、模型、账户和任务；持有当前阶段；组合顶部栏、左侧阶段导航、中央阶段内容和右侧导演面板插槽。第一步中央区保留现有阶段说明，不提前添加未接线的生成按钮。

布局断点：桌面三栏；宽度小于 `1100px` 时导演面板移到内容下方；宽度小于 `720px` 时阶段导航横向滚动，避免四个阶段纵向占满首屏。

- [x] **Step 4: 给阶段导航加入状态接口**

在 `projectStages.vue` 导出：

```ts
export type ProjectStage = "script" | "characters" | "storyboard" | "video";
export type ProjectStageStatus = "notStarted" | "running" | "review" | "complete" | "failed";
```

新增 `statuses` 属性，按钮显示当前阶段、已完成、处理中和失败状态；点击仍只发出 `update:modelValue`，不在组件内部改变业务状态。

- [x] **Step 5: 修正高级画布返回路径**

`workspace/index.vue` 的普通用户返回路径改为当前项目：

```ts
const returnPath = computed(() => authStore.user?.role === "admin"
  ? "/admin/dashboard"
  : workspaceStore.project?.id
    ? `/app/projects/${workspaceStore.project.id}`
    : "/app");
```

- [x] **Step 6: 验证路由和响应式外壳**

Run:

```powershell
bun run --cwd apps/web typecheck
bun run --cwd apps/web build
```

Expected: 两个命令退出码均为 `0`。浏览器使用普通账号验证首页新建、项目列表打开、普通页进入高级画布、高级画布返回四条路径；刷新普通项目 URL 不跳转到高级画布；窄屏没有横向覆盖。

- [x] **Step 7: 更新进度并提交推送**

把执行状态 Task 1 改为“已完成”，填写实际验证结果，然后执行：

```powershell
git add apps/web/src/router/index.ts apps/web/src/pages/app/dashboard.vue apps/web/src/pages/project/index.vue apps/web/src/pages/project/components/projectHeader.vue apps/web/src/pages/project/components/projectStages.vue apps/web/src/pages/workspace/index.vue docs/superpowers/plans/guidedStudioPlan.md
git commit -m "feat(web): 搭建导演式创作工作台"
git pull --rebase origin dev
git push origin dev
```

---

### Task 2: 共享画布运行层与导演助手

**Files:**

- Create: `apps/web/src/pages/project/components/projectRuntime.vue`
- Create: `apps/web/src/pages/project/components/directorPanel.vue`
- Create: `apps/web/src/lib/projectSaveGuard.ts`
- Modify: `apps/web/src/pages/project/index.vue`
- Modify: `apps/web/src/pages/workspace/index.vue`
- Modify: `apps/web/src/components/agent/index.vue`
- Modify: `apps/web/src/components/agent/conversation.vue`
- Modify: `apps/server/src/utils/plugins/initialize.ts`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

**Interfaces:**

- Consumes: `canvasHost.getCanvasContext()`、`canvasHost.flushSave()`、`canvasHost.cancelSave()`、`canvasHost.saveBusy`、现有 `<agent v-model>`。
- Produces: `projectRuntime` 暴露 `canvasReady`、`getCanvasContext()`、`flushSave()`、`cancelSave()` 和只读 `saveBusy`；`useProjectSaveGuard(options)` 统一两个页面的离开保护；Agent 新增 `mode?: "advanced" | "guided"`。

- [x] **Step 1: 创建不可交互但可计算尺寸的运行层**

`projectRuntime.vue` 内只挂载现有 `canvasHost`。容器使用固定 `1280px × 720px`，放置到视口外侧，设置 `inert`、`aria-hidden="true"` 和 `pointer-events: none`，不能使用 `display: none` 或零尺寸。

组件暴露：

```ts
defineExpose({
  canvasReady,
  getCanvasContext: () => canvasRef.value?.getCanvasContext(),
  flushSave: () => canvasRef.value?.flushSave(),
  cancelSave: () => canvasRef.value?.cancelSave(),
  get saveBusy() { return canvasRef.value?.saveBusy ?? false; },
});
```

- [x] **Step 2: 抽取统一离开保护**

`projectSaveGuard.ts` 导出：

```ts
export function useProjectSaveGuard(options: {
  isBusy(): boolean;
  flushSave(): Promise<void>;
  cancelSave(): void;
})
```

该函数注册 `onBeforeRouteLeave`：繁忙时阻止离开；保存失败时显示“留在项目/仍然退出”；用户明确强制退出后才调用 `cancelSave()`。把高级画布现有重复逻辑改为调用此函数，确保两个模式修复同一条保存链路。

- [x] **Step 3: 在普通项目页提供 CanvasContext**

`project/index.vue` 挂载 `projectRuntime`，并提供：

```ts
provide("canvas", () => runtimeRef.value?.canvasReady
  ? runtimeRef.value.getCanvasContext()
  : undefined);
```

只有项目加载成功且运行层 `canvasReady` 后才挂载导演助手。页面卸载和路由离开走共享保存保护。

- [x] **Step 4: 为 Agent 增加普通展示模式**

`agent/index.vue` 增加 `mode` 属性并传给 `conversation.vue`。`conversation.vue` 在 `guided` 模式下：

- 隐藏 Skill 菜单、上下文 token 面板、子 Agent 技术入口和原始工具卡片。
- 工具调用统一显示“正在更新项目…”、“项目内容已更新”或可读错误。
- 保留管理员已启用的文本模型选择、附件、消息输入、停止、重试和流式正文。
- 欢迎语改成短剧创作语言，不出现“节点”“Skill”“工作流”。

高级模式不改变现有内容和交互。

- [x] **Step 5: 创建导演助手容器**

`directorPanel.vue` 使用 `<agent v-model="visible" mode="guided" />`，桌面常驻显示，窄屏可折叠。组件不复制会话、流式请求和历史加载逻辑。

- [x] **Step 6: 验证运行层和首条消息**

Run:

```powershell
bun run --cwd apps/web typecheck
bun run --cwd apps/web build
```

Expected: 创建项目后首条 `pendingAgentMessage` 只发送一次；刷新不会重复发送；快速返回首页再打开另一个项目时不会把消息发到错误项目；Agent 能调用 `getCanvas` 和新增节点；普通页看不到画布、Skill 和原始工具参数；高级画布仍显示完整界面。

停止本地 Server 后编辑并尝试离开，确认出现保存失败提示；选择留在项目不会跳转，恢复 Server 后重试可保存。生成节点繁忙时离开被阻止。

- [x] **Step 7: 更新进度并提交推送**

```powershell
git add apps/web/src/pages/project/components/projectRuntime.vue apps/web/src/pages/project/components/directorPanel.vue apps/web/src/lib/projectSaveGuard.ts apps/web/src/pages/project/index.vue apps/web/src/pages/workspace/index.vue apps/web/src/components/agent/index.vue apps/web/src/components/agent/conversation.vue docs/superpowers/plans/guidedStudioPlan.md
git commit -m "feat(web): 接入导演助手与共享画布运行层"
git pull --rebase origin dev
git push origin dev
```

---

### Task 3: 创作视图适配、剧本与角色

**Files:**

- Create: `apps/web/src/pages/project/creativeViewAdapter.ts`
- Create: `apps/web/src/pages/project/components/scriptStage.vue`
- Create: `apps/web/src/pages/project/components/characterStage.vue`
- Modify: `apps/web/src/pages/app/dashboard.vue`
- Modify: `apps/web/src/pages/project/index.vue`
- Modify: `apps/web/src/pages/project/components/directorPanel.vue`
- Modify: `apps/web/src/components/agent/index.vue`
- Modify: `apps/web/src/components/agent/conversation.vue`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

**Interfaces:**

- Consumes: `useWorkspaceFiles(projectId)`、`CanvasContext.call(...)`、`GenerationTask[]`。
- Produces: `readCreativeView(projectId, tasks): Promise<CreativeView>`、`parseCreativeLabel(label)`、`scriptStage` 和 `characterStage` 的保存事件。

- [x] **Step 1: 定义稳定的画布标签契约**

`creativeViewAdapter.ts` 使用以下标签，不增加额外项目数据文件：

```ts
const creativeLabels = {
  script: "Minifeel/剧本",
  character: "Minifeel/角色/",
  storyboard: "Minifeel/分镜/",
  film: "Minifeel/成片/",
};
```

角色标签尾部是角色名；分镜和成片标签尾部使用三位顺序号，例如 `Minifeel/分镜/001`。用户确认的节点在末尾增加 `/已确认`，例如 `Minifeel/剧本/已确认`、`Minifeel/角色/小雨/已确认`。用户再次修改内容时使用 `renameNodes` 去掉后缀，使阶段回到 `review`。旧项目中不符合约定的节点不删除、不改名，并在 `warnings` 中提示可进入高级画布整理。

- [x] **Step 2: 实现只读创作视图适配器**

定义核心返回类型：

```ts
export type CreativeMediaCard = {
  nodeId: string;
  title: string;
  order: number;
  prompt: string;
  output?: { path: string; mimeType: string };
  task?: GenerationTask;
};

export type CreativeView = {
  script?: { nodeId: string; text: string };
  characters: CreativeMediaCard[];
  storyboard: CreativeMediaCard[];
  films: CreativeMediaCard[];
  statuses: Record<ProjectStage, ProjectStageStatus>;
  warnings: string[];
};
```

`readCreativeView` 读取 `画布1.json`，验证 `minifeelCanvas === true`、`nodes` 和节点基础字段；剧本文本从文本节点的 `data.textPath` 读取；图片、视频输出从节点 `data.outputs` 读取。任务通过 `requestSummary.input.outputDirectory === "assets/<nodeId>"` 关联到卡片。任何结构无效时抛出可读错误，不覆盖文件。

- [x] **Step 3: 收紧首页初始 Agent 提示**

保留现有 `/skill:workflow`，明确要求首轮只创建草稿节点：

```text
首轮只生成文字草稿，不调用图片或视频生成。剧本使用文本节点并命名为 Minifeel/剧本；每个角色建立图片生成节点并命名为 Minifeel/角色/<角色名>，只填写提示词；每个镜头建立图片生成节点并按顺序命名为 Minifeel/分镜/001、002……，只填写提示词。完成后整理画布并停止，等待用户确认。
```

禁止提示词要求模型创建第二份状态文件或直接修改画布 JSON。

- [x] **Step 4: 实现剧本阶段**

`scriptStage.vue` 接收 `script`、`loading` 和 `errorMessage`，使用文本编辑区展示剧本；保存时向父组件发出 `save(nodeId, text)`。父组件调用：

```ts
await canvas.call({
  name: "nodeTools",
  args: { nodeId, name: "node:setText", args: { text } },
});
await refreshCreativeView();
```

保存修改后使用 `renameNodes` 把剧本标签恢复为 `Minifeel/剧本`。用户点击“确认剧本”时只把标签改为 `Minifeel/剧本/已确认`，不重复调用文本模型或创建第二份确认数据。

缺少剧本节点时显示“让导演助手重新整理剧本”操作，该操作只向现有 Agent 填入修复指令，不创建空节点覆盖旧项目。

- [x] **Step 5: 实现角色阶段**

`characterStage.vue` 按标签展示角色名、提示词、预览、任务状态和模型选择。修改设定时调用角色节点的 `node:setPrompt` 并去掉 `/已确认` 后缀；锁定角色时使用 `renameNodes` 增加 `/已确认`。预览使用 `useWorkspaceFiles(projectId).acquireUrl(path, mimeType)`，组件卸载或路径变化时调用 `release()`。

本任务只接入角色编辑和已有图片预览；生成按钮保持禁用并显示“确认生成”说明，Task 4 接入真实确认逻辑。

- [x] **Step 6: 验证新项目和旧项目读取**

Run:

```powershell
bun run --cwd apps/web typecheck
bun run --cwd apps/web build
```

Expected: 新项目首轮生成后出现剧本、角色和分镜草稿节点；编辑剧本和角色提示词后刷新仍存在；进入高级画布可看到同一批节点和修改；普通页没有生成媒体。打开一个没有约定标签的旧项目时页面不白屏、不修改画布，并提供高级画布入口。把画布文件内容临时改成无效 JSON 后打开项目，页面显示读取失败且文件内容未变化；验证后恢复原文件。

- [x] **Step 7: 更新进度并提交推送**

```powershell
git add apps/web/src/pages/project/creativeViewAdapter.ts apps/web/src/pages/project/components/scriptStage.vue apps/web/src/pages/project/components/characterStage.vue apps/web/src/pages/app/dashboard.vue apps/web/src/pages/project/index.vue apps/web/src/pages/project/components/directorPanel.vue apps/web/src/components/agent/index.vue apps/web/src/components/agent/conversation.vue docs/superpowers/plans/guidedStudioPlan.md
git commit -m "feat(web): 接入剧本与角色创作流程"
git pull --rebase origin dev
git push origin dev
```

---

### Task 4: 生成估价与确认

**Files:**

- Create: `apps/server/src/routes/generation/estimate.ts`
- Modify: `apps/server/src/utils/generation/index.ts`
- Generated: `apps/server/src/router.ts`
- Modify: `apps/server/src/routes/ai/generate.ts`
- Modify: `apps/server/src/routes/ai/media/generate.ts`
- Modify: `apps/server/src/agent/runtime/model.ts`
- Modify: `apps/server/src/agent/tools/index.ts`
- Create: `apps/web/src/pages/project/components/generationConfirm.vue`
- Modify: `apps/web/src/stores/userApp.ts`
- Modify: `apps/web/src/pages/project/components/characterStage.vue`
- Modify: `apps/web/src/pages/project/index.vue`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

**Interfaces:**

- Consumes: `parsePricing`、`estimateUsage`、`calculateCredits`、现有模型归属和白名单规则、节点 `getConfig`/`setConfig`/`generateImage`/`generateVideo`。
- Produces: `estimateGenerationTask(userId, input)`；`POST /api/generation/estimate`；`userAppStore.estimateGeneration(input)`；统一生成确认组件。

- [x] **Step 1: 抽取创建与估价共用的模型校验**

在 `utils/generation/index.ts` 内提取私有查询函数，使任务创建和估价共用以下检查：项目归属、用户状态、模型启用、供应商启用、连接测试、媒体类型、价格结构和白名单。不能在路由复制 SQL 或积分算法。

新增导出：

```ts
export async function estimateGenerationTask(userId: string, input: {
  projectId: string;
  modelId: string;
  request: Record<string, unknown>;
}) {
  // 返回 taskType、estimatedUsage、estimatedCredits、billable
}
```

`createGenerationTask` 改为调用同一内部校验和估价逻辑，实际冻结积分的事务行为保持不变。

- [x] **Step 2: 添加只读估价接口**

`routes/generation/estimate.ts` 使用 Zod 校验：

```ts
const inputSchema = z.object({
  projectId: z.uuid(),
  modelId: z.uuid(),
  request: z.record(z.string(), z.json()),
});
```

接口返回：

```ts
{
  taskType: "image" | "video" | "text";
  estimatedUsage: Record<string, number>;
  estimatedCredits: number;
  billable: boolean;
}
```

只计算估价，不创建任务、不冻结积分、不调用供应商。

- [x] **Step 3: 生成路由并验证接口副作用**

Run:

```powershell
bun run --cwd apps/server routes
bun run --cwd apps/server typecheck
bun run --cwd apps/server build
```

Expected: 路由生成、类型检查和构建退出码为 `0`。使用登录会话实际调用估价接口，确认任务表和积分流水数量调用前后不变；无权项目返回 `404`；停用模型返回 `409`；白名单视频返回 `estimatedCredits: 0`。

- [x] **Step 4: 给用户 Store 增加估价能力**

`userApp.ts` 增加：

```ts
export type GenerationEstimate = {
  taskType: "text" | "image" | "video";
  estimatedUsage: Record<string, number>;
  estimatedCredits: number;
  billable: boolean;
};

async function estimateGeneration(input: {
  projectId: string;
  modelId: string;
  request: Record<string, unknown>;
}): Promise<GenerationEstimate>;
```

方法只调用 `/generation/estimate`，不缓存过期估价。

- [x] **Step 5: 创建统一确认组件**

`generationConfirm.vue` 只负责展示和确认，属性包括 `modelName`、`generationType`、`count`、`estimatedCredits`、`availableCredits`、`loading`；发出 `confirm` 和 `cancel`。积分不足时禁用确认按钮，并显示缺少的积分数量。

- [x] **Step 6: 接入角色图片生成**

用户选择管理员公开的图片模型后，父组件先调用角色节点 `node:getConfig`，再用 `node:setConfig` 设置同一个 `modelId`，根据节点提示词和配置请求服务端估价。用户确认后才调用 `node:generateImage`。

调用返回“已开始”后立即刷新任务与账户，并在存在 `pending`/`running` 任务时每 2 秒刷新；任务进入终态后停止该轮轮询并重新读取创作视图。

如果估价后模型被停用、积分被其他任务占用或后端拒绝创建，显示后端错误、刷新账户和模型，不在前端假装任务成功。

- [x] **Step 7: 验证确认门禁**

Run:

```powershell
bun run --cwd apps/web typecheck
bun run --cwd apps/web build
```

Expected: 取消确认不会产生任务或积分流水；确认前能看到真实模型、数量和估价；积分不足不能确认；白名单视频估价显示 0；估价后停用模型再确认会显示错误并刷新模型；图片任务成功后角色卡出现结果，失败或取消后冻结积分退回。

- [x] **Step 8: 更新进度并提交推送**

```powershell
git add apps/server/src/routes/generation/estimate.ts apps/server/src/utils/generation/index.ts apps/server/src/router.ts apps/server/src/routes/ai/generate.ts apps/server/src/routes/ai/media/generate.ts apps/server/src/agent/runtime/model.ts apps/server/src/agent/tools/index.ts apps/web/src/pages/project/components/generationConfirm.vue apps/web/src/stores/userApp.ts apps/web/src/pages/project/components/characterStage.vue apps/web/src/pages/project/index.vue docs/superpowers/plans/guidedStudioPlan.md
git commit -m "feat(web): 添加生成估价与积分确认"
git pull --rebase origin dev
git push origin dev
```

---

### Task 5: 分镜、成片与任务恢复

**Files:**

- Create: `apps/web/src/pages/project/components/storyboardStage.vue`
- Create: `apps/web/src/pages/project/components/filmStage.vue`
- Modify: `apps/web/src/pages/project/creativeViewAdapter.ts`
- Modify: `apps/web/src/pages/project/index.vue`
- Modify: `apps/web/src/stores/userApp.ts`
- Modify: `apps/web/src/pages/app/appFormat.ts`
- Modify: `apps/server/src/routes/ai/media/generate.ts`
- Modify: `apps/server/src/routes/generation/cancel.ts`
- Modify: `apps/server/src/utils/generation/index.ts`
- Modify: `packages/nodeScaffold/src/nodeAi.ts`
- Modify: `packages/nodes/imageGenerationNode/src/index.vue`
- Modify: `packages/nodes/videoGenerationNode/src/index.vue`
- Modify: `docs/productExperienceIssues.md`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

**Interfaces:**

- Consumes: `CreativeView`、`GenerationEstimate`、统一确认组件、节点 `setPrompt`/`setConfig`/`generateImage`/`generateVideo`、任务列表和工作区文件 URL。
- Produces: 可编辑和排序的分镜卡、视频任务与成片预览、刷新后可恢复的阶段状态。

- [x] **Step 1: 补全生成任务公开类型**

`GenerationTask` 增加服务端已经返回的字段：

```ts
requestSummary?: {
  input?: Record<string, unknown>;
  billing?: { billable?: boolean; estimatedUsage?: Record<string, number> };
};
result?: { files?: Array<{ path: string; mimeType: string }> } | null;
startedAt?: string | null;
heartbeatAt?: string | null;
```

不在前端推测供应商任务 ID，也不展示原始请求中的敏感字段。

- [x] **Step 2: 实现分镜阶段**

`storyboardStage.vue` 展示顺序、镜头描述、图片预览、模型、任务状态、编辑、单个生成和批量生成。调整顺序时批量调用 `renameNodes`，把标签重新编号为连续三位编号；任一节点校验失败时整批不提交。修改镜头描述时去掉 `/已确认`，用户确认镜头后再增加该后缀。

批量生成使用用户在分镜阶段选择的同一个管理员公开模型。先为所有待生成节点读取并设置实际配置，按各节点请求分别估价，确认框展示模型、总数量和总预计积分；用户确认后顺序触发节点生成，单个失败记录在对应卡片，不覆盖已经成功的镜头。

- [x] **Step 3: 实现视频生成入口**

对已经确认图片的分镜创建或复用 `remote-videoGenerationNode`，标签使用相同顺序的 `Minifeel/成片/<编号>`。调用视频节点 `getConfig` 读取模型能力：支持参考图时通过现有画布工具连接分镜图片输出与视频节点输入；仅支持文生视频时移除不兼容引用并使用分镜提示词。随后调用 `setConfig`、`setPrompt`，估价确认后调用 `generateVideo`。

视频模型时长、分辨率、模式和引用数量全部使用 `getConfig` 返回的能力，不写死供应商不支持的选项。当前视频分钟限频由后端错误显示在对应镜头，不做无限自动重试。

- [x] **Step 4: 实现成片阶段**

`filmStage.vue` 按镜头展示视频任务进度、失败原因、退款、预览和下载。预览通过 `useWorkspaceFiles(projectId).acquireUrl` 获取；下载复用 `downloadFile` 与 `files.read(path)`，不暴露服务器真实路径。

第一版把各镜头视频片段作为“成片结果”展示，不新增时间线拼接、字幕、配音和转场。

- [x] **Step 5: 实现任务轮询与阶段恢复**

项目页首次加载并行读取项目、模型、账户、任务和创作视图。存在当前项目的 `pending`/`running` 任务时每 2 秒刷新任务和账户；页面隐藏时暂停轮询，重新可见后立即刷新；组件卸载时清理定时器。

阶段状态规则：

- 没有对应节点为 `notStarted`。
- 存在活动任务为 `running`。
- 存在失败任务且没有活动任务为 `failed`。
- 已有草稿、未确认节点或未完成生成为 `review`。
- 剧本标签带 `/已确认` 时剧本阶段为 `complete`；角色和分镜节点全部带 `/已确认` 且所需图片已有结果时对应阶段为 `complete`；成片节点全部有成功视频结果时成片阶段为 `complete`。

- [x] **Step 6: 统一用户可读错误**

扩展 `friendlyTaskError`，把限频、积分不足、模型停用、供应商连接失败、任务取消和服务重启恢复映射为用户可执行的提示；保留未知错误的服务端脱敏消息，不显示堆栈、请求体或 API Key。

把测试中发现的问题记录到 `docs/productExperienceIssues.md`，已修复项写明提交，不删除仍需后续处理的历史记录。

- [x] **Step 7: 验证分镜到成片流程**

Run:

```powershell
bun run --cwd apps/web typecheck
bun run --cwd apps/server typecheck
bun run --cwd apps/web build
bun run --cwd apps/server build
```

Expected: 分镜编辑和重新排序刷新后保持；取消批量确认不产生任务；图片成功、失败、取消分别显示正确状态；运行中刷新页面可恢复任务；重启 Server 后数据库任务仍可查询，失联任务按现有 Worker 规则失败并退款；高级画布看到同一批图片和视频节点。

视频真实调用遵守一分钟一次限制：先与其他调用者错开，只提交一个最短镜头；返回限频时记录问题并验证错误展示，不重复抢占额度。

实际验证（2026-09-29）：项目 `7827953c-6f80-4a8e-90ff-a38795a392b7` 展示 3 个分镜；批量确认准确显示 3 项、预计 3 积分，取消后任务和积分不变；调整分镜顺序后刷新仍保持，并已恢复原顺序；成片阶段显示 3 个镜头和管理员启用的 Agnes 模型。媒体任务按项目与输出目录互斥，刷新后重复生成会复用活动任务，删除节点先取消同目录活动任务；主动停止使用请求发出前生成的 requestId 消除响应头竞态。Web、Server、节点脚手架、图片节点和视频节点类型检查通过，Web 与 Server 生产构建通过。本轮按用户要求不调用共享视频接口，真实视频输出、服务重启中断与退款留到 Task 6 的无并发窗口验收。

- [x] **Step 8: 更新进度并提交推送**

```powershell
git add apps/web/src/pages/project/components/storyboardStage.vue apps/web/src/pages/project/components/filmStage.vue apps/web/src/pages/project/creativeViewAdapter.ts apps/web/src/pages/project/index.vue apps/web/src/stores/userApp.ts apps/web/src/pages/app/appFormat.ts apps/server/src/routes/ai/media/generate.ts apps/server/src/routes/generation/cancel.ts apps/server/src/utils/generation/index.ts packages/nodeScaffold/src/nodeAi.ts packages/nodes/imageGenerationNode/src/index.vue packages/nodes/videoGenerationNode/src/index.vue docs/productExperienceIssues.md docs/superpowers/plans/guidedStudioPlan.md
git commit -m "feat(web): 完成分镜与成片创作流程"
git pull --rebase origin dev
git push origin dev
```

---

### Task 6: 全流程验收与生产部署

**Files:**

- Modify: `docs/productExperienceIssues.md`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`
- Modify only if validation finds a defect: files owned by Tasks 1–5

**Interfaces:**

- Consumes: Tasks 1–5 的普通工作台、高级画布、生成任务、积分和生产 Compose。
- Produces: 已验证并部署的 `dev` 提交、线上访问结果和完整问题清单。

- [x] **Step 1: 执行提交前静态验证**

Run:

```powershell
bun run typecheck
bun run build
git diff --check
git status --short --branch
```

Expected: 类型检查、生产构建和差异检查退出码为 `0`；状态只包含本阶段有意修改。仓库中没有新增测试文件、真实 API Key 或 `.superpowers/` 文件。

- [x] **Step 2: 使用测试账号跑普通用户冒烟流程**

使用 `18800001002 / Minifeel1002`：

1. 登录并确认进入 `/app`。
2. 输入一个适合约 15 秒竖屏短片的故事。
3. 确认进入普通项目页且首轮只生成文字草稿。
4. 编辑剧本并刷新验证保存。
5. 修改角色设定，取消一次图片确认，确认无任务和积分变化。
6. 正式生成一个角色图和至少一个分镜图。
7. 调整分镜顺序并进入高级画布核对节点。
8. 在额度允许时生成一个最短视频镜头。
9. 刷新成片页，验证预览、下载、任务状态和积分流水。
10. 返回首页再打开项目，确认阶段和内容恢复。

积分不足时使用管理员后台给该测试账号增加本轮所需积分，并在问题清单记录实际增加值。

实际验证（2026-09-29）：测试账号 `18800001002` 登录后余额为 980；项目 `7827953c-6f80-4a8e-90ff-a38795a392b7` 的剧本编辑刷新后保留，两个角色、三个分镜和阶段入口正常；图片确认取消不产生任务或扣费，既有真实角色图片可预览；分镜排序刷新后保持并已恢复原顺序；高级画布显示同一批剧本、角色和分镜节点，返回按钮回到同一项目的普通创作页。结合 Task 4 已完成的真实角色图片生成和前序全流程项目中的 3 张分镜图片，本轮不重复消耗图片积分。共享 Agnes 视频密钥仍受一分钟一次及协作者共用限制，按用户要求未发起新视频调用，因此没有新增视频预览与下载证据。

- [x] **Step 3: 跑权限与异常冒烟**

普通用户不能进入 `/admin`、不能看到 API Key 和供应商参数；管理员仍能进入后台配置与调试模型。停用一个未在运行任务中使用的测试模型，确认普通页立即不再允许新任务选择，恢复后重新出现。

断开 Server 后编辑并离开，确认保存拦截；恢复 Server 后保存成功。刷新运行任务页面和重启开发 Server，确认任务状态从后端恢复。

实际验证（2026-09-29）：分别使用管理员与普通测试账号直接请求管理员模型接口，管理员返回 200 且角色为 `admin`，普通用户返回 403 且角色为 `user`；普通用户浏览器直接访问 `/admin` 被路由到 `/app`。模型停用/恢复、保存失败拦截已分别由 Task 4、Task 2 的实际验证覆盖，相关链路本阶段未修改。Task 5 已把媒体任务与浏览器连接解耦，并通过数据库活动任务、同输出目录互斥和请求前 requestId 取消机制覆盖刷新与停止竞态；受视频限流约束，本阶段未制造新的运行中媒体任务重启 Server。

- [x] **Step 4: 修复发现的阻断问题并重复相关验证**

只修复本次流程中可复现的根因。每个问题在 `docs/productExperienceIssues.md` 记录复现条件、根因、修复文件和验证结果。出现代码缺陷时重新打开负责该文件的 Task 1–5，在该任务中完成修复、验证、进度更新和提交；修复后重复对应阶段及其后续依赖步骤，不重复没有受影响的完整检查。

- [x] **Step 5: 更新计划并提交最终验收**

把 Task 6 状态、实际生成结果、视频调用结果、已知限制和验证命令写入本计划。代码缺陷已按 Step 4 回到所属任务提交，本步骤只提交验收记录：

```powershell
git add docs/productExperienceIssues.md docs/superpowers/plans/guidedStudioPlan.md
git commit -m "docs: 记录导演式创作流程验收结果"
git pull --rebase origin dev
git push origin dev
```

- [x] **Step 6: 备份并部署生产环境**

确认远程 `dev` 指向本地最终提交后，在服务器 `/opt/minifeel` 执行现有部署脚本：

```sh
cd /opt/minifeel
./scripts/deployProduction.sh
```

脚本必须先备份 PostgreSQL，再 `git pull --ff-only`、构建和启动 Compose。部署完成后执行：

```sh
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs --tail=200 minifeel
```

Expected: PostgreSQL、Minifeel 和当前启用的反向代理容器健康；数据库和 `/app/data` 卷没有被重建；线上提交号等于远程 `dev`。

实际部署（2026-09-29）：部署脚本先生成 PostgreSQL 备份 `/opt/minifeel/backup/database-20260929-225026.dump`（57K）。服务器拉取 GitHub 长时间无响应后停止该网络步骤，改用本地校验通过的完整 Git bundle 将 `/opt/minifeel` 从 `a20234b` 快进到 `0c7e759`，再使用现有生产 Compose 构建并替换 Minifeel 容器；没有重建 PostgreSQL 或应用数据卷。PostgreSQL、Minifeel 均为 `healthy`，Caddy 持续运行；应用日志显示服务在 3000 端口启动成功。

- [x] **Step 7: 线上只跑一次低成本验收**

使用测试账号打开服务器访问地址，验证登录、首页、普通项目路由、剧本读取、角色/分镜预览、高级画布入口和任务列表。只有本地真实媒体流程已经通过且视频调用额度空闲时，线上再提交一个最短视频；否则只验证已有结果和任务恢复，避免重复消耗额度。

把线上提交号、容器健康状态、访问地址和未解决问题写入本计划，提交并推送最后一次文档更新。

实际验收（2026-09-29）：访问 `http://117.72.202.33/` 返回 200 并加载 Minifeel；测试账号 `18800001002` 密码登录成功，`/api/auth/me` 返回普通用户，项目列表返回 1 个项目且项目详情可读取，访问管理员模型接口返回 403。线上代码提交为 `0c7e7597da369884133f1ac52be96cfc8570e019`。本轮只读取现有项目和媒体结果，未提交文本、图片或视频任务，未消耗积分；共享 Agnes 视频接口继续按 CHECK-003 停止调用。`minifeel.cn` 尚未配置解析与证书，当前验收地址仍为服务器 IP。

### Task 7: 宽屏布局与开发规范修正

**Files:**

- Modify: `apps/web/src/pages/project/index.vue`
- Modify: `AGENTS.md`
- Modify: `docs/productExperienceIssues.md`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

- [x] **Step 1: 复现并量化宽屏布局问题**

在 2048 × 1022 视口中验证项目页。侧边栏后的内容区宽 1806px，但公共 `.studioPage` 将项目页限制为 1280px；项目三栏实际宽度为 `220px / 568px / 340px`，左右出现大面积空白。主创作卡高 662px，右栏高 1181px，底部边界不齐。

- [x] **Step 2: 修正项目页宽度与网格对齐**

只在项目页覆盖公共阅读宽度，使用侧边栏外的完整可用空间；宽屏三栏调整为 `220px / minmax(0, 1fr) / 360px`，主创作卡随右栏拉伸，阶段导航保持顶部对齐。中等视口提前切换为两栏，并让导演助手跨满整行；移动端继续使用单栏与横向阶段导航。

- [x] **Step 3: 补充仓库开发规范**

根目录 `AGENTS.md` 增加项目定位、Toonflow 继承边界、工作流程、UI 响应式、安全与第三方规范；明确未收到当前任务的服务器部署指令时，禁止 SSH、文件同步、远程 Git、生产 Compose、数据库迁移、反向代理修改和容器重启。提交、推送或“继续开发”不构成部署授权。

- [x] **Step 4: 执行静态与多视口验证**

执行 Web 类型检查、Web 生产构建、`git diff --check`，并在 2048px、1280px、720px 视口确认页面宽度、网格列、底部边界和横向溢出。

实际验证（2026-09-29）：Web 类型检查和生产构建退出码为 0，`git diff --check` 通过。2048px 下项目页宽度与侧边栏后的 1806px 内容区一致，三栏为 `220px / 1090px / 360px`，主创作卡和右栏底部完全对齐且无横向溢出；1280px 下切换为两栏，导演助手跨满下一行；720px 下切换为单栏，阶段导航可横向滚动且页面无横向溢出。浏览器控制台无错误。

- [x] **Step 5: 更新问题清单并提交推送**

记录根因、修改文件和实际验证结果，使用中文 Conventional Commit 提交并推送到 `dev`。本阶段不执行任何服务器部署操作。

### Task 8: 阶段导航与媒体预览优化

**Files:**

- Modify: `apps/web/src/pages/project/index.vue`
- Modify: `apps/web/src/pages/project/components/projectStages.vue`
- Modify: `apps/web/src/pages/project/components/characterStage.vue`
- Modify: `apps/web/src/pages/project/components/storyboardStage.vue`
- Modify: `docs/productExperienceIssues.md`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

- [x] **Step 1: 收紧阶段导航布局**

将四阶段导航移到项目标题下方横向排列，宽屏主体只保留创作内容和导演助手两列；小于 1360px 时内容与助手上下排列，小于 720px 时步骤栏横向滚动。创作内容按自身高度收口，不再由右栏高度强制拉伸。

- [x] **Step 2: 完整展示角色与分镜图片**

角色和分镜卡片扩大媒体区域，图片统一使用 `object-fit: contain` 保留原始比例；沿用 `useWorkspaceFiles(projectId).acquireUrl()` 的加载和释放流程，不改变画布、节点或媒体文件结构。

- [x] **Step 3: 增加图片放大预览**

角色和分镜图片使用可聚焦按钮承载，点击后通过带标题和真实关闭按钮的 Element Plus 对话框完整查看；项目或输出路径变化时关闭预览，避免继续引用已经释放的 Blob URL。图片监听使用稳定的输出签名，普通任务轮询不会反复释放 Blob URL 或关闭预览。

- [x] **Step 4: 执行静态与浏览器验证**

实际验证（2026-09-30）：Web 类型检查、生产构建和 `git diff --check` 通过。项目 `7827953c-6f80-4a8e-90ff-a38795a392b7` 在 2048px 视口显示横向四阶段导航，两个角色四视图与三张分镜均完整显示；角色图和分镜图点击后均打开有标题和真实关闭按钮的预览对话框，Tab 可聚焦关闭按钮，Escape 可关闭。720px 视口页面 `scrollWidth` 为 714、`innerWidth` 为 720，无页面级横向溢出；控制台无错误或警告。本阶段未部署服务器。

### Task 9: 普通用户一级入口视觉统一

**Files:**

- Modify: `apps/web/src/assets/main.scss`
- Modify: `apps/web/src/pages/app/index.vue`
- Modify: `apps/web/src/pages/app/components/appSidebar.vue`
- Modify: `apps/web/src/pages/app/dashboard.vue`
- Modify: `apps/web/src/pages/app/assets.vue`
- Modify: `apps/web/src/pages/app/tasks.vue`
- Modify: `apps/web/src/pages/app/account.vue`
- Modify: `AGENTS.md`
- Modify: `docs/productExperienceIssues.md`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

- [x] **Step 1: 盘点同类入口与共享视觉层**

确认普通用户侧栏、创作首页、资产、任务和账户属于同一产品层级，但当前只有项目创作页完整采用导演式工作台设计；资产页仍维护独立页面宽度和标题样式，首页、任务与账户虽复用部分 Token，页面骨架和信息层级仍不一致。

- [x] **Step 2: 统一公共页面骨架与导航**

扩展现有 Studio Token 和公共页面样式，统一页面标题区、卡片、阴影、间距和响应式规则；侧栏增加清晰的创作分区、入口说明和项目内选中态，移动端继续使用底部导航。

- [x] **Step 3: 同步改造四个一级业务页**

创作首页改为导演式灵感入口与项目区；资产页接入公共页面骨架，媒体缩略图完整展示并保留放大预览；任务页增加基于现有任务数据的概览和统一筛选区；账户页统一档案、积分、设备与流水卡片层级。业务接口、状态管理和数据结构保持不变。

- [x] **Step 4: 固化同类入口同步规则**

根目录 `AGENTS.md` 明确：用户点名页面只是问题样本，修改功能、交互或视觉效果前必须搜索所有同类入口、相似组件和共享调用方；同一产品语义必须同步修改，不适用时说明原因。

- [x] **Step 5: 执行静态与多页面验证**

执行 Web 类型检查、生产构建和 `git diff --check`；在宽屏桌面、普通桌面和移动端检查创作首页、资产、任务、账户及项目页，确认侧栏选中态、媒体完整展示、页面宽度和响应式布局一致且无横向溢出。

实际验证（2026-09-30）：Web 类型检查与生产构建通过。登录测试账号后，在 2552px、2048px、1280px 和 720px 视口依次打开创作首页、资产、任务、账户及项目 `7827953c-6f80-4a8e-90ff-a38795a392b7`；四个一级入口均正确显示选中态，项目路由保持选中“创作首页”，各视口页面 `scrollWidth` 均未超过 `innerWidth`。2552px 下普通页面使用完整的 2300px 内容区，首页改为上下结构，创作对话框宽 2086px 并占满首屏主内容，资产区为 6 列大卡片；资产缩略图使用完整比例展示，720px 下创作对话框宽 648px，并使用底部导航和 2 列资产。浏览器控制台无错误。本阶段未部署服务器。

补充（2026-10-07）：创作首页保留最近项目，同时新增独立“我的项目”一级入口以浏览、搜索、排序并打开全部项目；项目创作页在宽屏使用固定主编辑区和内部滚动，窄屏恢复页面滚动。该改动复用原有 `workspaceStore`、项目路由、工作目录和保存链路，未新增数据源或工作流。Web 类型检查与生产构建通过；登录后的多视口交互复验留待下一轮界面验收。

### Task 10: 生产保存接口稳定性修复

**Files:**

- Modify: `apps/web/src/lib/mcpControl.ts`
- Modify: `apps/web/src/pages/project/index.vue`
- Modify: `apps/web/src/pages/project/components/projectRuntime.vue`
- Modify: `apps/web/src/pages/workspace/index.vue`
- Modify: `apps/web/src/pages/workspace/panels/document/index.vue`
- Modify: `docs/productExperienceIssues.md`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

- [x] **Step 1: 定位生产包中的失败调用**

只读比对线上与本地静态资源，确认线上入口和项目资源哈希不是本地最新构建；生产包中的 `ref.value?.flushSave()` 只检查组件引用，没有检查方法是否已就绪。

- [x] **Step 2: 修复共享保存边界**

普通创作运行层、项目保存守卫、高级工作区和 MCP 项目切换均改为同时检查组件实例与公开方法；保留现有保存队列和错误传播语义。

- [x] **Step 3: 修复同流程卸载异常**

文档面板停用时先确认编辑器尚未销毁，再清理搜索与焦点，避免快速切换或退出时读取空命令管理器。

- [x] **Step 4: 本地生产模式验证**

实际验证（2026-10-01）：Web 类型检查与生产构建退出码为 0，构建产物不再包含 `ref.value?.flushSave()` 危险调用。生产环境部署提交 `7bc22e6` 后，使用测试账号打开现有项目，完成普通创作页加载、进入高级画布、切换文档与画布并返回创作页；未出现“项目未保存”或 `flushSave is not a function`。部署前已备份 PostgreSQL 和持久化数据卷，应用、PostgreSQL 与 Caddy 容器均正常。

### Task 11: HTTP 生产环境 UUID 兼容

**Files:**

- Modify: `apps/web/src/main.ts`
- Modify: `docs/productExperienceIssues.md`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

- [x] **Step 1: 建立生产失败证据**

在 `http://117.72.202.33/` 使用普通测试账号进入项目和高级画布，确认 `flushSave` 已修复，同时捕获导演助手挂载时的 `crypto.randomUUID is not a function`。该接口在 localhost 可用，但当前 HTTP IP 地址不属于安全上下文。

- [x] **Step 2: 补齐浏览器兼容入口**

只在原生 `crypto.randomUUID` 缺失时，基于 HTTP 环境仍可用的 `crypto.getRandomValues` 生成 UUID v4；保留版本位和变体位，不改动现有对话、画布、节点和请求调用方。

- [x] **Step 3: 本地静态验证**

Web 类型检查和生产构建通过。

- [x] **Step 4: 重新部署并执行生产浏览器复验**

部署目标提交后，重新验证登录、普通项目、导演助手、高级画布、文档与画布切换和返回创作页；确认无 `randomUUID`、`flushSave` 或未保存弹窗错误，并核对容器健康与日志。

实际验证（2026-10-01）：生产环境部署提交 `1436adc`，公开入口加载 `index-BCDzR3bI.js`。在 `isSecureContext=false` 的全新隔离浏览器中，`crypto.randomUUID` 已为函数且返回有效 UUID v4；测试账号登录和 4 个项目读取成功，普通项目导演助手正常挂载，高级画布可切换文档与画布并返回创作页。未出现 `randomUUID`、`flushSave`、“项目未保存”或浏览器应用错误，退出登录返回 200；未调用文本、图片或视频模型。

### Task 12: 生图等待体验修复

**Files:**

- Modify: `apps/web/src/pages/project/index.vue`
- Modify: `apps/web/src/pages/project/components/characterStage.vue`
- Modify: `apps/web/src/pages/project/components/storyboardStage.vue`
- Modify: `apps/web/src/pages/app/tasks.vue`
- Modify: `docs/productExperienceIssues.md`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

- [x] **Step 1: 定位轮询闪烁根因**

确认媒体任务每 2 秒刷新任务与账户后都会调用创作视图刷新；刷新无条件切换 `creativeLoading`，导致角色、分镜或成片内容被阶段级 loading 占位反复替换。

- [x] **Step 2: 区分首次加载与后台轮询**

首次进入项目继续显示阶段加载状态；任务轮询使用静默刷新，保留现有卡片和媒体预览。静默刷新失败时保留当前内容并沿用轮询错误提示，不把整个阶段清空。

- [x] **Step 3: 移除媒体虚假进度**

角色和分镜卡片只显示“正在生成”；任务中心的图片任务使用不确定状态进度条。文本任务保留现有内部进度表现，视频任务继续展示供应商返回的真实进度。

- [x] **Step 4: 执行本地验证**

执行 Web 类型检查、生产构建和 `git diff --check`；复核首次进入仍有加载反馈，媒体轮询不再切换阶段内容，且图片入口不展示百分比。本阶段不调用真实媒体接口、不消耗积分、不部署服务器。

实际验证（2026-10-08）：`bun run typecheck` 与 `bun run build` 均通过；本地前端首页与后端认证配置接口返回 200。静态调用链确认只有任务轮询使用静默刷新，角色与分镜显示“正在生成”，任务中心仅对图片使用不确定状态，视频仍展示供应商返回的真实进度。未发起真实图片或视频生成，因此没有消耗积分；未部署服务器。

### Task 13: 导演助手历史消息与状态展示修复

**Files:**

- Modify: `apps/server/src/routes/agent.ts`
- Modify: `apps/server/src/agent/runtime/index.ts`
- Modify: `apps/server/src/agent/runtime/sessions.ts`
- Modify: `apps/web/src/components/agent/conversation.vue`
- Modify: `docs/productExperienceIssues.md`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

- [x] **Step 1: 定位共享会话链路**

确认创作首页把用户原始需求和内部工作流指令分别保存为 `displayPrompt` 与 `prompt`，但请求只提交内部指令；Server 因此把内部指令写入会话。历史恢复后，普通导演助手又逐项渲染每个推理段和工具调用，TDesign 默认样式把回到底部按钮绝对定位在消息区中间。

- [x] **Step 2: 分离模型输入与用户展示内容**

Agent 接口接收长度受限的 `displayPrompt`。完整 `prompt` 继续用于模型执行，只有技能指令的首条用户记录使用 `displayPrompt` 生成可见消息和会话名；普通消息与附件消息不接受替代显示内容。已有自动工作流会话在读取时提取“用户的创作需求”，不改写原始 JSONL 或模型上下文。

- [x] **Step 3: 收敛导演助手状态**

共享对话组件在 `guided` 模式只显示一条实时整理状态，并按错误、运行、中断、成功的优先级汇总同一回复的工具结果；完成后的多段思考不再进入普通用户界面。`advanced` 模式继续展示完整思考与工具明细。回到底部按钮只在导演助手中固定到消息区右下角。

- [x] **Step 4: 执行本地验证**

Server、Web 类型检查与生产构建通过。账号 `18800001002` 的项目 `670029b6-5a4f-408b-a606-1fe12ead2c2f` 通过会话接口与 Codex 浏览器复验：用户消息仅显示“治愈萌宠：橘猫每天清晨叫醒独居老人，做成连续短剧”，无 `/skill:workflow` 和“已完成思考”，同一回复只显示一条“项目内容已更新”；Minifeel 高级画布仍显示完整思考明细，浏览器控制台无错误。本轮未调用文本、图片或视频模型，未消耗积分，未部署服务器。

### Task 14: 镜头素材链与视频模型能力规划

**Status:** 已完成上游分析和方案固化，业务实现待后续阶段执行。

**Files:**

- Modify: `docs/superpowers/plans/guidedStudioPlan.md`
- Future Modify: `apps/web/src/pages/project/index.vue`
- Future Modify: `apps/web/src/pages/project/creativeViewAdapter.ts`
- Future Modify: `apps/web/src/pages/project/components/storyboardStage.vue`
- Future Modify: `apps/web/src/pages/project/components/filmStage.vue`
- Future Modify: `packages/nodes/imageGenerationNode/src/index.vue`
- Future Modify: `packages/nodes/videoGenerationNode/src/index.vue`
- Future Modify: `packages/providers/src/media/*`

#### 保存的 Minifeel 镜头素材调用链

角色、场景、道具和风格参考先参与分镜图生成；生成视频时，分镜图继续负责画面构图和首帧约束，同时把当前镜头实际出现的角色、场景、道具和风格作为独立参考传给视频模型。这里的“使用全部素材”指使用当前镜头的相关素材，不是把项目里无关的全部素材塞进每次请求。

```mermaid
flowchart LR
  subgraph assets[项目素材]
    character[角色图]
    scene[场景图]
    prop[道具图]
    style[风格参考]
  end

  script[剧本与镜头描述] --> storyboard[分镜图生成]
  character --> storyboard
  scene --> storyboard
  prop --> storyboard
  style --> storyboard

  storyboard --> bundle[当前镜头素材包]
  character --> bundle
  scene --> bundle
  prop --> bundle
  style --> bundle
  previous[上一片段尾帧或视频\n后续增强] -. 延期 .-> bundle

  bundle --> capability{视频模型能力匹配}
  capability -->|首帧与多参考可同时使用| preferred[首帧控制 + 角色/场景/道具参考]
  capability -->|缺少任一核心能力| limited[仅允许高级画布或管理员调试]
  capability -->|只支持文本| blocked[阻止普通镜头制作\n提示管理员配置兼容模型]

  preferred --> clip[视频片段]
  clip --> output[本地工作区资产与画布视频节点]
```

画布边仍是节点之间素材依赖的唯一事实来源。普通创作页只负责为用户建立和维护这些真实连接，高级画布继续读取同一节点、边、任务和工作区文件；不能另建一份只供普通页使用的引用关系。

#### Toonflow 视频片段的实际生成链路

本次以 Toonflow 上游提交 `72a895c26aab3f54c5a914517615362208fa6008` 为基线进行源码静态核验。Toonflow 的视频节点支持图片生视频，也支持首尾帧控制和图片、视频、音频多参考输入。

```mermaid
flowchart LR
  edges[画布输入边与 referenceOrder] --> references[useNodeReferences 读取并排序引用]
  models[/api/ai/media/models] --> matching[按模型 mode 匹配输入数量与类型]
  references --> matching
  prompt[用户提示词与字符串输入] --> request[视频生成请求]
  matching --> request
  request --> client[nodeAi.generateVideo]
  client --> route[POST /api/ai/media/generate]
  route --> validation[校验工作区、模型与媒体参数]
  validation --> files[读取本地引用并识别 MIME]
  files --> provider[供应商适配器 generateVideo]
  provider --> remote[创建并轮询供应商视频任务]
  remote --> result[URL、Base64 或二进制结果]
  result --> persist[校验真实媒体类型并写入 assets/节点目录]
  persist --> nodeOutput[视频节点输出 VIDEO]
```

上游实现的关键事实：

- 视频节点输入同时接受 `IMAGE`、`VIDEO`、`AUDIO` 和 `STRING`，并从真实画布边读取引用；`referenceOrder` 用于稳定引用顺序。
- 模型能力通过 `mode` 声明。现有模式包含纯文本、单图、首尾帧必填、首帧或尾帧可选，以及形如 `imageReference:n`、`videoReference:n`、`audioReference:n` 的多参考上限。
- 视频请求结构已经包含 `images`、`videos`、`audios`、`firstFrame`、`lastFrame`、宽高比、分辨率、时长和原生音频开关。
- Server 从工作区读取引用文件并转换为供应商需要的输入，供应商返回 URL、Base64 或二进制后，Server 会校验实际媒体内容并持久化到项目目录，再把结果回填给视频节点。
- 上游内置的 Seedance、Wan 和 MiniMax 等适配器已经存在图片生视频、首帧控制或多媒体参考模式，所以 Toonflow 的运行框架本身并不局限于文生视频。

#### 上游模式与 Minifeel 目标之间的缺口

Toonflow 当前把一次请求选择为一种 `mode`：首帧类模式走 `firstFrame`、`lastFrame`，多参考模式走 `images`、`videos`、`audios`。视频节点和现有供应商适配器没有把“分镜图作为首帧”与“角色、场景、道具作为独立参考”表达成一个可同时启用的能力组合。

因此 Minifeel 不能只依赖当前模型列表来决定产品链路。后续应先定义短剧镜头需要的模型能力，再接入满足能力的供应商；不满足最低能力的模型不能被普通用户误认为完整的“根据分镜生成视频”。

#### Minifeel 视频模型能力契约

**基础兼容层：图片生视频**

- 必须接受一张分镜图和提示词，生成对应视频片段；纯文本模型不进入普通镜头制作流程。
- 必须支持竖屏 `9:16`、至少 `720p` 和单片段约 4 至 10 秒；推荐覆盖 5 至 15 秒。
- 必须提供异步任务状态、明确失败原因和可识别的限流结果；失败不能静默重试或重复扣费。
- 此层只能证明供应商具备图片生视频能力，不满足 Minifeel 普通创作流的理想要求；它可以保留在高级画布或管理员调试中，但不能作为普通用户“镜头制作”的可选模型。

**普通创作准入层：首帧控制与多图片参考**

- 同一次请求必须能把分镜图作为首帧或构图基准，并额外接收当前镜头涉及的角色、场景、道具和风格图片。
- 至少支持 1 张分镜图和 3 张额外参考图；推荐总上限不少于 6 张，理想上限为 9 张或更多，以覆盖多角色镜头。
- 适配层必须稳定表达引用语义，例如 `firstFrame`、`characterReference`、`sceneReference`、`propReference` 和 `styleReference`；如果供应商只有通用参考图，则适配器必须保证顺序和提示词映射一致。
- 必须支持竖屏 `9:16`、至少 `720p`、5 至 15 秒；优先支持 `1080p` 和可选原生音频。

**理想扩展层：连续短剧生产**

- 同时支持首帧、尾帧和多角色身份参考，而不是在帧控制与多参考之间二选一。
- 支持上一视频片段或上一尾帧作为连续性输入，并支持图片、视频、音频混合参考。
- 明确声明多角色身份锁定、参考数量、分辨率、时长、音频、口型或运镜等能力边界，管理员只能启用已验证的组合。
- 支持幂等请求或业务请求标识、取消任务、真实进度或清晰阶段状态，并提供可预测的计费单位。
- 适配器负责本地文件、Base64 或安全临时上传，不要求用户把项目素材公开到互联网。

#### 能力准入规则

| 模型能力 | 请求方式 | 普通用户表现 |
| --- | --- | --- |
| 首帧与多参考可同时使用 | 分镜图作为首帧，发送当前镜头的角色、场景、道具和风格参考 | 完整的默认成片路径 |
| 只支持多图片参考 | 可在高级画布或管理员调试中使用 | 普通镜头制作不可选，不能声称分镜首帧得到锁定 |
| 只支持单图或首帧 | 可在高级画布或管理员调试中使用 | 普通镜头制作不可选，不能声称独立使用角色和场景参考 |
| 只支持文本 | 不执行普通镜头制作 | 提示管理员配置能同时使用分镜首帧和多图片参考的模型 |

模型能力选择、积分估算和最终生成必须使用同一个冻结后的“镜头素材包”和能力匹配结果。不能在估价后重新选择另一种引用组合，也不能因模型不支持就静默丢弃角色、场景或分镜引用。

#### 当前核心闭环与延期边界

```mermaid
flowchart LR
  script[剧本] --> assets[资产设定\n角色/场景/道具/风格]
  assets --> storyboard[分镜]
  storyboard --> clips[镜头制作\n样片/批量/采用]
  clips --> final[成片\nFFmpeg 合成]
  final --> review[人工预览与下载]
```

当前只实现上述视觉核心闭环。独立声音模型、角色声线、情绪与语速、字词时间戳、口型同步、AI 视觉审片、字幕、背景音乐、复杂转场、专业时间线以及音视频连续性参考全部延期；后续有明确需求时再扩展，当前不创建占位组件、接口或数据表。视频片段已有音轨在合成时保留，是否采用镜头与是否通过成片由用户人工确认。

- [x] **Step 1: 保存调用链并核验 Toonflow 上游能力**

保存 Minifeel 镜头素材调用链和 Toonflow 视频生成链。静态核验视频节点、媒体请求 Schema、Server 生成服务和供应商适配器，确认 Toonflow 支持图片生视频、帧控制和多媒体参考；同时确认现有 `mode` 仍缺少“首帧与多参考同时启用”的直接表达。

- [x] **Step 2: 明确当前核心边界和模型准入标准**

确认当前阶段只完成视觉核心闭环；普通镜头制作要求模型在同一次请求中同时使用分镜首帧和当前镜头相关的多图片参考。单图、仅多参考或纯文本模型只保留给高级画布和管理员调试，不能静默降级进入普通流程。

- [x] **Step 3: 将业务实现拆成逐项确认任务**

实现拆分为 Task 15—22。每个任务完成本地验证、更新计划、提交并推送 `dev` 后立即停止；下一任务必须再次向用户说明范围并取得确认。真实付费调用与服务器部署分别单独授权。

---

### Task 15: 普通镜头制作安全基线

**Status:** 已完成（2026-10-09）。本任务只修安全边界，未新增供应商、未调用图片或视频模型、未部署服务器。

**Files:**

- Modify: `apps/web/src/pages/project/index.vue`
- Modify: `apps/web/src/pages/project/components/projectStages.vue`
- Modify: `apps/web/src/pages/project/components/filmStage.vue`
- Modify: `apps/server/src/utils/generation/index.ts`
- Modify: `apps/server/src/utils/media/generation.ts`
- Modify: `docs/productExperienceIssues.md`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

**Outcome:** 先阻止当前已确认的破坏和误导：普通页不再删除高级画布已有输入边；仅文生视频的 Agnes 不再出现在普通“镜头制作”可用路径中；明显不符合媒体 Schema 或模型能力的请求在创建任务和冻结积分前失败。第四阶段的可见名称改为“镜头制作”，不再把单个片段称为完整成片。

**Confirmation gate:** 开始前需用户明确接受：在接入满足要求的图片生视频模型前，普通工作台的视频按钮会显示“暂无兼容模型”；高级画布和管理员调试仍可保留 Agnes 文生视频能力。

- [x] **Step 1: 固化失败证据与受影响调用方**

已确认 `configureVideoGeneration` 在估价前删除目标视频节点除当前分镜外的全部入边，普通页会把纯文本模式当作可用视频路径，通用估价与任务创建只校验任意 JSON 对象，媒体 Schema 与模型 mode 校验晚于任务入库和积分冻结。调用方核验同时证明 Toonflow 的既有语义是 `startFrameOptional` 单图作为尾帧、`endFrameOptional` 单图作为首帧，当前高级视频节点实现正确；本任务拒绝不满足普通流程的旧 mode，不改写 Toonflow 语义。

- [x] **Step 2: 停止破坏画布连接**

普通页已移除读取并批量删除视频节点入边的逻辑；需要图片的路径只复用 Toonflow 现有幂等 `connectNodes` 补充当前分镜边，不删除或重排高级画布维护的连接与 `referenceOrder`。本阶段没有猜测角色、场景或道具关系。

- [x] **Step 3: 收紧普通视频模型入口**

当前旧 `mode` 不能证明首帧与多图片参考可在同一请求生效，因此在 Task 17 建立组合能力契约前，普通“镜头制作”不展示任何旧视频模型，并在界面说明“暂无兼容模型”。模型查找也只使用过滤后的列表，避免绕过界面进入估价；高级画布与管理员调试继续保留 Agnes `text`。已核验 Toonflow 的 `startFrameOptional` 单图尾帧语义正确，本任务没有擅自改写。

- [x] **Step 4: 在扣分前执行最低限度的服务端校验**

估价、任务创建和媒体执行已共享现有 `imageGenerationSchema`、`videoGenerationSchema` 与同一模型能力校验。校验覆盖托管供应商、内外模型 ID、图片参考上限与规格、视频旧 mode、引用组合、画幅、时长、分辨率及音频能力；`prepareGeneration` 在计价、任务入库和积分冻结前执行，媒体执行在读取文件和调用供应商前再次复验。

- [x] **Step 5: 本地验证、更新计划并提交**

Web、Server 类型检查与生产构建均通过。Codex 浏览器在 1280px 与 720px 验证第四阶段为“镜头制作”、无兼容模型提示可见、所有生成按钮禁用、无横向溢出且控制台无错误；当前本地样本画布没有已有边，因此自定义边保留以删除代码消失、`connectNodes` 幂等实现和调用方复核验证。HTTP 验证合法 Agnes `text` 估价为 200，高级画布模型列表仍含 Agnes `text`；非法视频估价、非法视频创建和非法图片 Schema 均为 400，前后任务数、活动任务数、可用积分、冻结积分和流水数完全不变。完成差异检查后使用中文 Conventional Commit 提交并推送 `origin/dev`，然后停止等待 Task 16 确认。

---

### Task 16: 资产语义与真实画布连接

**Status:** 进行中（2026-10-09）。Step 1—4 已完成；**Step 5（旧项目可审查补连流程）尚未实现**，当前仅提供把整理提示词填入导演助手的入口，没有连接缺口展示、边预览、幂等应用与用户确认。按全局约束“任一阶段验证失败时保持进行中，修复根因后再提交”，本任务不标记完成。

**Files:**

- Modify: `apps/web/src/pages/app/dashboard.vue`
- Modify: `apps/web/src/pages/project/creativeViewAdapter.ts`
- Rename/Modify: `apps/web/src/pages/project/components/characterStage.vue` → `apps/web/src/pages/project/components/assetStage.vue`
- Modify: `apps/web/src/pages/project/components/projectStages.vue`
- Modify: `apps/web/src/pages/project/components/storyboardStage.vue`
- Modify: `apps/web/src/pages/project/components/filmStage.vue`
- Modify: `apps/web/src/pages/project/index.vue`
- Modify: `packages/skills/workflow/SKILL.md`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

**Outcome:** 第二阶段从“定角色”扩展为“资产设定”，覆盖角色、场景、道具和风格。当前镜头选择了哪些资产，就在同一画布中建立哪些真实边；分镜图片与视频片段都从真实连接读取引用，不维护普通页专用关系表。在 Task 18 完成冻结请求前，带入边引用的分镜生成保持安全禁用，避免新增连接后继续放大现有估价与执行不一致问题。

**Semantic contract:** 新节点使用 `Minifeel/角色/<名称>`、`Minifeel/场景/<名称>`、`Minifeel/道具/<名称>`、`Minifeel/风格/<名称>`、`Minifeel/分镜/<三位编号>` 和 `Minifeel/片段/<三位编号>`。旧 `Minifeel/成片/<三位编号>` 继续按“视频片段”兼容读取，不在打开项目时静默改名；单一最终视频才使用 `Minifeel/成片`。

- [x] **Step 1: 扩展只读创作视图语义**

让 `creativeViewAdapter.ts` 识别四类视觉资产、分镜、片段、最终成片、画布边和 `referenceOrder`，输出缺失连接、重复顺序、未知节点和旧标签诊断。读取旧项目不得改写文件。

实际改动：`CreativeAssetType` 定义为 `"character" | "scene" | "prop" | "style"`；`assetPrefixes` 按 `Minifeel/角色/`、`Minifeel/场景/`、`Minifeel/道具/`、`Minifeel/风格/` 四类前缀解析；卡片统一输出 `assetReferences`（含 `managedByGuided`、`referenceKey`、`edgeId`），分镜与镜头共用同一份引用数据；边语义以 `edge.data.minifeelRelationship === "assetReference"` 判定。验证：代码复核确认四类标签可解析、重复引用与未选资产会输出诊断提示。

- [x] **Step 2: 将角色阶段改成资产设定**

把现有角色编辑能力迁入 `assetStage.vue`，按角色、场景、道具和风格分组展示实际节点。只提供当前任务需要的编辑、生成、预览、采用和锁定能力；不添加声线、配音或其他延期入口。

实际改动：`characterStage.vue` 删除、`assetStage.vue` 新建；`assetTypes` 为 `["character","scene","prop","style"]`，`assetGroups` 按 `assetType` 过滤并分组渲染，空组不显示；第二阶段不再渲染镜头卡片；保留编辑、保存、确认、生成与预览能力。验证：全仓库已无 `characterStage` 引用，`index.vue` 正确 import 并使用 `assetStage`；类型检查通过。

- [x] **Step 3: 为分镜提供显式素材选择**

每个分镜显示并允许调整当前镜头相关的角色、场景、道具和风格。保存选择时使用现有 `connectNodes` 增补或移除由普通页明确管理的边，并同步稳定的 `referenceOrder`；不触碰用户在高级画布建立的未知连接。

实际改动：分镜页每个镜头新增“本镜资产”多选（`el-select` + `el-option-group` 按四类分组），保存时 emit `saveAssetReferences`；`index.vue` 用 `connectNodes` 建边并携带 `data:{ minifeelRelationship:"assetReference" }`，移除走 `deleteEdges`，顺序走 `node:setReferenceOrder`；`packages/tools/canvas/src/runtime.ts` 为 `connectNodes` schema 增加可选 `data` 字段，`useCanvasTools.ts` 把 `connection.data` 写入边。高级画布建立的边标记为 `managedByGuided=false`，界面对其禁用且不被普通页删除或重排。验证：代码复核确认写入与读取的是同一条真实 Vue Flow 边，分镜与镜头共用同一份 `assetReferences`。

偏差说明：资产关联入口放在分镜页（镜头 → 选资产），资产卡本身没有连接按钮。这与 Task 15 确立的“在分镜阶段补充资产”模型一致，功能等价；如需“资产卡直接连镜头”的交互，需另行补充。

- [x] **Step 4: 同步新项目工作流和片段连接**

首轮工作流只创建文字与图片节点草稿，不调用媒体模型。新项目按故事实际需要创建资产节点，并让分镜引用相关资产；片段节点引用其分镜图及同镜头资产。不得把项目全部素材无差别连接到每个镜头。

实际改动：`packages/skills/workflow/SKILL.md` 补齐资产与分镜、片段的命名契约（含旧 `Minifeel/成片/<三位编号>` 按片段兼容读取、不静默改名）；明确“分镜只连接本镜确实需要的资产，不要把项目全部资产无差别连接到每个镜头”；片段引用其分镜图及同镜头资产，引用顺序以 `referenceOrder.in` 为准；高级画布连接非普通流程管理对象，不删除、不重排或改名。`index.vue` 对含资产引用的分镜与片段保持禁用估价与扣分并给出提示。验证：SKILL.md 差异与代码复核一致。

带入边引用的分镜和片段在 Task 18 完成前保持不可执行并说明当前不能安全保证估价与实际输入一致，不允许估价或扣分；没有引用输入的单张资产生成继续复用现有安全链路。这是阶段间的临时保护状态，不新增模拟结果或占位接口。

- [ ] **Step 5: 为旧项目提供可审查的补连流程**

旧项目只显示连接缺口和建议。无法唯一判断的关系必须让用户选择；应用前展示将新增或移除的边，应用操作幂等，不删除、重命名或重排原有节点和未知边。项目级应用由界面中的用户操作确认，不执行全库静默迁移。

当前状态：**尚未实现**。代码里只有 `fillRepairPrompt("script" | "assets")`，作用是把“请整理视觉资产、只填写提示词、不生成图片”这类提示词填入导演助手输入框，由 Agent 自行补建节点；缺少连接缺口展示、候选边预览、幂等应用与用户逐项确认，不满足本步骤要求。此步骤完成前，Task 16 不标记已完成。

- [ ] **Step 6: 本地验证、更新计划并提交**

分别验证新项目、无连接旧项目和含高级自定义边的旧项目；确认普通页刷新与高级画布看到同一节点、边和排序，并检查宽屏、普通桌面和移动端。完成类型检查、构建、`git diff --check` 与状态检查，更新计划、提交并推送后停止等待 Task 17 确认。

当前状态：**未执行**。本轮只完成根目录类型检查（19 个包全部通过）与代码复核，尚未做浏览器实测（新项目/无连接旧项目/含高级自定义边旧项目、普通页与高级画布一致性、多尺寸）。Step 5 未实现，本步骤的完整验证应在 Step 5 完成后一并进行。本次提交仅保存 Step 1—4 的已完成改动，任务状态保持“进行中”。

---

### Task 17: 可组合视频能力契约

**Status:** 未开始，依赖 Task 16，开始前需用户再次确认。本任务只建立公共能力协议，不接入新供应商、不调用付费模型。

**Files:**

- Modify: `packages/tools/mediaGeneration/src/runtime.ts`
- Modify: `packages/nodeScaffold/src/nodeAi.ts`
- Modify: `packages/nodes/videoGenerationNode/src/index.vue`
- Modify: `packages/nodes/videoGenerationNode/src/components/generationSettings.vue`
- Modify: `apps/server/src/utils/providers/types.ts`
- Modify: `apps/server/src/utils/providers/index.ts`
- Modify: `apps/server/src/utils/media/generation.ts`
- Modify: `apps/server/src/routes/ai/media/models.ts`
- Modify: `apps/server/src/routes/admin/models/save.ts`
- Modify: `apps/web/src/pages/admin/models.vue`
- Modify: `apps/web/src/stores/userApp.ts`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

**Outcome:** 视频能力从一个互斥的 `mode` 字段扩展为可组合、可验证的能力描述。普通工作台可以准确判断一个模型能否在同一次请求中使用分镜首帧和多张资产参考；旧 `mode` 继续供既有高级画布读取，但不会被自动解释为更强能力。

- [ ] **Step 1: 定义版本化能力 Schema**

新增明确字段描述首帧、尾帧、图片参考上限、是否可把帧控制和图片参考同时使用、支持时长、画幅和分辨率。当前版本不加入音频参考、口型或 AI 审片字段。未知字段不作为已验证能力，旧模型默认不满足普通创作准入。

- [ ] **Step 2: 建立唯一能力解析与匹配规则**

Web、Server、图片/视频节点和管理员页面复用同一套类型与匹配语义。普通创作的硬门槛为：分镜图可作为首帧、至少可附加当前镜头所需的多张图片参考、两者能同时生效，并满足 `9:16`、至少 `720p` 和目标时长。

- [ ] **Step 3: 兼容高级画布旧模式**

现有 `text`、`singleImage`、首尾帧和 `imageReference:n` 模式仍可加载、编辑和运行。未迁移模型不会导致节点或画布打不开，也不会被静默提升为组合能力；Agnes 继续诚实声明 `text`。

- [ ] **Step 4: 收紧管理员能力配置**

管理员保存和启用模型前校验能力结构与数值上限，界面显示“普通创作兼容/仅高级画布”及原因。管理员可以配置模型，普通用户只能选择已启用且通过准入校验的模型，供应商与 API Key 仍不下发。

- [ ] **Step 5: 本地验证、更新计划并提交**

使用本地能力样本验证组合能力、单图、纯文本、非法上限和旧 `mode`；执行相关包、Web、Server 类型检查与构建。更新计划、检查差异、提交并推送后停止等待 Task 18 确认。

---

### Task 18: 冻结镜头素材包与请求一致

**Status:** 未开始，依赖 Task 17，开始前需用户再次确认。

**Files:**

- Modify: `packages/nodes/imageGenerationNode/src/index.vue`
- Modify: `packages/nodes/videoGenerationNode/src/index.vue`
- Modify: `packages/nodeScaffold/src/nodeAi.ts`
- Modify: `apps/web/src/pages/project/index.vue`
- Modify: `apps/web/src/pages/project/components/generationConfirm.vue`
- Modify: `apps/server/src/routes/generation/estimate.ts`
- Modify: `apps/server/src/routes/generation/create.ts`
- Modify: `apps/server/src/routes/ai/media/generate.ts`
- Modify: `apps/server/src/utils/generation/index.ts`
- Modify: `apps/server/src/utils/media/generation.ts`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

**Outcome:** 分镜生图和镜头生视频都由节点根据真实入边构建唯一请求；估价、确认和执行使用同一镜头素材包及服务端指纹。素材、边、顺序、模型能力或文件内容在确认后发生变化时，系统要求重新估价，不能继续扣分和运行旧请求。

**Interfaces:** 图片与视频生成节点新增 `node:prepareGeneration`，返回实际将执行的请求及引用摘要；`node:generateImage`、`node:generateVideo` 接收可选 `expectedFingerprint`。高级画布无参数调用保持当前行为，普通工作台必须传入已确认指纹。

- [ ] **Step 1: 在节点内提取唯一请求构建入口**

图片节点把角色、场景、道具和风格真实入边写入分镜请求；视频节点把分镜图写入首帧，并按 `referenceOrder` 写入当前镜头资产参考。现有开始生成逻辑和 `node:prepareGeneration` 调用同一函数，普通页不再复制一套请求拼装规则。

- [ ] **Step 2: 让服务端生成可信请求指纹**

估价端在鉴权后解析媒体 Schema、解析并限制项目内路径、读取引用文件元数据或内容摘要、校验模型能力与管理员状态，基于规范化后的项目、节点、引用顺序、模型、参数和输出目录生成指纹。不得信任浏览器自行声明的能力或文件哈希。

- [ ] **Step 3: 让估价、确认和执行复用指纹**

确认框展示模型、镜头、引用资产、规格和积分。用户点击确认时重新准备并估价；任何差异都更新确认内容并要求再次确认。任务创建和媒体执行再次验证 `expectedFingerprint`，不一致返回冲突且不创建任务、不冻结积分。

- [ ] **Step 4: 保存足够的脱敏快照**

`generationTasks.requestSummary` 保存能力版本、引用角色与顺序、工作区相对路径、请求指纹和计费快照；不保存 API Key、绝对路径或媒体 Base64。后续采用和失效判断以该快照为依据。

- [ ] **Step 5: 验证竞态与费用边界**

使用已有本地媒体验证估价后改提示词、替换资产、断开边、调整引用顺序、停用模型和修改价格；全部应在付费执行前要求重估。执行类型检查、构建和 HTTP 验证，更新计划、提交并推送后停止等待 Task 19 确认。

---

### Task 19: 合格图片生视频模型适配

**Status:** 待用户后续选择模型。依赖 Task 18；没有满足普通创作准入的供应商和官方 API 文档时不得开始编码供应商适配器。

**Files:**

- Future Create: `apps/server/src/utils/providers/<供应商小驼峰名称>.ts`
- Modify: `apps/server/src/utils/database/types.ts`
- Modify: `apps/server/src/utils/database/migrations/*`
- Modify: `apps/server/src/utils/providers/index.ts`
- Modify: `apps/server/src/utils/providers/types.ts`
- Modify: `apps/server/src/routes/admin/providers/debug.ts`
- Modify: `apps/web/src/pages/admin/providers.vue`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

**Selection gate:** 用户需提供或确认候选供应商、官方文档、测试 Key、目标模型、参考图限制、时长/分辨率、异步与取消能力、价格和限流。先做文档与最小静态适配审查；真实请求的预计费用和请求数量需单独确认。

- [ ] **Step 1: 形成供应商能力对照**

只依据已核验的官方文档，把候选模型逐项映射到 Task 17 的能力 Schema。不能根据营销文案猜测多参考、角色一致性、首帧或并发能力。

- [ ] **Step 2: 接入单一最小适配器**

仅实现已选模型需要的列表、创建、查询、取消和结果下载；严格校验响应，错误不静默重试。需要新增 `ProviderType` 或数据库约束时使用迁移，API Key 继续只在服务端加密保存。

- [ ] **Step 3: 扩展管理员最小调试**

管理员调试允许提交分镜首帧与少量角色/场景参考，显示实际请求能力、任务状态和返回结果；普通用户不可访问，调试不自动写入创作项目或消耗用户积分。

- [ ] **Step 4: 分层验证并执行一次获批真实调用**

先用本地静态数据、输入校验和供应商提供的非付费能力接口验证。只有用户明确批准后，执行一次最低成本、最短时长、`9:16` 的真实镜头请求，核对参考是否同时送达、状态恢复、输出类型、积分和失败退款；不得自动重试。

- [ ] **Step 5: 更新计划并提交**

完成适配器、管理员能力与实际验证记录后，执行检查、提交并推送；不部署服务器，停止等待 Task 20 确认。

---

### Task 20: 样片优先的镜头制作

**Status:** 未开始，依赖 Task 19，开始前需用户再次确认。

**Files:**

- Modify: `apps/web/src/pages/project/creativeViewAdapter.ts`
- Modify: `apps/web/src/pages/project/index.vue`
- Modify: `apps/web/src/pages/project/components/filmStage.vue`
- Modify: `apps/web/src/stores/userApp.ts`
- Modify: `packages/nodes/imageGenerationNode/src/index.vue`
- Modify: `packages/nodes/videoGenerationNode/src/index.vue`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

**Outcome:** 第四阶段完整呈现“镜头制作”：先生成一个代表性或高风险镜头作为样片，用户采用后才允许按再次确认的总价批量生成其余镜头。每次生成都是候选版本，新结果不覆盖已采用版本；上游采用版变化后，只把真正依赖它的下游标为“需更新”。

- [ ] **Step 1: 复用任务结果形成候选版本**

候选文件和任务沿用 `generationTasks.result.files`，不新增普通页候选数据库。项目页按 `projectId` 分页读取完整任务记录，不能只依赖全账户最近 100 条。引导模式使用 `candidateOnly`，生成成功不直接替换节点已采用输出；高级画布无参数生成维持旧行为。

- [ ] **Step 2: 在同一节点保存采用状态**

图片与视频节点提供 `node:acceptOutput`，只接受属于该节点工作区目录的成功任务文件，并写入公开输出及 `accepted` 元数据：任务 ID、相对路径、MIME、请求指纹和采用时间。普通页通过节点工具操作，不直接改画布 JSON。

- [ ] **Step 3: 实现样片门槛与批量确认**

默认推荐一个代表性镜头，用户可改选。样片成功后先预览、采用或退回；只有采用后才计算其余镜头总价并展示模型、规格、数量、引用和积分，用户再次确认才批量创建任务。失败、取消和未采用结果不推进阶段。

- [ ] **Step 4: 按读取时指纹判断定向失效**

`creativeViewAdapter.ts` 用当前提示词、真实入边、`referenceOrder`、上游已采用输出和模型能力重算请求指纹，与下游 `accepted.requestFingerprint` 比较。不同则显示“需更新”并保留旧预览，不遍历改写所有下游节点、不删除文件、不自动重生成；无关镜头不受影响。

- [ ] **Step 5: 验证恢复、版本和局部失败**

验证刷新、切换普通/高级画布、样片退回、重新生成、部分镜头失败、上游只改草稿但未采用、上游采用版变化和无关资产变化。完成检查、更新计划、提交并推送后停止等待 Task 21 确认。

---

### Task 21: FFmpeg 单一成片与人工交付

**Status:** 未开始，依赖 Task 20，开始前需用户再次确认。本任务不调用模型、不产生积分流水。

**Files:**

- Create: `apps/server/src/utils/database/migrations/projectRenderTasks.ts`
- Modify: `apps/server/src/utils/database/migrate.ts`
- Modify: `apps/server/sql/schema.sql`
- Create: `apps/server/src/utils/render/index.ts`
- Create: `apps/server/src/utils/render/worker.ts`
- Create: `apps/server/src/routes/render/create.ts`
- Create: `apps/server/src/routes/render/get.ts`
- Create: `apps/server/src/routes/render/list.ts`
- Create: `apps/server/src/routes/render/cancel.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/utils.ts`
- Modify: `apps/server/src/utils/projects/index.ts`
- Modify: `apps/web/src/pages/project/components/projectStages.vue`
- Modify: `apps/web/src/pages/project/components/filmStage.vue`
- Create: `apps/web/src/pages/project/components/finalStage.vue`
- Modify: `apps/web/src/pages/project/creativeViewAdapter.ts`
- Modify: `apps/web/src/pages/project/index.vue`
- Modify: `packages/nodes/videoNode/src/index.vue`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

**Architecture:** 本地合成不复用 `generationTasks`，因为该表强制关联模型、供应商计费和积分事务。新增独立的 `projectRenderTasks` 保存输入快照、状态、进度、输出和错误，复用 `createWorkspaceFfmpeg`、FFprobe、工作区路径校验、文件锁和项目资产索引。第五阶段与可工作的合成链一起上线，不提前放置空页面。

- [ ] **Step 1: 建立可恢复的本地渲染任务**

接口按项目鉴权并只接受已采用、未失效的片段相对路径和冻结顺序。Worker 支持排队、心跳、取消、失败恢复和服务重启后的明确状态；任务不需要模型 ID，不冻结或结算积分。

- [ ] **Step 2: 用 FFprobe 预检所有片段**

校验容器、视频流、时长、分辨率、帧率和音轨。缺文件、损坏文件、路径逃逸或失效指纹在启动 FFmpeg 前失败。输入快照变化时要求重新创建任务。

- [ ] **Step 3: 完成最小可靠合成**

按分镜顺序统一画幅、编码、像素格式、帧率与音频参数后硬切拼接成一个 MP4。保留片段已有音轨；无音轨片段补静音轨以保证拼接稳定。本阶段不生成配音、口型、字幕、背景音乐、复杂转场或时间线工程。

- [ ] **Step 4: 写回同一项目和画布**

输出保存为 `assets/final/<renderId>.mp4`，写入 `projectAssets`，创建或复用一个 `remote-videoNode` 并通过 `node:setVideo` 标记为 `Minifeel/成片`。普通页与高级画布预览同一文件；重做成片保留旧文件，只有用户采用的新结果成为当前输出。

- [ ] **Step 5: 完成第五阶段的人工审片与下载**

`finalStage.vue` 展示片段顺序、合成状态、技术错误、完整成片预览、重新合成和下载。用户可从问题片段返回镜头制作；当前验收只做人工预览，不增加 AI 视觉审片入口。

- [ ] **Step 6: 本地验证、更新计划并提交**

用既有视频样本验证相同规格、混合分辨率/帧率、有音轨与无音轨混合、取消、FFmpeg 缺失、坏文件、服务重启和下载文件。检查五阶段响应式布局、类型、构建、路由生成、数据库迁移和差异，更新计划、提交并推送后停止等待 Task 22 确认。

---

### Task 22: 核心闭环验收

**Status:** 未开始，依赖 Task 15—21，开始前需用户再次确认。部署服务器不包含在本任务内。

**Files:**

- Modify: `docs/productExperienceIssues.md`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`
- Modify: 仅限验收发现且能复现的相关实现文件

**Outcome:** 验证“剧本 → 资产设定 → 分镜 → 镜头制作 → 成片 → 人工预览与下载”在普通工作台完整闭环，并证明高级画布读取同一节点、边、素材、任务和结果。只修复验收中形成明确失败证据的问题，不顺带开发延期能力。

- [ ] **Step 1: 执行旧项目兼容矩阵**

覆盖现有四类标签项目、零连接项目、含高级画布自定义边项目、重复编号、缺文件、损坏画布和旧 `Minifeel/成片/<编号>`。打开项目不得静默改写；补连、采用和标签规范化均需可审查的用户操作。

- [ ] **Step 2: 执行模型与费用矩阵**

覆盖无兼容模型、模型停用、价格变化、积分不足、估价后素材变化、限流、失败退款、取消和服务恢复。先复用既有媒体结果；新的付费图片或视频调用必须另行明确授权，失败不自动重试。

- [ ] **Step 3: 执行端到端创作矩阵**

至少验证一个新项目和一个旧项目的资产连接、分镜生成请求、样片、采用、批量片段、定向失效、FFmpeg 合成、最终预览和下载；同时核对普通/高级两种入口、任务中心、资产库和账户流水的一致性。

- [ ] **Step 4: 执行界面与可访问性检查**

检查宽屏桌面、普通桌面和移动端；确认无横向溢出、异常空白、遮挡或旧 UI 混用，图片和视频完整展示且可放大/播放，所有关键操作可用键盘完成并有可见焦点、加载、空、失败、超时和重试反馈。

- [ ] **Step 5: 完成仓库验证和交付记录**

执行受影响工作区类型检查、生产构建、必要 HTTP 与浏览器操作、`git diff --check` 和 `git status --short --branch`。更新问题清单与本计划的真实结果，使用中文 Conventional Commit 提交并推送 `origin/dev`。完成后停止；只有用户另行明确要求部署时，才进入备份、部署和线上低成本冒烟流程。
