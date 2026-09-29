<template>
  <div class="projectPage studioPage" :aria-busy="loading">
    <projectHeader
      :projectName="workspaceStore.project?.name || '加载中…'"
      :description="workspaceStore.project?.description"
      :currentStage="stageContent.title"
      @openAdvanced="openAdvanced" />

    <el-alert v-if="errorMessage" class="pageAlert" :title="errorMessage" type="error" showIcon :closable="false" />

    <projectRuntime v-if="workspaceStore.project" :key="workspaceStore.project.id" ref="runtimeRef" />

    <div v-if="workspaceStore.project" class="projectShell">
      <projectStages v-model="activeStage" class="stageNavigation" :statuses="stageStatuses" />

      <main class="stageWorkspace panelCard" aria-labelledby="stageTitle">
        <div class="stageHeading">
          <span class="stageIcon"><component :is="stageContent.icon" :size="25" aria-hidden="true" /></span>
          <div>
            <p class="eyebrow">第 {{ stageContent.number }} 步</p>
            <h2 id="stageTitle">{{ stageContent.title }}</h2>
            <p>{{ stageContent.description }}</p>
          </div>
        </div>

        <el-alert
          v-for="warning in creativeView?.warnings"
          :key="warning"
          class="creativeWarning"
          :title="warning"
          type="warning"
          showIcon
          :closable="false" />

        <scriptStage
          v-if="activeStage === 'script'"
          :script="creativeView?.script"
          :loading="creativeLoading"
          :errorMessage="creativeError"
          :busy="creativeBusy"
          @saveContent="saveScript"
          @confirmContent="confirmNode"
          @requestRepair="fillRepairPrompt('script')" />

        <characterStage
          v-else-if="activeStage === 'characters'"
          v-model="selectedModelId"
          :projectId="workspaceStore.project.id"
          :characters="creativeView?.characters ?? []"
          :models="stageModels"
          :modelsLoading="modelsLoading"
          :loading="creativeLoading"
          :errorMessage="creativeError"
          :busy="generationBusy"
          @saveContent="saveCharacter"
          @confirmContent="confirmNode"
          @requestRepair="fillRepairPrompt('characters')"
          @requestGenerate="prepareCharacterGeneration" />

        <storyboardStage
          v-else-if="activeStage === 'storyboard'"
          v-model="selectedModelId"
          :projectId="workspaceStore.project.id"
          :shots="creativeView?.storyboard ?? []"
          :models="stageModels"
          :modelsLoading="modelsLoading"
          :loading="creativeLoading"
          :errorMessage="creativeError"
          :generationErrors="generationErrors"
          :busy="generationBusy"
          @saveContent="saveStoryboard"
          @confirmContent="confirmNode"
          @reorder="reorderStoryboard"
          @requestGenerate="prepareStoryboardGeneration"
          @requestGenerateAll="prepareStoryboardBatch" />

        <filmStage
          v-else
          v-model="selectedModelId"
          :projectId="workspaceStore.project.id"
          :storyboard="creativeView?.storyboard ?? []"
          :films="creativeView?.films ?? []"
          :models="stageModels"
          :modelsLoading="modelsLoading"
          :loading="creativeLoading"
          :errorMessage="creativeError"
          :generationErrors="generationErrors"
          :busy="generationBusy"
          @requestGenerate="prepareVideoGeneration" />
      </main>

      <aside class="projectAside" aria-label="项目状态">
        <directorPanel v-if="runtimeReady" ref="directorRef" @updated="refreshCreativeView" />

        <section class="panelCard progressCard">
          <p class="eyebrow">项目进度</p>
          <strong>{{ completedStageCount }} / 4</strong>
          <el-progress :percentage="completedStageCount * 25" :showText="false" :strokeWidth="7" />
          <p>{{ activeTasks.length ? `${activeTasks.length} 个任务正在进行` : "当前没有等待中的任务" }}</p>
        </section>

        <section class="panelCard recentCard">
          <div class="asideHeading"><h3>最近生成</h3><router-link to="/app/tasks">全部记录</router-link></div>
          <div v-if="projectTasks.length" class="recentList">
            <article v-for="task in projectTasks.slice(0, 4)" :key="task.id">
              <span><strong>{{ taskTypeLabels[task.taskType] }}</strong><small>{{ formatDate(task.createdAt) }}</small></span>
              <el-tag :type="taskStatusTypes[task.status]" effect="light" round>{{ taskStatusLabels[task.status] }}</el-tag>
            </article>
          </div>
          <p v-else class="quietEmpty">这个项目还没有生成记录。</p>
        </section>
      </aside>
    </div>

    <generationConfirm
      :visible="generationDialogVisible"
      :modelName="pendingGeneration?.modelName ?? ''"
      :generationType="pendingGeneration?.generationType ?? '媒体内容'"
      :count="pendingGeneration?.items.length ?? 1"
      :estimatedCredits="pendingEstimatedCredits"
      :availableCredits="userAppStore.availableCredits"
      :loading="generationLoading"
      @confirm="confirmGeneration"
      @cancel="cancelGeneration" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { IconFileText, IconPhoto, IconVideo } from "@tabler/icons-vue";
import type { CanvasContext } from "@minifeel/tool-canvas/runtime";
import { apiErrorMessage } from "@/lib/api";
import { getProjectModel, setProjectMode, setProjectModel } from "@/lib/projectMode";
import { useProjectSaveGuard } from "@/lib/projectSaveGuard";
import { useUserAppStore, type GenerationEstimate } from "@/stores/userApp";
import { useWorkspaceStore } from "@/stores/workspace";
import { formatDate, taskStatusLabels, taskStatusTypes, taskTypeLabels } from "@/pages/app/appFormat";
import projectHeader from "./components/projectHeader.vue";
import projectStages, { type ProjectStage, type ProjectStageStatus } from "./components/projectStages.vue";
import projectRuntime from "./components/projectRuntime.vue";
import directorPanel from "./components/directorPanel.vue";
import scriptStage from "./components/scriptStage.vue";
import characterStage from "./components/characterStage.vue";
import storyboardStage from "./components/storyboardStage.vue";
import filmStage from "./components/filmStage.vue";
import generationConfirm from "./components/generationConfirm.vue";
import { creativeLabels, readCreativeView, type CreativeMediaCard, type CreativeView } from "./creativeViewAdapter";

type PreparedGeneration = {
  nodeId: string;
  modelId: string;
  taskType: "image" | "video";
  request: Record<string, unknown>;
  estimate: GenerationEstimate;
};

type PendingGeneration = {
  generationType: string;
  modelName: string;
  items: PreparedGeneration[];
};

type TaskDiscovery = {
  nodeId: string;
  modelId: string;
  taskType: "image" | "video";
  outputDirectory: string;
  previousTaskIds: Set<string>;
  discoveryDeadline: number;
  taskId?: string;
  settleDeadline?: number;
};

const route = useRoute();
const router = useRouter();
const workspaceStore = useWorkspaceStore();
const userAppStore = useUserAppStore();
const loading = ref(false);
const modelsLoading = ref(false);
const errorMessage = ref("");
const creativeLoading = ref(false);
const creativeError = ref("");
const creativeBusy = ref(false);
const creativeView = ref<CreativeView>();
const generationDialogVisible = ref(false);
const generationLoading = ref(false);
const pendingGeneration = ref<PendingGeneration>();
const generationErrors = reactive<Record<string, string>>({});
const activeStage = ref<ProjectStage>("script");
const selectedModelId = ref("");
const runtimeRef = ref<InstanceType<typeof projectRuntime>>();
const directorRef = ref<InstanceType<typeof directorPanel>>();
let creativeRefreshVersion = 0;
let taskPollTimer: number | undefined;
let taskPolling = false;
const taskDiscoveries = ref<TaskDiscovery[]>([]);
let disposed = false;
const runtimeReady = computed(() => runtimeRef.value?.canvasReady ?? false);
provide("canvas", () => runtimeReady.value ? runtimeRef.value?.getCanvasContext() : undefined);
useProjectSaveGuard({
  isBusy: () => runtimeRef.value?.saveBusy ?? false,
  flushSave: () => runtimeRef.value?.flushSave() ?? Promise.resolve(),
  cancelSave: () => runtimeRef.value?.cancelSave(),
});
const stageContents = {
  script: { number: 1, title: "把灵感变成完整剧本", description: "先确定人物、冲突和结局，再补充场景与对白。", icon: IconFileText, mediaType: "text" },
  characters: { number: 2, title: "建立统一的角色形象", description: "为主要人物确定外貌、服装和情绪，让前后画面保持一致。", icon: IconPhoto, mediaType: "image" },
  storyboard: { number: 3, title: "把剧本拆成连续画面", description: "逐镜确认景别、构图和人物动作，提前看清故事节奏。", icon: IconPhoto, mediaType: "image" },
  video: { number: 4, title: "生成可以剪辑的视频片段", description: "选择确认过的分镜，生成镜头片段并查看任务进度。", icon: IconVideo, mediaType: "video" },
} as const;
const stageContent = computed(() => stageContents[activeStage.value]);
const stageModels = computed(() => userAppStore.models.filter(model => model.mediaType === stageContent.value.mediaType));
const projectTasks = computed(() => userAppStore.tasks.filter(task => task.projectId === workspaceStore.project?.id));
const activeTasks = computed(() => projectTasks.value.filter(task => task.status === "pending" || task.status === "running"));
const stageStatuses = computed<Record<ProjectStage, ProjectStageStatus>>(() => creativeView.value?.statuses ?? ({
  script: "notStarted",
  characters: "notStarted",
  storyboard: "notStarted",
  video: "notStarted",
}));
const completedStageCount = computed(() => Object.values(stageStatuses.value).filter(status => status === "complete").length);
const generationBusy = computed(() => creativeBusy.value || taskDiscoveries.value.length > 0);
const pendingEstimatedCredits = computed(() => pendingGeneration.value?.items.reduce((total, item) => total + item.estimate.estimatedCredits, 0) ?? 0);

function savedModelId(projectId: string) {
  try {
    const value = JSON.parse(getProjectModel(projectId));
    return Array.isArray(value) && typeof value[1] === "string" ? value[1] : "";
  } catch {
    return "";
  }
}

watch(stageModels, models => {
  const projectId = workspaceStore.project?.id || String(route.params.projectId || "");
  if (!models.some(model => model.id === selectedModelId.value)) {
    selectedModelId.value = models.find(model => model.id === savedModelId(projectId))?.id || models.find(model => model.isDefault)?.id || models[0]?.id || "";
  }
}, { immediate: true });

watch(selectedModelId, modelId => {
  const projectId = workspaceStore.project?.id || String(route.params.projectId || "");
  if (projectId && stageContent.value.mediaType === "text") setProjectModel(projectId, modelId ? JSON.stringify(["deepSeek", modelId]) : "");
});

watch([runtimeReady, () => workspaceStore.project?.id], ([, projectId]) => {
  if (projectId) void refreshCreativeView();
}, { immediate: true });

onMounted(async () => {
  document.addEventListener("visibilitychange", handleVisibilityChange);
  const projectId = String(route.params.projectId || "");
  if (!projectId) return;
  loading.value = true;
  modelsLoading.value = true;
  setProjectMode("guided");
  try {
    await Promise.all([
      workspaceStore.project?.id === projectId ? Promise.resolve() : workspaceStore.openProject(projectId),
      userAppStore.loadTasks(),
      userAppStore.loadModels(),
      userAppStore.loadAccount(),
    ]);
    await refreshCreativeView();
    if (activeTasks.value.length) scheduleTaskPoll();
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "项目加载失败");
  } finally {
    loading.value = false;
    modelsLoading.value = false;
  }
});

onBeforeUnmount(() => {
  disposed = true;
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  if (taskPollTimer !== undefined) window.clearTimeout(taskPollTimer);
});

function handleVisibilityChange() {
  if (document.hidden) {
    if (taskPollTimer !== undefined) window.clearTimeout(taskPollTimer);
    taskPollTimer = undefined;
    return;
  }
  if (activeTasks.value.length || taskDiscoveries.value.length) scheduleTaskPoll(0);
}

function getCanvas(): CanvasContext {
  const canvas = runtimeRef.value?.getCanvasContext();
  if (!runtimeReady.value || !canvas) throw new Error("创作画布尚未准备好，请稍后重试");
  return canvas;
}

async function refreshCreativeView() {
  const projectId = workspaceStore.project?.id;
  if (!projectId) return;
  const version = ++creativeRefreshVersion;
  creativeLoading.value = true;
  creativeError.value = "";
  try {
    await runtimeRef.value?.flushSave();
    let view = await readCreativeView(projectId, userAppStore.tasks.filter(task => task.projectId === projectId));
    if (runtimeReady.value && await restoreTaskOutputs(view)) {
      view = await readCreativeView(projectId, userAppStore.tasks.filter(task => task.projectId === projectId));
    }
    for (const card of [...view.characters, ...view.storyboard, ...view.films]) {
      if (card.outputPersisted) delete generationErrors[card.nodeId];
    }
    if (version !== creativeRefreshVersion || projectId !== workspaceStore.project?.id) return;
    creativeView.value = view;
  } catch (error) {
    if (version === creativeRefreshVersion && projectId === workspaceStore.project?.id) {
      creativeView.value = undefined;
      creativeError.value = apiErrorMessage(error, "创作内容读取失败");
    }
  } finally {
    if (version === creativeRefreshVersion && projectId === workspaceStore.project?.id) creativeLoading.value = false;
  }
}

async function restoreTaskOutputs(view: CreativeView) {
  let restored = false;
  for (const card of [...view.characters, ...view.storyboard, ...view.films]) {
    if (!card.output || card.outputPersisted || taskDiscoveries.value.some(item => item.nodeId === card.nodeId)) continue;
    try {
      await getCanvas().call({
        name: "nodeTools",
        args: { nodeId: card.nodeId, name: "node:restoreOutput", args: card.output },
      });
      restored = true;
      delete generationErrors[card.nodeId];
    } catch (error) {
      generationErrors[card.nodeId] = apiErrorMessage(error, "已完成任务的结果回填失败，请刷新后重试");
    }
  }
  return restored;
}

async function updateNode(nodeId: string, label: string, tool?: { name: string; args: Record<string, unknown> }) {
  if (creativeBusy.value) return;
  creativeBusy.value = true;
  try {
    const canvas = getCanvas();
    if (tool) await canvas.call({ name: "nodeTools", args: { nodeId, name: tool.name, args: tool.args } });
    await canvas.call({ name: "renameNodes", args: { renames: [{ nodeId, label }] } });
    await refreshCreativeView();
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, "保存失败，请稍后重试"));
  } finally {
    creativeBusy.value = false;
  }
}

function saveScript(nodeId: string, text: string, draftLabel: string) {
  return updateNode(nodeId, draftLabel, { name: "node:setText", args: { text } });
}

function saveCharacter(nodeId: string, prompt: string, draftLabel: string) {
  return updateNode(nodeId, draftLabel, { name: "node:setPrompt", args: { prompt } });
}

function saveStoryboard(nodeId: string, prompt: string, draftLabel: string) {
  return updateNode(nodeId, draftLabel, { name: "node:setPrompt", args: { prompt } });
}

function confirmNode(nodeId: string, confirmedLabel: string) {
  return updateNode(nodeId, confirmedLabel);
}

function fillRepairPrompt(type: "script" | "characters") {
  const prompt = type === "script"
    ? "请检查当前画布中的故事内容，把合适的文本节点整理为 Minifeel/剧本；如果还没有完整剧本，请新建文本节点补齐。只整理文字草稿，不生成图片或视频，不删除其他节点。"
    : "请根据 Minifeel/剧本 整理角色。每个角色使用一个图片生成节点，命名为 Minifeel/角色/<角色名>，只填写角色提示词，不生成图片，不删除其他节点。";
  void directorRef.value?.fillPrompt(prompt);
}

async function prepareCharacterGeneration(nodeId: string) {
  const character = creativeView.value?.characters.find(item => item.nodeId === nodeId);
  if (character) await prepareImageGenerations([character], "角色图片");
}

async function prepareStoryboardGeneration(nodeId: string) {
  const shot = creativeView.value?.storyboard.find(item => item.nodeId === nodeId);
  if (shot) await prepareImageGenerations([shot], "分镜图片");
}

async function prepareStoryboardBatch(nodeIds: string[]) {
  if (new Set(nodeIds).size !== nodeIds.length) return void ElMessage.error("批量分镜列表无效，请刷新后重试");
  const shots = nodeIds.flatMap(nodeId => {
    const shot = creativeView.value?.storyboard.find(item => item.nodeId === nodeId);
    return shot && !shot.output && shot.prompt.trim() && shot.task?.status !== "pending" && shot.task?.status !== "running" ? [shot] : [];
  });
  if (shots.length !== nodeIds.length) return void ElMessage.error("分镜内容已经变化，请确认保存后重试");
  if (shots.length) await prepareImageGenerations(shots, "分镜图片");
}

async function prepareImageGenerations(cards: CreativeMediaCard[], generationType: string) {
  const projectId = workspaceStore.project?.id;
  const model = userAppStore.models.find(item => item.id === selectedModelId.value && item.mediaType === "image");
  if (!projectId || !model || generationBusy.value) return;
  creativeBusy.value = true;
  try {
    const items: PreparedGeneration[] = [];
    for (const card of cards) {
      const request = await configureImageGeneration(card.nodeId, model.id, card.prompt);
      const estimate = await userAppStore.estimateGeneration({ projectId, modelId: model.id, request });
      if (estimate.taskType !== "image") throw new Error("所选模型已不再是图片模型，请重新选择");
      items.push({ nodeId: card.nodeId, modelId: model.id, taskType: "image", request, estimate });
    }
    await userAppStore.loadAccount();
    pendingGeneration.value = { generationType, modelName: model.displayName, items };
    generationDialogVisible.value = true;
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, "生成估价失败，请稍后重试"));
    await Promise.allSettled([userAppStore.loadAccount(), userAppStore.loadModels()]);
  } finally {
    creativeBusy.value = false;
  }
}

async function configureImageGeneration(nodeId: string, modelId: string, prompt: string) {
  const canvas = getCanvas();
  const available = readImageNodeConfig(await canvas.call({ name: "nodeTools", args: { nodeId, name: "node:getConfig", args: {} } }));
  if (!available.models.some(model => model.providerId === "managed" && model.modelId === modelId)) {
    throw new Error("所选图片模型已不可用，请重新选择");
  }
  const configured = readImageNodeConfig(await canvas.call({
    name: "nodeTools",
    args: { nodeId, name: "node:setConfig", args: { providerId: "managed", modelId } },
  }));
  const request: Record<string, unknown> = {
    providerId: "managed",
    modelId,
    prompt,
    count: 1,
    outputDirectory: `assets/${nodeId}`,
  };
  if (configured.config.size) request.size = configured.config.size;
  if (configured.config.ratio) request.ratio = configured.config.ratio;
  return request;
}

async function reorderStoryboard(nodeId: string, direction: -1 | 1) {
  if (creativeBusy.value) return;
  const shots = [...(creativeView.value?.storyboard ?? [])];
  const index = shots.findIndex(shot => shot.nodeId === nodeId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= shots.length) return;
  [shots[index], shots[target]] = [shots[target], shots[index]];
  const films = creativeView.value?.films ?? [];
  const filmsByOrder = new Map(films.map(film => [film.order, film]));
  if (filmsByOrder.size !== films.length) return void ElMessage.error("成片编号存在重复，请进入高级画布整理后重试");
  const renames = shots.flatMap((shot, shotIndex) => {
    const film = filmsByOrder.get(shot.order);
    const order = String(shotIndex + 1).padStart(3, "0");
    return [
      { nodeId: shot.nodeId, label: `${creativeLabels.storyboard}${order}${shot.confirmed ? "/已确认" : ""}` },
      ...(film ? [{ nodeId: film.nodeId, label: `${creativeLabels.film}${order}${film.confirmed ? "/已确认" : ""}` }] : []),
    ];
  });
  if (new Set(renames.map(item => item.nodeId)).size !== renames.length) {
    ElMessage.error("分镜节点存在重复，无法调整顺序");
    return;
  }
  creativeBusy.value = true;
  try {
    await getCanvas().call({ name: "renameNodes", args: { renames } });
    await refreshCreativeView();
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, "分镜顺序调整失败"));
  } finally {
    creativeBusy.value = false;
  }
}

async function prepareVideoGeneration(storyboardNodeId: string) {
  const projectId = workspaceStore.project?.id;
  const shot = creativeView.value?.storyboard.find(item => item.nodeId === storyboardNodeId);
  const model = userAppStore.models.find(item => item.id === selectedModelId.value && item.mediaType === "video");
  if (!projectId || !shot || !shot.output || !shot.confirmed || !model || generationBusy.value) return;
  creativeBusy.value = true;
  try {
    const filmNodeId = await ensureFilmNode(shot);
    const request = await configureVideoGeneration(filmNodeId, model.id, shot.prompt, shot.output, shot.nodeId);
    const [estimate] = await Promise.all([
      userAppStore.estimateGeneration({ projectId, modelId: model.id, request }),
      userAppStore.loadAccount(),
    ]);
    if (estimate.taskType !== "video") throw new Error("所选模型已不再是视频模型，请重新选择");
    pendingGeneration.value = {
      generationType: "视频片段",
      modelName: model.displayName,
      items: [{ nodeId: filmNodeId, modelId: model.id, taskType: "video", request, estimate }],
    };
    generationDialogVisible.value = true;
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, "视频估价失败，请稍后重试"));
    await Promise.allSettled([userAppStore.loadAccount(), userAppStore.loadModels()]);
  } finally {
    creativeBusy.value = false;
  }
}

async function ensureFilmNode(shot: CreativeMediaCard) {
  const canvas = getCanvas();
  let filmNodeId = creativeView.value?.films.find(film => film.order === shot.order)?.nodeId;
  if (!filmNodeId) {
    const created = await canvas.call({
      name: "addNode",
      args: { type: "remote-videoGenerationNode", position: { x: 720, y: Math.max(0, (shot.order - 1) * 300) }, label: `${creativeLabels.film}${String(shot.order).padStart(3, "0")}` },
    });
    if (!isRecord(created) || !isRecord(created.node) || typeof created.node.id !== "string") throw new Error("视频节点创建失败");
    filmNodeId = created.node.id;
  }
  await refreshCreativeView();
  return filmNodeId;
}

async function configureVideoGeneration(nodeId: string, modelId: string, prompt: string, image: { path: string; mimeType: string }, sourceNodeId: string) {
  const canvas = getCanvas();
  const available = readVideoNodeConfig(await canvas.call({ name: "nodeTools", args: { nodeId, name: "node:getConfig", args: {} } }), false);
  const model = available.models.find(item => item.providerId === "managed" && item.modelId === modelId);
  if (!model) throw new Error("所选视频模型已不可用，请重新选择");
  const mode = model.mode.find(item => Array.isArray(item) && item.some(value => value.startsWith("imageReference:") && Number(value.split(":")[1]) > 0))
    ?? model.mode.find(item => item === "singleImage")
    ?? model.mode.find(item => item === "endFrameOptional")
    ?? model.mode.find(item => item === "startFrameOptional")
    ?? model.mode.find(item => item === "text");
  if (!mode) throw new Error("当前视频模型需要两张参考图，导演工作台暂不支持，请更换模型");
  const useImage = mode !== "text";
  const canvasState = await canvas.call({ name: "getCanvas", args: {} });
  const inputEdges = readInputEdges(canvasState, nodeId);
  const retainedEdge = inputEdges.find(edge => edge.source === sourceNodeId && edge.sourceHandle === "image");
  const removedEdgeIds = inputEdges.filter(edge => !useImage || edge !== retainedEdge).map(edge => edge.id);
  if (removedEdgeIds.length) await canvas.call({ name: "deleteEdges", args: { edgeIds: removedEdgeIds } });
  if (useImage && !retainedEdge) {
    await canvas.call({
      name: "connectNodes",
      args: { connections: [{ source: sourceNodeId, sourceHandle: "image", target: nodeId, targetHandle: "in" }] },
    });
  }
  const configured = readVideoNodeConfig(await canvas.call({
    name: "nodeTools",
    args: { nodeId, name: "node:setConfig", args: { providerId: "managed", modelId, mode } },
  }));
  await canvas.call({ name: "nodeTools", args: { nodeId, name: "node:setPrompt", args: { prompt } } });
  const request: Record<string, unknown> = {
    providerId: "managed",
    modelId,
    prompt,
    mode: configured.config.mode,
    duration: configured.config.duration,
    ratio: configured.config.ratio,
    generateAudio: configured.config.generateAudio,
    outputDirectory: `assets/${nodeId}`,
  };
  if (configured.config.resolution) request.resolution = configured.config.resolution;
  const reference = { path: image.path, mimeType: image.mimeType };
  if (useImage && ["startEndRequired", "endFrameOptional"].includes(String(configured.config.mode))) request.firstFrame = reference;
  else if (useImage && configured.config.mode === "startFrameOptional") request.lastFrame = reference;
  else if (useImage) request.images = [reference];
  return request;
}

function readInputEdges(value: unknown, nodeId: string) {
  if (!isRecord(value) || !Array.isArray(value.edges)) throw new Error("画布连接读取失败");
  return value.edges.flatMap(edge => isRecord(edge)
    && typeof edge.id === "string"
    && typeof edge.source === "string"
    && typeof edge.sourceHandle === "string"
    && edge.target === nodeId
    && edge.targetHandle === "in"
    ? [{ id: edge.id, source: edge.source, sourceHandle: edge.sourceHandle }]
    : []);
}

function readImageNodeConfig(value: unknown) {
  if (!isRecord(value) || !isRecord(value.config) || !Array.isArray(value.models)) throw new Error("图片节点配置读取失败");
  const models = value.models.flatMap(model => isRecord(model) && typeof model.providerId === "string" && typeof model.modelId === "string"
    ? [{ providerId: model.providerId, modelId: model.modelId }]
    : []);
  return {
    config: {
      size: typeof value.config.size === "string" ? value.config.size : "",
      ratio: typeof value.config.ratio === "string" ? value.config.ratio : "",
    },
    models,
  };
}

function readVideoNodeConfig(value: unknown, requireRunnable = true) {
  if (!isRecord(value) || !isRecord(value.config) || !Array.isArray(value.models)) throw new Error("视频节点配置读取失败");
  const models = value.models.flatMap(model => isRecord(model) && typeof model.providerId === "string" && typeof model.modelId === "string"
    ? [{ providerId: model.providerId, modelId: model.modelId, mode: Array.isArray(model.mode) ? model.mode.filter(mode => typeof mode === "string" || Array.isArray(mode) && mode.every(item => typeof item === "string")) as Array<string | string[]> : [] }]
    : []);
  const mode = typeof value.config.mode === "string" || Array.isArray(value.config.mode) && value.config.mode.every(item => typeof item === "string")
    ? value.config.mode
    : undefined;
  const matchingModes = Array.isArray(value.matchingModes)
    ? value.matchingModes.filter(item => typeof item === "string" || Array.isArray(item) && item.every(part => typeof part === "string")) as Array<string | string[]>
    : [];
  const modeMatches = mode !== undefined && matchingModes.some(item => JSON.stringify(item) === JSON.stringify(mode));
  if (requireRunnable && (!modeMatches || typeof value.config.duration !== "number" || !value.config.duration || typeof value.config.ratio !== "string")) throw new Error("视频节点没有适用于当前分镜的配置");
  return {
    config: {
      duration: typeof value.config.duration === "number" ? value.config.duration : 0,
      resolution: typeof value.config.resolution === "string" ? value.config.resolution : "",
      ratio: typeof value.config.ratio === "string" ? value.config.ratio : "",
      mode,
      generateAudio: value.config.generateAudio === true,
    },
    models,
    matchingModes,
  };
}

async function confirmGeneration() {
  const projectId = workspaceStore.project?.id;
  const pending = pendingGeneration.value;
  if (!projectId || !pending || generationLoading.value || taskDiscoveries.value.length) return;
  generationLoading.value = true;
  creativeBusy.value = true;
  try {
    const items: PreparedGeneration[] = [];
    for (const item of pending.items) {
      const request = await reconfigureGeneration(item);
      const estimate = await userAppStore.estimateGeneration({ projectId, modelId: item.modelId, request });
      if (estimate.taskType !== item.taskType) throw new Error("模型类型已经变化，请重新选择");
      items.push({ ...item, request, estimate });
    }
    await userAppStore.loadAccount();
    if (JSON.stringify(items.map(item => ({ request: item.request, credits: item.estimate.estimatedCredits }))) !== JSON.stringify(pending.items.map(item => ({ request: item.request, credits: item.estimate.estimatedCredits })))) {
      pendingGeneration.value = { ...pending, items };
      ElMessage.warning("模型配置或估价已更新，请重新确认");
      return;
    }
    const totalCredits = items.reduce((total, item) => total + item.estimate.estimatedCredits, 0);
    if (totalCredits > userAppStore.availableCredits) {
      pendingGeneration.value = { ...pending, items };
      ElMessage.error(`积分不足，还需要 ${totalCredits - userAppStore.availableCredits} 积分`);
      return;
    }
    const previousTaskIds = new Set(projectTasks.value.map(task => task.id));
    let startedCount = 0;
    for (const item of items) {
      delete generationErrors[item.nodeId];
      const discovery: TaskDiscovery = {
        nodeId: item.nodeId,
        modelId: item.modelId,
        taskType: item.taskType,
        outputDirectory: `assets/${item.nodeId}`,
        previousTaskIds,
        discoveryDeadline: Date.now() + 10_000,
      };
      taskDiscoveries.value.push(discovery);
      try {
        await getCanvas().call({ name: "nodeTools", args: { nodeId: item.nodeId, name: item.taskType === "video" ? "node:generateVideo" : "node:generateImage", args: {} } });
        startedCount++;
      } catch (error) {
        generationErrors[item.nodeId] = apiErrorMessage(error, `${item.taskType === "video" ? "视频" : "图片"}生成未能启动`);
        taskDiscoveries.value = taskDiscoveries.value.filter(value => value !== discovery);
      }
    }
    generationDialogVisible.value = false;
    pendingGeneration.value = undefined;
    if (startedCount) {
      ElMessage.success(`${startedCount} 个生成任务正在创建`);
      scheduleTaskPoll(300);
    } else ElMessage.error("生成任务均未能启动，请检查模型配置后重试");
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, "生成任务未能启动"));
    await Promise.allSettled([userAppStore.loadAccount(), userAppStore.loadModels(), userAppStore.loadTasks()]);
    await refreshCreativeView();
    if (activeTasks.value.length) scheduleTaskPoll();
  } finally {
    generationLoading.value = false;
    creativeBusy.value = false;
  }
}

async function reconfigureGeneration(item: PreparedGeneration) {
  if (item.taskType === "image") {
    const card = [...(creativeView.value?.characters ?? []), ...(creativeView.value?.storyboard ?? [])].find(value => value.nodeId === item.nodeId);
    if (!card) throw new Error("待生成内容已经变化，请关闭确认框后重试");
    return configureImageGeneration(item.nodeId, item.modelId, card.prompt);
  }
  const film = creativeView.value?.films.find(value => value.nodeId === item.nodeId);
  const shot = creativeView.value?.storyboard.find(value => value.order === film?.order);
  if (!shot?.output) throw new Error("分镜图片已经变化，请关闭确认框后重试");
  return configureVideoGeneration(item.nodeId, item.modelId, shot.prompt, shot.output, shot.nodeId);
}

function cancelGeneration() {
  if (generationLoading.value) return;
  generationDialogVisible.value = false;
  pendingGeneration.value = undefined;
}

function scheduleTaskPoll(delay = 2_000) {
  if (disposed || document.hidden || taskPollTimer !== undefined || taskPolling) return;
  taskPollTimer = window.setTimeout(() => {
    taskPollTimer = undefined;
    void pollGenerationTasks();
  }, delay);
}

async function pollGenerationTasks() {
  if (disposed || taskPolling) return;
  taskPolling = true;
  try {
    await Promise.all([userAppStore.loadTasks(), userAppStore.loadAccount()]);
    await refreshCreativeView();
    const remaining: TaskDiscovery[] = [];
    for (const discovery of taskDiscoveries.value) {
      if (!discovery.taskId) {
        const created = projectTasks.value.find(task =>
          !discovery.previousTaskIds.has(task.id)
          && task.taskType === discovery.taskType
          && task.modelId === discovery.modelId
          && task.requestSummary?.input?.outputDirectory === discovery.outputDirectory,
        );
        if (created) discovery.taskId = created.id;
        else if (Date.now() >= discovery.discoveryDeadline) {
          generationErrors[discovery.nodeId] = "生成任务未能创建，请检查模型和积分后重试";
          continue;
        }
      }
      if (!discovery.taskId) {
        remaining.push(discovery);
        continue;
      }
      const task = projectTasks.value.find(item => item.id === discovery.taskId);
      const outputReady = [...(creativeView.value?.characters ?? []), ...(creativeView.value?.storyboard ?? []), ...(creativeView.value?.films ?? [])]
        .some(item => item.nodeId === discovery.nodeId && item.output);
      const terminal = !!task && ["succeeded", "failed", "cancelled"].includes(task.status);
      if (outputReady || terminal && task.status !== "succeeded") continue;
      if (task?.status === "succeeded") {
        discovery.settleDeadline ??= Date.now() + 5_000;
        if (Date.now() >= discovery.settleDeadline) continue;
      }
      remaining.push(discovery);
    }
    taskDiscoveries.value = remaining;
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, "生成任务状态刷新失败"));
  } finally {
    taskPolling = false;
  }
  if (activeTasks.value.length || taskDiscoveries.value.length) scheduleTaskPoll();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function openAdvanced() {
  if (!workspaceStore.project) return;
  setProjectMode("advanced");
  await router.push(`/app/projects/${workspaceStore.project.id}/advanced`);
}
</script>

<style scoped lang="scss">
.projectPage {
  .projectShell {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr) 340px;
    align-items: start;
    gap: 18px;
    margin-top: 22px;

    .stageNavigation {
      position: sticky;
      top: 22px;
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }

    .stageWorkspace,
    .projectAside { min-width: 0; }
  }

  .stageWorkspace {
    min-height: 480px;
    padding: 30px;

    .creativeWarning { margin-top: 18px; }
    :deep(.scriptStage),
    :deep(.characterStage),
    :deep(.storyboardStage),
    :deep(.filmStage) { margin-top: 24px; }

    .stageHeading {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      .stageIcon { display: grid; width: 50px; height: 50px; flex-shrink: 0; place-items: center; border-radius: 15px; background: var(--studioAccentSoft); color: var(--studioAccent); }
      h2 { margin: 5px 0 7px; color: var(--studioText); font-size: 23px; }
      p:last-child { margin: 0; color: var(--studioMuted); line-height: 1.6; }
    }

  }

  .projectAside { display: grid; gap: 14px; }
  .progressCard {
    strong { display: block; margin: 13px 0 10px; color: var(--studioText); font-size: 30px; }
    > p:last-child { margin: 11px 0 0; color: var(--studioMuted); font-size: 12px; }
  }
  .recentCard {
    .asideHeading { display: flex; align-items: center; justify-content: space-between; gap: 10px; h3 { margin: 0; font-size: 15px; } a { color: var(--studioAccent); font-size: 12px; text-decoration: none; } }
    .recentList { margin-top: 13px; }
    article { display: flex; align-items: center; gap: 8px; padding: 12px 0; + article { border-top: 1px solid var(--studioBorder); } > span:first-child { display: grid; flex: 1; gap: 4px; } strong { font-size: 13px; } small { color: var(--studioMuted); font-size: 10px; } }
  }
}

@media (max-width: 1100px) {
  .projectPage .projectShell {
    grid-template-columns: 210px minmax(0, 1fr);
    .projectAside { grid-column: 1 / -1; grid-template-columns: 1fr 1fr; }
  }
}

@media (max-width: 720px) {
  .projectPage {
    .projectShell {
      grid-template-columns: minmax(0, 1fr);
      .stageNavigation { position: static; }
      .projectAside { grid-column: auto; grid-template-columns: minmax(0, 1fr); }
    }
    .stageWorkspace { min-height: 0; padding: 20px; }
  }
}
</style>
