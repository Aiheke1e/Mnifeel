<template>
  <section class="scriptStage">
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" showIcon :closable="false" />
    <div v-else-if="loading" class="stageLoading" v-loading="true" aria-label="正在读取剧本" />
    <div v-else-if="!script" class="missingContent">
      <icon-file-alert :size="34" aria-hidden="true" />
      <h3>还没有找到剧本草稿</h3>
      <p>导演助手可以按创作规范重新整理现有内容，不会删除旧画布节点。</p>
      <el-button type="primary" @click="emit('requestRepair')">让导演助手重新整理剧本</el-button>
    </div>
    <template v-else>
      <header class="stageToolbar">
        <div>
          <el-tag :type="script.confirmed ? 'success' : 'warning'" effect="light" round>{{ script.confirmed ? "已确认" : "待确认" }}</el-tag>
          <span>直接修改内容，保存后高级画布会同步更新。</span>
        </div>
        <div class="stageActions">
          <el-button :disabled="busy || !changed" @click="save">保存修改</el-button>
          <el-button type="primary" :disabled="busy || script.confirmed || changed" @click="emit('confirmContent', script.nodeId, script.confirmedLabel)">确认剧本</el-button>
        </div>
      </header>
      <el-input v-model="draft" class="scriptEditor" type="textarea" :autosize="{ minRows: 16, maxRows: 30 }" :disabled="busy" aria-label="剧本内容" />
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconFileAlert } from "@tabler/icons-vue";
import type { CreativeScript } from "../creativeViewAdapter";

const props = defineProps<{
  script?: CreativeScript;
  loading: boolean;
  errorMessage: string;
  busy: boolean;
}>();
const emit = defineEmits<{
  saveContent: [nodeId: string, text: string, draftLabel: string];
  confirmContent: [nodeId: string, confirmedLabel: string];
  requestRepair: [];
}>();
const draft = ref("");
const sourceNodeId = ref("");
const sourceText = ref("");
const changed = computed(() => !!props.script && draft.value !== props.script.text);

watch(() => props.script, value => {
  const nodeId = value?.nodeId ?? "";
  const text = value?.text ?? "";
  const dirty = nodeId === sourceNodeId.value && draft.value !== sourceText.value;
  sourceNodeId.value = nodeId;
  sourceText.value = text;
  if (!dirty) draft.value = text;
}, { immediate: true });

function save() {
  if (props.script && changed.value) emit("saveContent", props.script.nodeId, draft.value, props.script.draftLabel);
}
</script>

<style scoped lang="scss">
.scriptStage {
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
    p { max-width: 430px; line-height: 1.6; }
  }
  .stageToolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    > div { display: flex; align-items: center; gap: 10px; }
    span { color: var(--studioMuted); font-size: 12px; }
  }
  .scriptEditor :deep(.el-textarea__inner) {
    padding: 18px;
    border-radius: 14px;
    background: var(--studioSurfaceMuted);
    color: var(--studioText);
    font-size: 14px;
    line-height: 1.8;
  }
}

@media (max-width: 720px) {
  .scriptStage .stageToolbar { align-items: stretch; flex-direction: column; .stageActions { justify-content: flex-end; } }
}
</style>
