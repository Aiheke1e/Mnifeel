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
| 2. 共享画布运行层与导演助手 | 未开始 | — | — | — |
| 3. 创作视图适配、剧本与角色 | 未开始 | — | — | — |
| 4. 生成估价与确认 | 未开始 | — | — | — |
| 5. 分镜、成片与任务恢复 | 未开始 | — | — | — |
| 6. 全流程验收与生产部署 | 未开始 | — | — | — |

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
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

**Interfaces:**

- Consumes: `canvasHost.getCanvasContext()`、`canvasHost.flushSave()`、`canvasHost.cancelSave()`、`canvasHost.saveBusy`、现有 `<agent v-model>`。
- Produces: `projectRuntime` 暴露 `canvasReady`、`getCanvasContext()`、`flushSave()`、`cancelSave()` 和只读 `saveBusy`；`useProjectSaveGuard(options)` 统一两个页面的离开保护；Agent 新增 `mode?: "advanced" | "guided"`。

- [ ] **Step 1: 创建不可交互但可计算尺寸的运行层**

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

- [ ] **Step 2: 抽取统一离开保护**

`projectSaveGuard.ts` 导出：

```ts
export function useProjectSaveGuard(options: {
  isBusy(): boolean;
  flushSave(): Promise<void>;
  cancelSave(): void;
})
```

该函数注册 `onBeforeRouteLeave`：繁忙时阻止离开；保存失败时显示“留在项目/仍然退出”；用户明确强制退出后才调用 `cancelSave()`。把高级画布现有重复逻辑改为调用此函数，确保两个模式修复同一条保存链路。

- [ ] **Step 3: 在普通项目页提供 CanvasContext**

`project/index.vue` 挂载 `projectRuntime`，并提供：

```ts
provide("canvas", () => runtimeRef.value?.canvasReady
  ? runtimeRef.value.getCanvasContext()
  : undefined);
```

只有项目加载成功且运行层 `canvasReady` 后才挂载导演助手。页面卸载和路由离开走共享保存保护。

- [ ] **Step 4: 为 Agent 增加普通展示模式**

`agent/index.vue` 增加 `mode` 属性并传给 `conversation.vue`。`conversation.vue` 在 `guided` 模式下：

- 隐藏 Skill 菜单、上下文 token 面板、子 Agent 技术入口和原始工具卡片。
- 工具调用统一显示“正在更新项目…”、“项目内容已更新”或可读错误。
- 保留管理员已启用的文本模型选择、附件、消息输入、停止、重试和流式正文。
- 欢迎语改成短剧创作语言，不出现“节点”“Skill”“工作流”。

高级模式不改变现有内容和交互。

- [ ] **Step 5: 创建导演助手容器**

`directorPanel.vue` 使用 `<agent v-model="visible" mode="guided" />`，桌面常驻显示，窄屏可折叠。组件不复制会话、流式请求和历史加载逻辑。

- [ ] **Step 6: 验证运行层和首条消息**

Run:

```powershell
bun run --cwd apps/web typecheck
bun run --cwd apps/web build
```

Expected: 创建项目后首条 `pendingAgentMessage` 只发送一次；刷新不会重复发送；快速返回首页再打开另一个项目时不会把消息发到错误项目；Agent 能调用 `getCanvas` 和新增节点；普通页看不到画布、Skill 和原始工具参数；高级画布仍显示完整界面。

停止本地 Server 后编辑并尝试离开，确认出现保存失败提示；选择留在项目不会跳转，恢复 Server 后重试可保存。生成节点繁忙时离开被阻止。

- [ ] **Step 7: 更新进度并提交推送**

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
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

**Interfaces:**

- Consumes: `useWorkspaceFiles(projectId)`、`CanvasContext.call(...)`、`GenerationTask[]`。
- Produces: `readCreativeView(projectId, tasks): Promise<CreativeView>`、`parseCreativeLabel(label)`、`scriptStage` 和 `characterStage` 的保存事件。

- [ ] **Step 1: 定义稳定的画布标签契约**

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

- [ ] **Step 2: 实现只读创作视图适配器**

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

- [ ] **Step 3: 收紧首页初始 Agent 提示**

保留现有 `/skill:workflow`，明确要求首轮只创建草稿节点：

```text
首轮只生成文字草稿，不调用图片或视频生成。剧本使用文本节点并命名为 Minifeel/剧本；每个角色建立图片生成节点并命名为 Minifeel/角色/<角色名>，只填写提示词；每个镜头建立图片生成节点并按顺序命名为 Minifeel/分镜/001、002……，只填写提示词。完成后整理画布并停止，等待用户确认。
```

禁止提示词要求模型创建第二份状态文件或直接修改画布 JSON。

- [ ] **Step 4: 实现剧本阶段**

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

- [ ] **Step 5: 实现角色阶段**

`characterStage.vue` 按标签展示角色名、提示词、预览、任务状态和模型选择。修改设定时调用角色节点的 `node:setPrompt` 并去掉 `/已确认` 后缀；锁定角色时使用 `renameNodes` 增加 `/已确认`。预览使用 `useWorkspaceFiles(projectId).acquireUrl(path, mimeType)`，组件卸载或路径变化时调用 `release()`。

本任务只接入角色编辑和已有图片预览；生成按钮保持禁用并显示“确认生成”说明，Task 4 接入真实确认逻辑。

- [ ] **Step 6: 验证新项目和旧项目读取**

Run:

```powershell
bun run --cwd apps/web typecheck
bun run --cwd apps/web build
```

Expected: 新项目首轮生成后出现剧本、角色和分镜草稿节点；编辑剧本和角色提示词后刷新仍存在；进入高级画布可看到同一批节点和修改；普通页没有生成媒体。打开一个没有约定标签的旧项目时页面不白屏、不修改画布，并提供高级画布入口。把画布文件内容临时改成无效 JSON 后打开项目，页面显示读取失败且文件内容未变化；验证后恢复原文件。

- [ ] **Step 7: 更新进度并提交推送**

```powershell
git add apps/web/src/pages/project/creativeViewAdapter.ts apps/web/src/pages/project/components/scriptStage.vue apps/web/src/pages/project/components/characterStage.vue apps/web/src/pages/app/dashboard.vue apps/web/src/pages/project/index.vue docs/superpowers/plans/guidedStudioPlan.md
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
- Create: `apps/web/src/pages/project/components/generationConfirm.vue`
- Modify: `apps/web/src/stores/userApp.ts`
- Modify: `apps/web/src/pages/project/components/characterStage.vue`
- Modify: `apps/web/src/pages/project/index.vue`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

**Interfaces:**

- Consumes: `parsePricing`、`estimateUsage`、`calculateCredits`、现有模型归属和白名单规则、节点 `getConfig`/`setConfig`/`generateImage`/`generateVideo`。
- Produces: `estimateGenerationTask(userId, input)`；`POST /api/generation/estimate`；`userAppStore.estimateGeneration(input)`；统一生成确认组件。

- [ ] **Step 1: 抽取创建与估价共用的模型校验**

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

- [ ] **Step 2: 添加只读估价接口**

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

- [ ] **Step 3: 生成路由并验证接口副作用**

Run:

```powershell
bun run --cwd apps/server routes
bun run --cwd apps/server typecheck
bun run --cwd apps/server build
```

Expected: 路由生成、类型检查和构建退出码为 `0`。使用登录会话实际调用估价接口，确认任务表和积分流水数量调用前后不变；无权项目返回 `404`；停用模型返回 `409`；白名单视频返回 `estimatedCredits: 0`。

- [ ] **Step 4: 给用户 Store 增加估价能力**

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

- [ ] **Step 5: 创建统一确认组件**

`generationConfirm.vue` 只负责展示和确认，属性包括 `modelName`、`generationType`、`count`、`estimatedCredits`、`availableCredits`、`loading`；发出 `confirm` 和 `cancel`。积分不足时禁用确认按钮，并显示缺少的积分数量。

- [ ] **Step 6: 接入角色图片生成**

用户选择管理员公开的图片模型后，父组件先调用角色节点 `node:getConfig`，再用 `node:setConfig` 设置同一个 `modelId`，根据节点提示词和配置请求服务端估价。用户确认后才调用 `node:generateImage`。

调用返回“已开始”后立即刷新任务与账户，并在存在 `pending`/`running` 任务时每 2 秒刷新；任务进入终态后停止该轮轮询并重新读取创作视图。

如果估价后模型被停用、积分被其他任务占用或后端拒绝创建，显示后端错误、刷新账户和模型，不在前端假装任务成功。

- [ ] **Step 7: 验证确认门禁**

Run:

```powershell
bun run --cwd apps/web typecheck
bun run --cwd apps/web build
```

Expected: 取消确认不会产生任务或积分流水；确认前能看到真实模型、数量和估价；积分不足不能确认；白名单视频估价显示 0；估价后停用模型再确认会显示错误并刷新模型；图片任务成功后角色卡出现结果，失败或取消后冻结积分退回。

- [ ] **Step 8: 更新进度并提交推送**

```powershell
git add apps/server/src/routes/generation/estimate.ts apps/server/src/utils/generation/index.ts apps/server/src/router.ts apps/web/src/pages/project/components/generationConfirm.vue apps/web/src/stores/userApp.ts apps/web/src/pages/project/components/characterStage.vue apps/web/src/pages/project/index.vue docs/superpowers/plans/guidedStudioPlan.md
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
- Modify: `docs/productExperienceIssues.md`
- Modify: `docs/superpowers/plans/guidedStudioPlan.md`

**Interfaces:**

- Consumes: `CreativeView`、`GenerationEstimate`、统一确认组件、节点 `setPrompt`/`setConfig`/`generateImage`/`generateVideo`、任务列表和工作区文件 URL。
- Produces: 可编辑和排序的分镜卡、视频任务与成片预览、刷新后可恢复的阶段状态。

- [ ] **Step 1: 补全生成任务公开类型**

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

- [ ] **Step 2: 实现分镜阶段**

`storyboardStage.vue` 展示顺序、镜头描述、图片预览、模型、任务状态、编辑、单个生成和批量生成。调整顺序时批量调用 `renameNodes`，把标签重新编号为连续三位编号；任一节点校验失败时整批不提交。修改镜头描述时去掉 `/已确认`，用户确认镜头后再增加该后缀。

批量生成使用用户在分镜阶段选择的同一个管理员公开模型。先为所有待生成节点读取并设置实际配置，按各节点请求分别估价，确认框展示模型、总数量和总预计积分；用户确认后顺序触发节点生成，单个失败记录在对应卡片，不覆盖已经成功的镜头。

- [ ] **Step 3: 实现视频生成入口**

对已经确认图片的分镜创建或复用 `remote-videoGenerationNode`，标签使用相同顺序的 `Minifeel/成片/<编号>`。通过现有画布工具连接分镜图片输出与视频节点输入，调用视频节点 `getConfig`、`setConfig` 和 `setPrompt`，估价确认后调用 `generateVideo`。

视频模型时长、分辨率、模式和引用数量全部使用 `getConfig` 返回的能力，不写死供应商不支持的选项。当前视频分钟限频由后端错误显示在对应镜头，不做无限自动重试。

- [ ] **Step 4: 实现成片阶段**

`filmStage.vue` 按镜头展示视频任务进度、失败原因、退款、预览和下载。预览通过 `useWorkspaceFiles(projectId).acquireUrl` 获取；下载复用 `downloadFile` 与 `files.read(path)`，不暴露服务器真实路径。

第一版把各镜头视频片段作为“成片结果”展示，不新增时间线拼接、字幕、配音和转场。

- [ ] **Step 5: 实现任务轮询与阶段恢复**

项目页首次加载并行读取项目、模型、账户、任务和创作视图。存在当前项目的 `pending`/`running` 任务时每 2 秒刷新任务和账户；页面隐藏时暂停轮询，重新可见后立即刷新；组件卸载时清理定时器。

阶段状态规则：

- 没有对应节点为 `notStarted`。
- 存在活动任务为 `running`。
- 存在失败任务且没有活动任务为 `failed`。
- 已有草稿、未确认节点或未完成生成为 `review`。
- 剧本标签带 `/已确认` 时剧本阶段为 `complete`；角色和分镜节点全部带 `/已确认` 且所需图片已有结果时对应阶段为 `complete`；成片节点全部有成功视频结果时成片阶段为 `complete`。

- [ ] **Step 6: 统一用户可读错误**

扩展 `friendlyTaskError`，把限频、积分不足、模型停用、供应商连接失败、任务取消和服务重启恢复映射为用户可执行的提示；保留未知错误的服务端脱敏消息，不显示堆栈、请求体或 API Key。

把测试中发现的问题记录到 `docs/productExperienceIssues.md`，已修复项写明提交，不删除仍需后续处理的历史记录。

- [ ] **Step 7: 验证分镜到成片流程**

Run:

```powershell
bun run --cwd apps/web typecheck
bun run --cwd apps/server typecheck
bun run --cwd apps/web build
bun run --cwd apps/server build
```

Expected: 分镜编辑和重新排序刷新后保持；取消批量确认不产生任务；图片成功、失败、取消分别显示正确状态；运行中刷新页面可恢复任务；重启 Server 后数据库任务仍可查询，失联任务按现有 Worker 规则失败并退款；高级画布看到同一批图片和视频节点。

视频真实调用遵守一分钟一次限制：先与其他调用者错开，只提交一个最短镜头；返回限频时记录问题并验证错误展示，不重复抢占额度。

- [ ] **Step 8: 更新进度并提交推送**

```powershell
git add apps/web/src/pages/project/components/storyboardStage.vue apps/web/src/pages/project/components/filmStage.vue apps/web/src/pages/project/creativeViewAdapter.ts apps/web/src/pages/project/index.vue apps/web/src/stores/userApp.ts apps/web/src/pages/app/appFormat.ts docs/productExperienceIssues.md docs/superpowers/plans/guidedStudioPlan.md
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

- [ ] **Step 1: 执行提交前静态验证**

Run:

```powershell
bun run typecheck
bun run build
git diff --check
git status --short --branch
```

Expected: 类型检查、生产构建和差异检查退出码为 `0`；状态只包含本阶段有意修改。仓库中没有新增测试文件、真实 API Key 或 `.superpowers/` 文件。

- [ ] **Step 2: 使用测试账号跑普通用户冒烟流程**

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

- [ ] **Step 3: 跑权限与异常冒烟**

普通用户不能进入 `/admin`、不能看到 API Key 和供应商参数；管理员仍能进入后台配置与调试模型。停用一个未在运行任务中使用的测试模型，确认普通页立即不再允许新任务选择，恢复后重新出现。

断开 Server 后编辑并离开，确认保存拦截；恢复 Server 后保存成功。刷新运行任务页面和重启开发 Server，确认任务状态从后端恢复。

- [ ] **Step 4: 修复发现的阻断问题并重复相关验证**

只修复本次流程中可复现的根因。每个问题在 `docs/productExperienceIssues.md` 记录复现条件、根因、修复文件和验证结果。出现代码缺陷时重新打开负责该文件的 Task 1–5，在该任务中完成修复、验证、进度更新和提交；修复后重复对应阶段及其后续依赖步骤，不重复没有受影响的完整检查。

- [ ] **Step 5: 更新计划并提交最终验收**

把 Task 6 状态、实际生成结果、视频调用结果、已知限制和验证命令写入本计划。代码缺陷已按 Step 4 回到所属任务提交，本步骤只提交验收记录：

```powershell
git add docs/productExperienceIssues.md docs/superpowers/plans/guidedStudioPlan.md
git commit -m "docs: 记录导演式创作流程验收结果"
git pull --rebase origin dev
git push origin dev
```

- [ ] **Step 6: 备份并部署生产环境**

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

- [ ] **Step 7: 线上只跑一次低成本验收**

使用测试账号打开服务器访问地址，验证登录、首页、普通项目路由、剧本读取、角色/分镜预览、高级画布入口和任务列表。只有本地真实媒体流程已经通过且视频调用额度空闲时，线上再提交一个最短视频；否则只验证已有结果和任务恢复，避免重复消耗额度。

把线上提交号、容器健康状态、访问地址和未解决问题写入本计划，提交并推送最后一次文档更新。
