<template>
  <section class="storyboardStage">
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" showIcon :closable="false" />
    <div v-else-if="loading" class="stageLoading" v-loading="true" aria-label="正在读取分镜" />
    <div v-else-if="!shots.length" class="missingContent">
      <icon-photo-off :size="34" aria-hidden="true" />
      <h3>还没有分镜草稿</h3>
      <p>请让导演助手先把剧本拆成连续镜头。</p>
    </div>
    <template v-else>
      <div class="stageTools">
        <div class="modelChoice">
          <label for="storyboardModel">分镜图片模型</label>
          <el-select id="storyboardModel" :modelValue="modelValue" :loading="modelsLoading" placeholder="暂无可用模型" @update:modelValue="emit('update:modelValue', String($event))">
            <el-option v-for="model in models" :key="model.id" :label="model.displayName" :value="model.id" />
          </el-select>
        </div>
        <el-button type="primary" :disabled="batchDisabled" @click="emit('requestGenerateAll', batchNodeIds)">批量生成 {{ batchCount }} 个分镜</el-button>
      </div>

      <div class="shotList">
        <article v-for="(shot, index) in shots" :key="shot.nodeId" class="shotCard">
          <div class="shotPreview">
            <button
              v-if="previewUrls[shot.nodeId]"
              type="button"
              :aria-label="`放大查看镜头${shot.title}`"
              @click="openPreview(previewUrls[shot.nodeId], `镜头 ${shot.title} 预览`)">
              <img :src="previewUrls[shot.nodeId]" :alt="`镜头 ${shot.title} 预览`" />
            </button>
            <icon-photo v-else :size="42" aria-hidden="true" />
          </div>
          <div class="shotBody">
            <header>
              <div><p class="eyebrow">镜头 {{ shot.title }}</p><h3>分镜画面</h3></div>
              <el-tag :type="statusType(shot)" effect="light" round>{{ statusText(shot) }}</el-tag>
            </header>
            <el-alert v-if="cardError(shot)" :title="cardError(shot)" type="error" showIcon :closable="false" />
            <el-input v-model="drafts[shot.nodeId]" type="textarea" :autosize="{ minRows: 4, maxRows: 8 }" :disabled="busy" aria-label="分镜生成提示词" />
            <div v-if="assets.length" class="assetChoice">
              <label :for="`shotAssets-${shot.nodeId}`">本镜资产</label>
              <el-select
                :id="`shotAssets-${shot.nodeId}`"
                v-model="assetSelections[shot.nodeId]"
                multiple
                filterable
                collapseTags
                collapseTagsTooltip
                :disabled="busy"
                placeholder="选择需要出现在此镜的资产">
                <el-option-group v-for="group in assetGroups" :key="group.type" :label="assetTypeLabels[group.type]">
                  <el-option v-for="asset in group.assets" :key="asset.nodeId" :label="asset.title" :value="asset.nodeId" :disabled="lockedAssetIds(shot).includes(asset.nodeId)" />
                </el-option-group>
              </el-select>
              <p v-if="shot.assetReferences.length" class="assetSummary">
                当前引用：{{ shot.assetReferences.map(asset => `${assetTypeLabels[asset.assetType]}·${asset.title}`).join("、") }}
              </p>
              <el-alert
                v-if="lockedAssetIds(shot).length"
                title="此镜头包含高级画布建立的资产连接，普通创作页会保留它们；请在高级画布调整。"
                type="info"
                showIcon
                :closable="false" />
              <el-button type="primary" plain :disabled="busy || !assetSelectionChanged(shot)" @click="emit('saveAssetReferences', shot.nodeId, assetSelections[shot.nodeId] ?? [])">保存本镜资产</el-button>
            </div>
            <footer>
              <span class="orderButtons">
                <el-button circle :disabled="busy || index === 0" aria-label="向前移动镜头" @click="emit('reorder', shot.nodeId, -1)"><icon-arrow-up :size="16" /></el-button>
                <el-button circle :disabled="busy || index === shots.length - 1" aria-label="向后移动镜头" @click="emit('reorder', shot.nodeId, 1)"><icon-arrow-down :size="16" /></el-button>
              </span>
              <el-button :disabled="busy || drafts[shot.nodeId] === shot.prompt" @click="emit('saveContent', shot.nodeId, drafts[shot.nodeId] || '', shot.draftLabel)">保存描述</el-button>
              <el-button type="success" plain :disabled="busy || shot.confirmed || drafts[shot.nodeId] !== shot.prompt" @click="emit('confirmContent', shot.nodeId, shot.confirmedLabel)">确认镜头</el-button>
              <el-button type="primary" :loading="isGenerating(shot)" :disabled="generateDisabled(shot)" :title="generateHint(shot)" @click="emit('requestGenerate', shot.nodeId)">{{ shot.output ? "重新生成" : "生成分镜" }}</el-button>
            </footer>
          </div>
        </article>
      </div>
    </template>
    <el-dialog
      :modelValue="Boolean(selectedPreviewUrl)"
      :title="selectedPreviewTitle"
      width="min(1100px, 92vw)"
      appendToBody
      alignCenter
      destroyOnClose
      @update:modelValue="handlePreviewVisibility">
      <img v-if="selectedPreviewUrl" class="dialogPreviewImage" :src="selectedPreviewUrl" :alt="selectedPreviewTitle" />
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { IconArrowDown, IconArrowUp, IconPhoto, IconPhotoOff } from "@tabler/icons-vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { friendlyTaskError } from "@/pages/app/appFormat";
import type { PublicModel } from "@/stores/userApp";
import { assetTypeLabels, type CreativeAssetType, type CreativeMediaCard } from "../creativeViewAdapter";

const props = defineProps<{
  projectId: string;
  shots: CreativeMediaCard[];
  assets: CreativeMediaCard[];
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
  saveContent: [nodeId: string, prompt: string, draftLabel: string];
  confirmContent: [nodeId: string, confirmedLabel: string];
  reorder: [nodeId: string, direction: -1 | 1];
  saveAssetReferences: [nodeId: string, assetNodeIds: string[]];
  requestGenerate: [nodeId: string];
  requestGenerateAll: [nodeIds: string[]];
}>();
const drafts = reactive<Record<string, string>>({});
const sourcePrompts = reactive<Record<string, string>>({});
const assetSelections = reactive<Record<string, string[]>>({});
const sourceAssetSelections = reactive<Record<string, string>>({});
const previewUrls = reactive<Record<string, string>>({});
const selectedPreviewUrl = ref("");
const selectedPreviewTitle = ref("");
let releases: Array<() => void> = [];
let previewVersion = 0;
const assetTypes: CreativeAssetType[] = ["character", "scene", "prop", "style"];
const assetGroups = computed(() => assetTypes.flatMap(type => {
  const assets = props.assets.filter(asset => asset.assetType === type);
  return assets.length ? [{ type, assets }] : [];
}));
const batchNodeIds = computed(() => props.shots.filter(shot => !shot.output && shot.prompt.trim() && drafts[shot.nodeId] === shot.prompt && !isGenerating(shot)).map(shot => shot.nodeId));
const batchCount = computed(() => batchNodeIds.value.length);
const batchDisabled = computed(() => props.busy || !props.modelValue || batchCount.value === 0);

watch(() => props.shots, shots => {
  const nodeIds = new Set(shots.map(shot => shot.nodeId));
  for (const nodeId of Object.keys(drafts)) {
    if (nodeIds.has(nodeId)) continue;
    delete drafts[nodeId];
    delete sourcePrompts[nodeId];
    delete assetSelections[nodeId];
    delete sourceAssetSelections[nodeId];
  }
  for (const shot of shots) {
    const sourcePrompt = sourcePrompts[shot.nodeId];
    const dirty = sourcePrompt !== undefined && drafts[shot.nodeId] !== sourcePrompt;
    sourcePrompts[shot.nodeId] = shot.prompt;
    if (!dirty) drafts[shot.nodeId] = shot.prompt;
    const sourceAssets = JSON.stringify(guidedAssetIds(shot));
    const assetsDirty = sourceAssetSelections[shot.nodeId] !== undefined && JSON.stringify(assetSelections[shot.nodeId] ?? []) !== sourceAssetSelections[shot.nodeId];
    sourceAssetSelections[shot.nodeId] = sourceAssets;
    if (!assetsDirty) assetSelections[shot.nodeId] = guidedAssetIds(shot);
  }
}, { immediate: true });

watch(() => JSON.stringify([props.projectId, ...props.shots.map(shot => [shot.nodeId, shot.output?.path ?? "", shot.output?.mimeType ?? ""])]), async () => {
  const version = ++previewVersion;
  closePreview();
  releasePreviews();
  for (const key of Object.keys(previewUrls)) delete previewUrls[key];
  const files = useWorkspaceFiles(props.projectId);
  for (const shot of props.shots) {
    if (!shot.output) continue;
    const acquired = files.acquireUrl(shot.output.path, shot.output.mimeType);
    releases.push(acquired.release);
    try {
      const url = await acquired.url;
      if (version === previewVersion) previewUrls[shot.nodeId] = url;
    } catch {
      if (version === previewVersion) previewUrls[shot.nodeId] = "";
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

function openPreview(url: string, title: string) {
  selectedPreviewUrl.value = url;
  selectedPreviewTitle.value = title;
}

function closePreview() {
  selectedPreviewUrl.value = "";
  selectedPreviewTitle.value = "";
}

function handlePreviewVisibility(visible: boolean) {
  if (!visible) closePreview();
}

function statusText(shot: CreativeMediaCard) {
  if (shot.task?.status === "pending" || shot.task?.status === "running") return "正在生成";
  if (shot.task?.status === "failed") return "生成失败";
  if (shot.task?.status === "cancelled") return "已取消";
  if (shot.output) return shot.confirmed ? "已确认" : "已有预览";
  return shot.confirmed ? "已确认" : "待确认";
}

function statusType(shot: CreativeMediaCard) {
  if (shot.task?.status === "failed") return "danger";
  if (shot.task?.status === "cancelled") return "warning";
  if (shot.confirmed && shot.output) return "success";
  return "warning";
}

function cardError(shot: CreativeMediaCard) {
  return props.generationErrors[shot.nodeId] || friendlyTaskError(shot.task?.errorMessage ?? null);
}

function isGenerating(shot: CreativeMediaCard) {
  return shot.task?.status === "pending" || shot.task?.status === "running";
}

function generateDisabled(shot: CreativeMediaCard) {
  return props.busy || isGenerating(shot) || !props.modelValue || !shot.prompt.trim() || drafts[shot.nodeId] !== shot.prompt;
}

function generateHint(shot: CreativeMediaCard) {
  if (!props.modelValue) return "管理员暂未启用图片模型";
  if (drafts[shot.nodeId] !== shot.prompt) return "请先保存镜头描述";
  if (isGenerating(shot)) return "分镜图片正在生成";
  return "查看预计积分并确认生成";
}

function guidedAssetIds(shot: CreativeMediaCard) {
  return shot.assetReferences.filter(asset => asset.managedByGuided).map(asset => asset.nodeId);
}

function lockedAssetIds(shot: CreativeMediaCard) {
  return shot.assetReferences.filter(asset => !asset.managedByGuided).map(asset => asset.nodeId);
}

function assetSelectionChanged(shot: CreativeMediaCard) {
  return JSON.stringify(assetSelections[shot.nodeId] ?? []) !== sourceAssetSelections[shot.nodeId];
}
</script>

<style scoped lang="scss">
.storyboardStage {
  display: grid;
  gap: 18px;
  .stageLoading { min-height: 320px; }
  .missingContent { display: grid; min-height: 320px; place-items: center; align-content: center; gap: 10px; color: var(--studioMuted); text-align: center; h3, p { margin: 0; } h3 { color: var(--studioText); } }
  .stageTools { display: flex; align-items: end; justify-content: space-between; gap: 16px; }
  .modelChoice { display: grid; width: min(420px, 100%); gap: 7px; label { color: var(--studioText); font-size: 13px; font-weight: 650; } }
  .shotList { display: grid; gap: 15px; }
  .shotCard { display: grid; grid-template-columns: minmax(300px, 36%) minmax(0, 1fr); overflow: hidden; border: 1px solid var(--studioBorder); border-radius: 16px; background: var(--studioSurface); }
  .shotPreview {
    display: grid;
    min-height: 230px;
    place-items: center;
    background: var(--studioSurfaceMuted);
    color: var(--studioMuted);
    button {
      display: grid;
      width: 100%;
      height: 100%;
      min-height: 230px;
      padding: 8px;
      place-items: center;
      border: 0;
      background: transparent;
      cursor: zoom-in;
      img { display: block; width: 100%; max-height: 300px; object-fit: contain; }
      &:focus-visible { outline: 2px solid var(--studioAccent); outline-offset: -4px; }
    }
  }
  .shotBody { display: grid; align-content: start; gap: 13px; padding: 18px; header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; h3 { margin: 4px 0 0; color: var(--studioText); } } footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; .orderButtons { margin-right: auto; } } :deep(.el-textarea__inner) { border-radius: 12px; line-height: 1.65; } }
  .assetChoice { display: grid; gap: 8px; label { color: var(--studioText); font-size: 13px; font-weight: 650; } .assetSummary { margin: 0; color: var(--studioMuted); font-size: 12px; line-height: 1.6; } :deep(.el-alert) { padding: 8px 10px; } }
  .dialogPreviewImage { display: block; max-width: 100%; max-height: calc(100dvh - 180px); margin: 0 auto; object-fit: contain; }
}
@media (max-width: 720px) {
  .storyboardStage {
    .stageTools { align-items: stretch; flex-direction: column; }
    .shotCard { grid-template-columns: minmax(0, 1fr); }
    .shotPreview { min-height: 180px; button { min-height: 180px; img { max-height: 300px; } } }
  }
}
</style>
