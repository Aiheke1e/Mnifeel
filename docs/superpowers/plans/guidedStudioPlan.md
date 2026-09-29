# Minifeel 导演式创作工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将普通用户项目入口改造成剧本、角色、分镜、成片四阶段的导演式工作台，同时保留 Toonflow 高级画布及其节点、Agent、素材和生成能力。

**Architecture:** 普通工作台挂载现有 `canvasHost` 作为共享运行层，通过 `CanvasContext` 和已注册的节点工具修改同一份画布数据；`creativeViewAdapter.ts` 只把约定标签的画布节点转换为阶段卡片，不维护第二份业务数据。现有 Agent 增加普通展示模式，服务端增加复用现有计费算法的只读估价接口，实际生成仍由现有节点、任务 Worker 和积分事务执行。

**Tech Stack:** Bun 1.3.14、TypeScript、Vue 3、Pinia、Vue Router、Element Plus、VueFlow、Express 5、PostgreSQL。

**Spec:** `docs/superpowers/specs/guidedStudioDesign.md`

## Global Constraints

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
