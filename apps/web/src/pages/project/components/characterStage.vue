<template>
  <section class="characterStage">
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" showIcon :closable="false" />
    <div v-else-if="loading" class="stageLoading" v-loading="true" aria-label="正在读取角色" />
    <div v-else-if="!characters.length" class="missingContent">
      <icon-users-minus :size="34" aria-hidden="true" />
      <h3>还没有符合规范的角色草稿</h3>
      <p>可以让导演助手根据剧本补齐角色设定。</p>
      <el-button type="primary" @click="emit('requestRepair')">让导演助手整理角色</el-button>
    </div>
    <template v-else>
      <div class="modelChoice">
        <label for="characterModel">角色图片模型</label>
        <el-select id="characterModel" :modelValue="modelValue" :loading="modelsLoading" placeholder="暂无可用模型" @update:modelValue="emit('update:modelValue', String($event))">
          <el-option v-for="model in models" :key="model.id" :label="model.displayName" :value="model.id" />
        </el-select>
      </div>
      <div class="characterGrid">
        <article v-for="character in characters" :key="character.nodeId" class="characterCard">
          <div class="characterPreview">
            <button
              v-if="previewUrls[character.nodeId]"
              type="button"
              :aria-label="`放大查看${character.title}角色参考图`"
              @click="openPreview(previewUrls[character.nodeId], `${character.title}角色参考图`)">
              <img :src="previewUrls[character.nodeId]" :alt="`${character.title} 角色参考图`" />
            </button>
            <icon-user-square v-else :size="44" aria-hidden="true" />
          </div>
          <div class="characterBody">
            <header>
              <div><p class="eyebrow">角色设定</p><h3>{{ character.title }}</h3></div>
              <el-tag :type="statusType(character)" effect="light" round>{{ statusText(character) }}</el-tag>
            </header>
            <el-input v-model="drafts[character.nodeId]" type="textarea" :autosize="{ minRows: 4, maxRows: 8 }" :disabled="busy" aria-label="角色生成提示词" />
            <footer>
              <el-button :disabled="busy || drafts[character.nodeId] === character.prompt" @click="emit('saveContent', character.nodeId, drafts[character.nodeId] || '', character.draftLabel)">保存设定</el-button>
              <el-button type="success" plain :disabled="busy || character.confirmed || drafts[character.nodeId] !== character.prompt" @click="emit('confirmContent', character.nodeId, character.confirmedLabel)">锁定角色</el-button>
              <el-button
                type="primary"
                :loading="isGenerating(character)"
                :disabled="generateDisabled(character)"
                :title="generateHint(character)"
                @click="emit('requestGenerate', character.nodeId)">
                {{ character.output ? "重新生成" : "确认生成" }}
              </el-button>
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
import { onBeforeUnmount, reactive, ref, watch } from "vue";
import { IconUsersMinus, IconUserSquare } from "@tabler/icons-vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { PublicModel } from "@/stores/userApp";
import type { CreativeMediaCard } from "../creativeViewAdapter";

const props = defineProps<{
  projectId: string;
  characters: CreativeMediaCard[];
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
const drafts = reactive<Record<string, string>>({});
const sourcePrompts = reactive<Record<string, string>>({});
const previewUrls = reactive<Record<string, string>>({});
const selectedPreviewUrl = ref("");
const selectedPreviewTitle = ref("");
let releases: Array<() => void> = [];
let previewVersion = 0;

watch(() => props.characters, characters => {
  const nodeIds = new Set(characters.map(character => character.nodeId));
  for (const nodeId of Object.keys(drafts)) {
    if (nodeIds.has(nodeId)) continue;
    delete drafts[nodeId];
    delete sourcePrompts[nodeId];
  }
  for (const character of characters) {
    const sourcePrompt = sourcePrompts[character.nodeId];
    const dirty = sourcePrompt !== undefined && drafts[character.nodeId] !== sourcePrompt;
    sourcePrompts[character.nodeId] = character.prompt;
    if (!dirty) drafts[character.nodeId] = character.prompt;
  }
}, { immediate: true });

watch(() => JSON.stringify([props.projectId, ...props.characters.map(character => [character.nodeId, character.output?.path ?? "", character.output?.mimeType ?? ""])]), async () => {
  const version = ++previewVersion;
  closePreview();
  releasePreviews();
  for (const key of Object.keys(previewUrls)) delete previewUrls[key];
  const files = useWorkspaceFiles(props.projectId);
  for (const character of props.characters) {
    if (!character.output) continue;
    const acquired = files.acquireUrl(character.output.path, character.output.mimeType);
    releases.push(acquired.release);
    try {
      const url = await acquired.url;
      if (version === previewVersion) previewUrls[character.nodeId] = url;
    } catch {
      if (version === previewVersion) previewUrls[character.nodeId] = "";
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

function statusText(character: CreativeMediaCard) {
  if (character.task?.status === "pending" || character.task?.status === "running") return "正在生成";
  if (character.task?.status === "failed") return "生成失败";
  if (character.output) return character.confirmed ? "已锁定" : "已有预览";
  return character.confirmed ? "已锁定" : "待确认";
}

function statusType(character: CreativeMediaCard) {
  if (character.task?.status === "failed") return "danger";
  if (character.confirmed) return "success";
  return "warning";
}

function isGenerating(character: CreativeMediaCard) {
  return character.task?.status === "pending" || character.task?.status === "running";
}

function generateDisabled(character: CreativeMediaCard) {
  return props.busy || isGenerating(character) || !props.modelValue || !character.prompt.trim() || drafts[character.nodeId] !== character.prompt;
}

function generateHint(character: CreativeMediaCard) {
  if (!props.modelValue) return "管理员暂未启用图片模型";
  if (drafts[character.nodeId] !== character.prompt) return "请先保存角色设定";
  if (isGenerating(character)) return "角色图片正在生成";
  return "查看预计积分并确认生成";
}
</script>

<style scoped lang="scss">
.characterStage {
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
  .characterGrid { display: grid; gap: 15px; }
  .characterCard {
    display: grid;
    grid-template-columns: minmax(280px, 34%) minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid var(--studioBorder);
    border-radius: 16px;
    background: var(--studioSurface);
  }
  .characterPreview {
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
  .characterBody {
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
  .characterStage .characterCard {
    grid-template-columns: minmax(0, 1fr);
    .characterPreview { min-height: 180px; button { min-height: 180px; img { max-height: 280px; } } }
  }
}
</style>
