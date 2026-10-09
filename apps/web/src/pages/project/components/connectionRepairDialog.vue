<template>
  <el-dialog
    :modelValue="modelValue"
    title="补全资产连接"
    width="720px"
    destroyOnClose
    @update:modelValue="emit('update:modelValue', $event)">
    <p class="repairHint">
      旧项目的镜头可能还没有资产连接。下面按镜头列出建议，请逐项确认后再应用；应用只会新增缺失的连接，不会删除、重命名或重排高级画布建立的连线与节点。
    </p>

    <section v-for="gap in gaps" :key="gap.shotNodeId" class="repairGroup">
      <header class="repairGroupHeader">
        <h4>镜头 {{ gap.shotTitle }}</h4>
        <span>{{ additionCount(gap) ? `将新增 ${additionCount(gap)} 条连接` : "未选择资产" }}</span>
      </header>
      <el-select
        :modelValue="selections[gap.shotNodeId] ?? []"
        class="repairSelect"
        multiple
        collapseTags
        collapseTagsTooltip
        placeholder="选择本镜需要的资产"
        @update:modelValue="value => selections[gap.shotNodeId] = value">
        <el-option-group v-for="group in candidateGroups(gap)" :key="group.type" :label="assetTypeLabels[group.type]">
          <el-option v-for="asset in group.assets" :key="asset.nodeId" :label="asset.title" :value="asset.nodeId" />
        </el-option-group>
      </el-select>
      <p v-if="suggestedTitles(gap).length" class="repairSuggest">建议：{{ suggestedTitles(gap).join("、") }}（镜头提示词中提到）</p>
      <p v-else class="repairSuggest repairSuggestMuted">没有可自动判断的建议，请手动选择本镜需要的资产。</p>
    </section>

    <template #footer>
      <span class="repairSummary">共 {{ totalAdditions }} 条新增连接</span>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :disabled="busy || !totalAdditions" @click="applyRepair">应用补连</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { assetTypeLabels, type CreativeAssetType, type CreativeConnectionGap } from "../creativeViewAdapter";

const props = defineProps<{
  modelValue: boolean;
  gaps: CreativeConnectionGap[];
  busy: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  apply: [selections: Record<string, string[]>];
}>();

const assetTypes: CreativeAssetType[] = ["character", "scene", "prop", "style"];
const selections = reactive<Record<string, string[]>>({});

watch(() => props.modelValue, visible => {
  if (!visible) return;
  for (const key of Object.keys(selections)) delete selections[key];
  for (const gap of props.gaps) {
    selections[gap.shotNodeId] = gap.candidates.filter(candidate => candidate.suggested).map(candidate => candidate.nodeId);
  }
}, { immediate: true });

function candidateGroups(gap: CreativeConnectionGap) {
  return assetTypes.flatMap(type => {
    const assets = gap.candidates.filter(candidate => candidate.assetType === type);
    return assets.length ? [{ type, assets }] : [];
  });
}

function suggestedTitles(gap: CreativeConnectionGap) {
  return gap.candidates
    .filter(candidate => candidate.suggested)
    .map(candidate => `${assetTypeLabels[candidate.assetType]}·${candidate.title}`);
}

function additionCount(gap: CreativeConnectionGap) {
  const selected = selections[gap.shotNodeId] ?? [];
  return selected.filter(nodeId => !gap.currentNodeIds.includes(nodeId)).length;
}

const totalAdditions = computed(() => props.gaps.reduce((sum, gap) => sum + additionCount(gap), 0));

function applyRepair() {
  const payload: Record<string, string[]> = {};
  for (const gap of props.gaps) payload[gap.shotNodeId] = [...(selections[gap.shotNodeId] ?? [])];
  emit("apply", payload);
}
</script>

<style scoped lang="scss">
.repairHint {
  margin: 0 0 18px;
  color: var(--studioMuted);
  font-size: 13px;
  line-height: 1.7;
}

.repairGroup {
  display: grid;
  gap: 8px;
  padding: 14px 0;
  border-top: 1px solid var(--studioBorder);

  &:first-of-type { border-top: none; padding-top: 0; }
}

.repairGroupHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  h4 { margin: 0; font-size: 14px; }
  span { color: var(--studioMuted); font-size: 12px; }
}

.repairSelect { width: 100%; }

.repairSuggest {
  margin: 0;
  color: var(--studioAccent);
  font-size: 12px;
  line-height: 1.6;
}

.repairSuggestMuted { color: var(--studioMuted); }

.repairSummary {
  margin-right: auto;
  color: var(--studioMuted);
  font-size: 12px;
}
</style>
