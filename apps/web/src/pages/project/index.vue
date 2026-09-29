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
          :busy="creativeBusy"
          @saveContent="saveCharacter"
          @confirmContent="confirmNode"
          @requestRepair="fillRepairPrompt('characters')" />

        <template v-else>
          <ol class="stageChecklist">
            <li v-for="item in stageContent.checklist" :key="item"><icon-circle-check :size="18" aria-hidden="true" />{{ item }}</li>
          </ol>

          <div class="modelChoice">
            <label for="stageModel">本步骤使用的模型</label>
            <el-select id="stageModel" v-model="selectedModelId" :loading="modelsLoading" placeholder="暂无可用模型" size="large">
              <el-option v-for="model in stageModels" :key="model.id" :label="model.displayName" :value="model.id">
                <span>{{ model.displayName }}</span>
                <small v-if="model.isDefault">推荐</small>
              </el-option>
            </el-select>
            <p>{{ modelHint }}</p>
          </div>
        </template>
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { IconCircleCheck, IconFileText, IconPhoto, IconVideo } from "@tabler/icons-vue";
import type { CanvasContext } from "@minifeel/tool-canvas/runtime";
import { apiErrorMessage } from "@/lib/api";
import { getProjectModel, setProjectMode, setProjectModel } from "@/lib/projectMode";
import { useProjectSaveGuard } from "@/lib/projectSaveGuard";
import { useUserAppStore } from "@/stores/userApp";
import { useWorkspaceStore } from "@/stores/workspace";
import { formatDate, taskStatusLabels, taskStatusTypes, taskTypeLabels } from "@/pages/app/appFormat";
import projectHeader from "./components/projectHeader.vue";
import projectStages, { type ProjectStage, type ProjectStageStatus } from "./components/projectStages.vue";
import projectRuntime from "./components/projectRuntime.vue";
import directorPanel from "./components/directorPanel.vue";
import scriptStage from "./components/scriptStage.vue";
import characterStage from "./components/characterStage.vue";
import { readCreativeView, type CreativeView } from "./creativeViewAdapter";

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
const activeStage = ref<ProjectStage>("script");
const selectedModelId = ref("");
const runtimeRef = ref<InstanceType<typeof projectRuntime>>();
const directorRef = ref<InstanceType<typeof directorPanel>>();
let creativeRefreshVersion = 0;
const runtimeReady = computed(() => runtimeRef.value?.canvasReady ?? false);
provide("canvas", () => runtimeReady.value ? runtimeRef.value?.getCanvasContext() : undefined);
useProjectSaveGuard({
  isBusy: () => runtimeRef.value?.saveBusy ?? false,
  flushSave: () => runtimeRef.value?.flushSave() ?? Promise.resolve(),
  cancelSave: () => runtimeRef.value?.cancelSave(),
});
const stageContents = {
  script: { number: 1, title: "把灵感变成完整剧本", description: "先确定人物、冲突和结局，再补充场景与对白。", checklist: ["写下一句话故事梗概", "整理主要人物和人物关系", "按场景完善对白与行动"], icon: IconFileText, mediaType: "text" },
  characters: { number: 2, title: "建立统一的角色形象", description: "为主要人物确定外貌、服装和情绪，让前后画面保持一致。", checklist: ["选择角色的年龄和气质", "补充服装与外貌特征", "生成并确认角色参考图"], icon: IconPhoto, mediaType: "image" },
  storyboard: { number: 3, title: "把剧本拆成连续画面", description: "逐镜确认景别、构图和人物动作，提前看清故事节奏。", checklist: ["按剧情拆分镜头", "描述每个镜头的主体与环境", "生成并调整分镜画面"], icon: IconPhoto, mediaType: "image" },
  video: { number: 4, title: "生成可以剪辑的视频片段", description: "选择确认过的分镜，生成镜头片段并查看任务进度。", checklist: ["选择需要生成的分镜", "确认画面比例与时长", "生成视频并下载成片"], icon: IconVideo, mediaType: "video" },
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
const modelHint = computed(() => stageModels.value.length ? "可用模型由管理员统一配置，你只需选择适合当前步骤的模型。" : "管理员暂未启用此类模型。" );

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
    ]);
    await refreshCreativeView();
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "项目加载失败");
  } finally {
    loading.value = false;
    modelsLoading.value = false;
  }
});

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
    const view = await readCreativeView(projectId, userAppStore.tasks.filter(task => task.projectId === projectId));
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

function confirmNode(nodeId: string, confirmedLabel: string) {
  return updateNode(nodeId, confirmedLabel);
}

function fillRepairPrompt(type: "script" | "characters") {
  const prompt = type === "script"
    ? "请检查当前画布中的故事内容，把合适的文本节点整理为 Minifeel/剧本；如果还没有完整剧本，请新建文本节点补齐。只整理文字草稿，不生成图片或视频，不删除其他节点。"
    : "请根据 Minifeel/剧本 整理角色。每个角色使用一个图片生成节点，命名为 Minifeel/角色/<角色名>，只填写角色提示词，不生成图片，不删除其他节点。";
  void directorRef.value?.fillPrompt(prompt);
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
    :deep(.characterStage) { margin-top: 24px; }

    .stageHeading {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      .stageIcon { display: grid; width: 50px; height: 50px; flex-shrink: 0; place-items: center; border-radius: 15px; background: var(--studioAccentSoft); color: var(--studioAccent); }
      h2 { margin: 5px 0 7px; color: var(--studioText); font-size: 23px; }
      p:last-child { margin: 0; color: var(--studioMuted); line-height: 1.6; }
    }

    .stageChecklist {
      display: grid;
      gap: 11px;
      margin: 30px 0;
      padding: 20px;
      border-radius: 14px;
      background: var(--studioSurfaceMuted);
      list-style: none;
      li { display: flex; align-items: center; gap: 9px; color: var(--studioText); font-size: 13px; svg { flex-shrink: 0; color: var(--studioAccent); } }
    }

    .modelChoice {
      display: grid;
      max-width: 460px;
      gap: 8px;
      label { color: var(--studioText); font-size: 13px; font-weight: 650; }
      p { margin: 0; color: var(--studioMuted); font-size: 11px; line-height: 1.55; }
      :deep(.el-select__wrapper) { border-radius: 12px; }
      :deep(.el-select-dropdown__item small) { float: right; color: var(--studioAccent); }
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
