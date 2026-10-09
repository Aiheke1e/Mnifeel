<template>
  <section class="assetStage">
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" showIcon :closable="false" />
    <div v-else-if="loading" class="stageLoading" v-loading="true" aria-label="正在读取资产" />
    <div v-else-if="!assets.length" class="missingContent">
      <icon-photo-off :size="34" aria-hidden="true" />
      <h3>还没有符合规范的资产草稿</h3>
      <p>可以让导演助手根据剧本补齐角色、场景、道具和风格。</p>
      <el-button type="primary" @click="emit('requestRepair')">让导演助手整理资产</el-button>
    </div>
    <template v-else>
      <div class="modelChoice">
        <label for="assetModel">资产图片模型</label>
        <el-select id="assetModel" :modelValue="modelValue" :loading="modelsLoading" placeholder="暂无可用模型" @update:modelValue="emit('update:modelValue', String($event))">
          <el-option v-for="model in models" :key="model.id" :label="model.displayName" :value="model.id" />
        </el-select>
      </div>
      <section v-for="group in assetGroups" :key="group.type" class="assetGroup">
        <header class="assetGroupHeader"><h3>{{ assetTypeLabels[group.type] }}</h3><span>{{ group.assets.length }} 项</span></header>
        <div class="assetGrid">
          <article v-for="asset in group.assets" :key="asset.nodeId" class="assetCard">
            <div class="assetPreview">
              <button
                v-if="previewUrls[asset.nodeId]"
                type="button"
                :aria-label="`放大查看${asset.title}${assetLabel(asset)}参考图`"
                @click="openPreview(previewUrls[asset.nodeId], `${asset.title}${assetLabel(asset)}参考图`)">
                <img :src="previewUrls[asset.nodeId]" :alt="`${asset.title}${assetLabel(asset)}参考图`" />
              </button>
              <icon-photo v-else :size="44" aria-hidden="true" />
            </div>
            <div class="assetBody">
              <header>
                <div><p class="eyebrow">{{ assetLabel(asset) }}设定</p><h3>{{ asset.title }}</h3></div>
                <el-tag :type="statusType(asset)" effect="light" round>{{ statusText(asset) }}</el-tag>
              </header>
              <el-input v-model="drafts[asset.nodeId]" type="textarea" :autosize="{ minRows: 4, maxRows: 8 }" :disabled="busy" :aria-label="`${asset.title}生成提示词`" />
              <footer>
                <el-button :disabled="busy || drafts[asset.nodeId] === asset.prompt" @click="emit('saveContent', asset.nodeId, drafts[asset.nodeId] || '', asset.draftLabel)">保存设定</el-button>
                <el-button type="success" plain :disabled="busy || asset.confirmed || drafts[asset.nodeId] !== asset.prompt" @click="emit('confirmContent', asset.nodeId, asset.confirmedLabel)">锁定资产</el-button>
                <el-button
                  type="primary"
                  :loading="isGenerating(asset)"
                  :disabled="generateDisabled(asset)"
                  :title="generateHint(asset)"
                  @click="emit('requestGenerate', asset.nodeId)">
                  {{ asset.output ? "重新生成" : "确认生成" }}
                </el-button>
              </footer>
            </div>
          </article>
        </div>
      </section>
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
import { IconPhoto, IconPhotoOff } from "@tabler/icons-vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { PublicModel } from "@/stores/userApp";
import { assetTypeLabels, type CreativeAssetType, type CreativeMediaCard } from "../creativeViewAdapter";

const props = defineProps<{
  projectId: string;
  assets: CreativeMediaCard[];
  models: PublicModel[];
  modelValue: string;
  modelsLoading: boolean;
  loading: boolean;
  errorMessage: string;
  busy: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
  saveContent: [nodeId: string, prompt: string, draftLabel: string];
  confirmContent: [nodeId: string, confirmedLabel: string];
  requestRepair: [];
  requestGenerate: [nodeId: string];
}>();
const assetTypes: CreativeAssetType[] = ["character", "scene", "prop", "style"];
const drafts = reactive<Record<string, string>>({});
const sourcePrompts = reactive<Record<string, string>>({});
const previewUrls = reactive<Record<string, string>>({});
const selectedPreviewUrl = ref("");
const selectedPreviewTitle = ref("");
let releases: Array<() => void> = [];
let previewVersion = 0;

const assetGroups = computed(() => assetTypes.flatMap(type => {
  const assets = props.assets.filter(asset => asset.assetType === type);
  return assets.length ? [{ type, assets }] : [];
}));

watch(() => props.assets, assets => {
  const nodeIds = new Set(assets.map(asset => asset.nodeId));
  for (const nodeId of Object.keys(drafts)) {
    if (nodeIds.has(nodeId)) continue;
    delete drafts[nodeId];
    delete sourcePrompts[nodeId];
  }
  for (const asset of assets) {
    const sourcePrompt = sourcePrompts[asset.nodeId];
    const dirty = sourcePrompt !== undefined && drafts[asset.nodeId] !== sourcePrompt;
    sourcePrompts[asset.nodeId] = asset.prompt;
    if (!dirty) drafts[asset.nodeId] = asset.prompt;
  }
}, { immediate: true });

watch(() => JSON.stringify([props.projectId, ...props.assets.map(asset => [asset.nodeId, asset.output?.path ?? "", asset.output?.mimeType ?? ""])]), async () => {
  const version = ++previewVersion;
  closePreview();
  releasePreviews();
  for (const key of Object.keys(previewUrls)) delete previewUrls[key];
  const files = useWorkspaceFiles(props.projectId);
  for (const asset of props.assets) {
    if (!asset.output) continue;
    const acquired = files.acquireUrl(asset.output.path, asset.output.mimeType);
    releases.push(acquired.release);
    try {
      const url = await acquired.url;
      if (version === previewVersion) previewUrls[asset.nodeId] = url;
    } catch {
      if (version === previewVersion) previewUrls[asset.nodeId] = "";
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

function statusText(asset: CreativeMediaCard) {
  if (asset.task?.status === "pending" || asset.task?.status === "running") return "正在生成";
  if (asset.task?.status === "failed") return "生成失败";
  if (asset.output) return asset.confirmed ? "已锁定" : "已有预览";
  return asset.confirmed ? "已锁定" : "待确认";
}

function assetLabel(asset: CreativeMediaCard) {
  return asset.assetType ? assetTypeLabels[asset.assetType] : "资产";
}

function statusType(asset: CreativeMediaCard) {
  if (asset.task?.status === "failed") return "danger";
  if (asset.confirmed) return "success";
  return "warning";
}

function isGenerating(asset: CreativeMediaCard) {
  return asset.task?.status === "pending" || asset.task?.status === "running";
}

function generateDisabled(asset: CreativeMediaCard) {
  return props.busy || isGenerating(asset) || !props.modelValue || !asset.prompt.trim() || drafts[asset.nodeId] !== asset.prompt;
}

function generateHint(asset: CreativeMediaCard) {
  if (!props.modelValue) return "管理员暂未启用图片模型";
  if (drafts[asset.nodeId] !== asset.prompt) return "请先保存资产设定";
  if (isGenerating(asset)) return "资产图片正在生成";
  return "查看预计积分并确认生成";
}
</script>

<style scoped lang="scss">
.assetStage {
  display: grid;
  gap: 18px;

  .stageLoading { min-height: 320px; }
  .missingContent {
    display: grid;
    min-height: 320px;
    place-items: center;
    align-content: center;
    gap: 10px;
    color: var(--studioMuted);
    text-align: center;
    h3, p { margin: 0; }
    h3 { color: var(--studioText); }
  }
  .modelChoice {
    display: grid;
    max-width: 420px;
    gap: 7px;
    label { color: var(--studioText); font-size: 13px; font-weight: 650; }
  }
  .assetGroup { display: grid; gap: 10px; }
  .assetGroupHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--studioMuted);
    h3 { margin: 0; color: var(--studioText); font-size: 15px; }
    span { font-size: 12px; }
  }
  .assetGrid { display: grid; gap: 15px; }
  .assetCard {
    display: grid;
    grid-template-columns: minmax(280px, 34%) minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid var(--studioBorder);
    border-radius: 16px;
    background: var(--studioSurface);
  }
  .assetPreview {
    display: grid;
    min-height: 220px;
    place-items: center;
    background: var(--studioSurfaceMuted);
    color: var(--studioMuted);
    button {
      display: grid;
      width: 100%;
      height: 100%;
      min-height: 220px;
      padding: 8px;
      place-items: center;
      border: 0;
      background: transparent;
      cursor: zoom-in;
      img { display: block; width: 100%; max-height: 300px; object-fit: contain; }
      &:focus-visible { outline: 2px solid var(--studioAccent); outline-offset: -4px; }
    }
  }
  .assetBody {
    display: grid;
    align-content: start;
    gap: 14px;
    padding: 18px;
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; h3 { margin: 4px 0 0; color: var(--studioText); } }
    footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
    :deep(.el-textarea__inner) { border-radius: 12px; line-height: 1.65; }
  }
  .dialogPreviewImage { display: block; max-width: 100%; max-height: calc(100dvh - 180px); margin: 0 auto; object-fit: contain; }
}

@media (max-width: 720px) {
  .assetStage .assetCard {
    grid-template-columns: minmax(0, 1fr);
    .assetPreview { min-height: 180px; button { min-height: 180px; img { max-height: 280px; } } }
  }
}
</style>
