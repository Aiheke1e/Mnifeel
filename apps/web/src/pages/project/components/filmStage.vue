<template>
  <section class="filmStage">
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" showIcon :closable="false" />
    <div v-else-if="loading" class="stageLoading" v-loading="true" aria-label="正在读取成片" />
    <div v-else-if="!storyboard.length" class="missingContent">
      <icon-movie-off :size="34" aria-hidden="true" />
      <h3>还没有可生成的分镜</h3>
      <p>请先完成分镜画面，再生成视频片段。</p>
    </div>
    <template v-else>
      <div class="modelChoice">
        <label for="filmModel">视频生成模型</label>
        <el-select id="filmModel" :modelValue="modelValue" :loading="modelsLoading" placeholder="暂无可用模型" @update:modelValue="emit('update:modelValue', String($event))">
          <el-option v-for="model in models" :key="model.id" :label="model.displayName" :value="model.id" />
        </el-select>
      </div>
      <div class="filmList">
        <article v-for="shot in storyboard" :key="shot.nodeId" class="filmCard">
          <div class="filmPreview">
            <video v-if="filmFor(shot)?.output && previewUrls[filmFor(shot)!.nodeId]" :src="previewUrls[filmFor(shot)!.nodeId]" controls preload="metadata" />
            <icon-player-play v-else :size="44" aria-hidden="true" />
          </div>
          <div class="filmBody">
            <header>
              <div><p class="eyebrow">镜头 {{ shot.title }}</p><h3>视频片段</h3></div>
              <el-tag :type="statusType(shot)" effect="light" round>{{ statusText(shot) }}</el-tag>
            </header>
            <p class="shotPrompt">{{ shot.prompt }}</p>
            <el-alert v-if="cardError(shot)" :title="cardError(shot)" type="error" showIcon :closable="false" />
            <p v-if="filmFor(shot)?.task" class="creditText">{{ taskCreditText(filmFor(shot)!.task!) }}</p>
            <footer>
              <el-button v-if="filmFor(shot)?.output" :disabled="busy" @click="downloadFilm(filmFor(shot)!)">下载片段</el-button>
              <el-button type="primary" :loading="isGenerating(shot)" :disabled="generateDisabled(shot)" :title="generateHint(shot)" @click="emit('requestGenerate', shot.nodeId)">{{ filmFor(shot)?.output ? "重新生成" : "生成视频" }}</el-button>
            </footer>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, reactive, watch } from "vue";
import { ElMessage } from "element-plus";
import { IconMovieOff, IconPlayerPlay } from "@tabler/icons-vue";
import downloadFile from "@/lib/downloadFile";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { friendlyTaskError, taskCreditText } from "@/pages/app/appFormat";
import type { PublicModel } from "@/stores/userApp";
import type { CreativeMediaCard } from "../creativeViewAdapter";

const props = defineProps<{
  projectId: string;
  storyboard: CreativeMediaCard[];
  films: CreativeMediaCard[];
  models: PublicModel[];
  modelValue: string;
  modelsLoading: boolean;
  loading: boolean;
  errorMessage: string;
  generationErrors: Record<string, string>;
  busy: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
  requestGenerate: [storyboardNodeId: string];
}>();
const previewUrls = reactive<Record<string, string>>({});
let releases: Array<() => void> = [];
let previewVersion = 0;

watch(() => [props.projectId, ...props.films.map(film => `${film.nodeId}:${film.output?.path ?? ""}:${film.output?.mimeType ?? ""}`)], async () => {
  const version = ++previewVersion;
  releasePreviews();
  for (const key of Object.keys(previewUrls)) delete previewUrls[key];
  const files = useWorkspaceFiles(props.projectId);
  for (const film of props.films) {
    if (!film.output) continue;
    const acquired = files.acquireUrl(film.output.path, film.output.mimeType);
    releases.push(acquired.release);
    try {
      const url = await acquired.url;
      if (version === previewVersion) previewUrls[film.nodeId] = url;
    } catch {
      if (version === previewVersion) previewUrls[film.nodeId] = "";
    }
  }
}, { immediate: true });

onBeforeUnmount(() => {
  previewVersion++;
  releasePreviews();
});

function releasePreviews() {
  releases.forEach(release => release());
  releases = [];
}

function filmFor(shot: CreativeMediaCard) {
  return props.films.find(film => film.order === shot.order);
}

function isGenerating(shot: CreativeMediaCard) {
  const status = filmFor(shot)?.task?.status;
  return status === "pending" || status === "running";
}

function statusText(shot: CreativeMediaCard) {
  const film = filmFor(shot);
  if (film?.task?.status === "pending" || film?.task?.status === "running") return `生成中 ${film.task.progress}%`;
  if (film?.task?.status === "failed") return "生成失败";
  if (film?.task?.status === "cancelled") return "已取消";
  if (film?.output) return "已完成";
  return shot.confirmed && shot.output ? "可生成" : "等待分镜确认";
}

function statusType(shot: CreativeMediaCard) {
  const film = filmFor(shot);
  if (film?.task?.status === "failed") return "danger";
  if (film?.task?.status === "cancelled") return "warning";
  if (film?.output) return "success";
  return "info";
}

function cardError(shot: CreativeMediaCard) {
  const film = filmFor(shot);
  return film ? props.generationErrors[film.nodeId] || friendlyTaskError(film.task?.errorMessage ?? null) : "";
}

function generateDisabled(shot: CreativeMediaCard) {
  return props.busy || isGenerating(shot) || !props.modelValue || !shot.confirmed || !shot.output;
}

function generateHint(shot: CreativeMediaCard) {
  if (!props.modelValue) return "管理员暂未启用视频模型";
  if (!shot.confirmed || !shot.output) return "请先生成并确认分镜图片";
  if (isGenerating(shot)) return "视频片段正在生成";
  return "查看预计积分并确认生成";
}

async function downloadFilm(film: CreativeMediaCard) {
  if (!film.output) return;
  try {
    const files = useWorkspaceFiles(props.projectId);
    const output = film.output;
    const extension = output.mimeType.split("/")[1]?.split(";")[0] || "mp4";
    await downloadFile(async () => new Blob([await files.read(output.path)], { type: output.mimeType }), `镜头-${film.title}.${extension}`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "视频下载失败");
  }
}
</script>

<style scoped lang="scss">
.filmStage {
  display: grid;
  gap: 18px;
  .stageLoading { min-height: 320px; }
  .missingContent { display: grid; min-height: 320px; place-items: center; align-content: center; gap: 10px; color: var(--studioMuted); text-align: center; h3, p { margin: 0; } h3 { color: var(--studioText); } }
  .modelChoice { display: grid; max-width: 420px; gap: 7px; label { color: var(--studioText); font-size: 13px; font-weight: 650; } }
  .filmList { display: grid; gap: 15px; }
  .filmCard { display: grid; grid-template-columns: minmax(220px, 42%) minmax(0, 1fr); overflow: hidden; border: 1px solid var(--studioBorder); border-radius: 16px; background: var(--studioSurface); }
  .filmPreview { display: grid; min-height: 260px; place-items: center; overflow: hidden; background: #111827; color: #94a3b8; video { width: 100%; height: 100%; max-height: 420px; object-fit: contain; } }
  .filmBody { display: grid; align-content: start; gap: 14px; padding: 18px; header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; h3 { margin: 4px 0 0; color: var(--studioText); } } .shotPrompt { margin: 0; color: var(--studioText); line-height: 1.7; } .creditText { margin: 0; color: var(--studioMuted); font-size: 12px; } footer { display: flex; justify-content: flex-end; gap: 8px; } }
}
@media (max-width: 720px) { .filmStage .filmCard { grid-template-columns: minmax(0, 1fr); .filmPreview { min-height: 220px; } } }
</style>
