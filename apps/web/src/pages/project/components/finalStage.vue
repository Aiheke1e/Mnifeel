<template>
  <section class="finalStage">
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" showIcon :closable="false" />
    <div v-else-if="loading" class="stageLoading" v-loading="true" aria-label="正在读取成片信息" />
    <div v-else-if="!readyShots.length" class="missingContent">
      <icon-movie-off :size="34" aria-hidden="true" />
      <h3>还没有可合成的镜头</h3>
      <p>请先在镜头制作阶段生成并采用分镜对应的视频片段。</p>
      <el-button type="primary" @click="emit('backToFilm')">返回镜头制作</el-button>
    </div>
    <template v-else>
      <section class="clipOrder panel">
        <header>
          <h3>片段顺序</h3>
          <span class="muted">{{ readyShots.length }} 个分镜</span>
        </header>
        <ol>
          <li v-for="shot in readyShots" :key="shot.nodeId">
            <span class="orderIndex">镜头 {{ shot.title }}</span>
            <p>{{ shot.prompt }}</p>
            <el-tag :type="acceptedFilmByOrder.has(shot.order) ? 'success' : 'warning'" effect="light" round>
              {{ acceptedFilmByOrder.has(shot.order) ? "已采用" : "待采用" }}
            </el-tag>
          </li>
        </ol>
      </section>

      <el-alert v-if="missingShots.length" class="missingAlert" type="warning" showIcon :closable="false">
        <template #title>
          <div class="missingRow">
            <span>还有 {{ missingShots.length }} 个镜头未采用视频片段，采用后才能合成成片。</span>
            <el-button size="small" type="primary" plain @click="emit('backToFilm')">返回镜头制作</el-button>
          </div>
        </template>
      </el-alert>

      <section class="renderPanel panel">
        <header>
          <h3>成片</h3>
          <el-tag v-if="renderTask" :type="statusType" effect="light" round>{{ statusText }}</el-tag>
        </header>

        <div v-if="renderActive" class="renderProgress">
          <el-progress :percentage="renderTask?.progress ?? 0" :strokeWidth="8" />
          <p>正在合成成片，请稍候…</p>
        </div>

        <el-alert v-else-if="renderFailed" :title="renderError" type="error" showIcon :closable="false" />

        <div v-else-if="finalFilm?.output && previewUrl" class="finalPreview">
          <video :src="previewUrl" controls preload="metadata" />
        </div>

        <p v-else class="renderEmpty">合成后即可预览和下载完整成片。</p>

        <footer v-if="!renderActive" class="renderActions">
          <el-button v-if="finalFilm?.output && previewUrl" type="primary" :disabled="busy" @click="downloadFinal">下载成片</el-button>
          <el-button type="primary" :plain="!!finalFilm?.output" :disabled="!canRender" :title="renderHint" @click="emit('requestRender')">
            {{ finalFilm?.output ? "重新合成" : "合成成片" }}
          </el-button>
        </footer>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { IconMovieOff, IconPlayerPlay } from "@tabler/icons-vue";
import downloadFile from "@/lib/downloadFile";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { CreativeMediaCard, RenderTask } from "../creativeViewAdapter";

const props = defineProps<{
  projectId: string;
  storyboard: CreativeMediaCard[];
  films: CreativeMediaCard[];
  finalFilm: CreativeMediaCard | undefined;
  renderTask: RenderTask | undefined;
  loading: boolean;
  errorMessage: string;
  busy: boolean;
}>();
const emit = defineEmits<{
  requestRender: [];
  backToFilm: [];
}>();

const readyShots = computed(() => props.storyboard.filter(shot => shot.confirmed && shot.output));
const acceptedFilmByOrder = computed(() => new Map(props.films.filter(film => film.accepted).map(film => [film.order, film])));
const missingShots = computed(() => readyShots.value.filter(shot => !acceptedFilmByOrder.value.has(shot.order)));
const renderActive = computed(() => props.renderTask?.status === "pending" || props.renderTask?.status === "running");
const renderFailed = computed(() => props.renderTask?.status === "failed");
const canRender = computed(() => readyShots.value.length > 0 && missingShots.value.length === 0 && !renderActive.value && !props.busy);
const renderHint = computed(() => {
  if (missingShots.value.length) return "请先采用所有镜头的视频片段";
  if (renderActive.value) return "成片正在合成";
  return props.finalFilm?.output ? "重新合成一部成片" : "合成一部完整成片";
});
const statusText = computed(() => {
  const task = props.renderTask;
  if (!task) return "";
  if (task.status === "pending") return "排队中";
  if (task.status === "running") return `合成中 ${task.progress}%`;
  if (task.status === "succeeded") return "合成完成";
  if (task.status === "failed") return "合成失败";
  if (task.status === "cancelled") return "已取消";
  return "";
});
const statusType = computed(() => {
  const task = props.renderTask;
  if (!task) return "info";
  if (task.status === "succeeded") return "success";
  if (task.status === "failed") return "danger";
  if (task.status === "cancelled") return "warning";
  return "info";
});
const renderError = computed(() => props.renderTask?.errorMessage || props.renderTask?.errorCode || "成片合成失败，请重试");

const previewUrl = ref("");
let previewRelease: (() => void) | undefined;
let previewVersion = 0;

watch(() => [props.projectId, props.finalFilm?.output?.path, props.finalFilm?.output?.mimeType], async () => {
  const version = ++previewVersion;
  previewRelease?.();
  previewRelease = undefined;
  previewUrl.value = "";
  const output = props.finalFilm?.output;
  if (!output) return;
  const files = useWorkspaceFiles(props.projectId);
  const acquired = files.acquireUrl(output.path, output.mimeType);
  previewRelease = acquired.release;
  try {
    const url = await acquired.url;
    if (version === previewVersion) previewUrl.value = url;
  } catch {
    if (version === previewVersion) previewUrl.value = "";
  }
}, { immediate: true });

onBeforeUnmount(() => {
  previewVersion++;
  previewRelease?.();
});

async function downloadFinal() {
  const output = props.finalFilm?.output;
  if (!output) return;
  try {
    const files = useWorkspaceFiles(props.projectId);
    const extension = output.mimeType.split("/")[1]?.split(";")[0] || "mp4";
    await downloadFile(async () => new Blob([await files.read(output.path)], { type: output.mimeType }), `成片.${extension}`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "成片下载失败");
  }
}
</script>

<style scoped lang="scss">
.finalStage {
  display: grid;
  gap: 18px;
  .stageLoading { min-height: 320px; }
  .missingContent { display: grid; min-height: 320px; place-items: center; align-content: center; gap: 10px; color: var(--studioMuted); text-align: center; h3, p { margin: 0; } h3 { color: var(--studioText); } }
  .panel { display: grid; align-content: start; gap: 14px; border: 1px solid var(--studioBorder); border-radius: 16px; background: var(--studioSurface); padding: 18px; header { display: flex; align-items: center; justify-content: space-between; gap: 12px; h3 { margin: 0; color: var(--studioText); font-size: 15px; } } .muted { color: var(--studioMuted); font-size: 12px; } }
  .clipOrder ol { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; li { display: grid; grid-template-columns: 92px minmax(0, 1fr) auto; align-items: start; gap: 12px; padding: 11px 0; + li { border-top: 1px solid var(--studioBorder); } .orderIndex { color: var(--studioText); font-size: 13px; font-weight: 650; } p { margin: 0; color: var(--studioMuted); font-size: 12px; line-height: 1.6; } } }
  .missingAlert .missingRow { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .renderProgress { display: grid; gap: 10px; p { margin: 0; color: var(--studioMuted); font-size: 12px; } }
  .finalPreview { display: grid; gap: 12px; video { width: 100%; max-height: 460px; border-radius: 12px; background: #111827; } }
  .renderEmpty { margin: 0; color: var(--studioMuted); text-align: center; }
  .renderActions { display: flex; justify-content: flex-end; gap: 8px; }
}
</style>
