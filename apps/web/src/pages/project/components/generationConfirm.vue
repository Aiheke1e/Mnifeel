<template>
  <el-dialog
    :modelValue="visible"
    width="520px"
    title="确认生成"
    :showClose="!loading"
    :closeOnClickModal="false"
    :closeOnPressEscape="!loading"
    @update:modelValue="close">
    <dl class="estimateList">
      <div><dt>生成内容</dt><dd>{{ generationType }}</dd></div>
      <div><dt>使用模型</dt><dd>{{ modelName }}</dd></div>
      <div><dt>生成数量</dt><dd>{{ count }} 个</dd></div>
      <div><dt>预计消耗</dt><dd>{{ estimatedCredits }} 积分</dd></div>
      <div><dt>当前余额</dt><dd>{{ availableCredits }} 积分</dd></div>
    </dl>
    <ul class="itemList">
      <li v-for="(item, index) in items" :key="`${item.label}-${index}`">
        <p class="itemTitle">{{ item.label }}</p>
        <p class="itemMeta">规格 {{ item.spec }}</p>
        <p class="itemMeta">引用资产 {{ item.assets }}</p>
        <p class="itemMeta">消耗 {{ item.credits }} 积分</p>
      </li>
    </ul>
    <p class="itemNote">确认后按以上镜头素材和规格执行；素材或价格变化需要重新确认。</p>
    <el-alert
      v-if="insufficientCredits > 0"
      :title="`积分不足，还需要 ${insufficientCredits} 积分`"
      type="error"
      showIcon
      :closable="false" />
    <template #footer>
      <el-button :disabled="loading" @click="emit('cancel')">取消</el-button>
      <el-button type="primary" :loading="loading" :disabled="insufficientCredits > 0" @click="emit('confirm')">确认生成</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from "vue";

export type GenerationConfirmItem = {
  label: string;
  spec: string;
  assets: string;
  credits: number;
};

const props = defineProps<{
  visible: boolean;
  modelName: string;
  generationType: string;
  count: number;
  items: GenerationConfirmItem[];
  estimatedCredits: number;
  availableCredits: number;
  loading: boolean;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const insufficientCredits = computed(() => Math.max(0, props.estimatedCredits - props.availableCredits));

function close(visible: boolean) {
  if (!visible && !props.loading) emit("cancel");
}
</script>

<style scoped lang="scss">
.estimateList {
  display: grid;
  gap: 12px;
  margin: 0 0 18px;

  div { display: flex; justify-content: space-between; gap: 20px; }
  dt { color: var(--studioMuted); }
  dd { margin: 0; color: var(--studioText); font-weight: 650; text-align: right; }
}

.itemList {
  display: grid;
  gap: 10px;
  max-height: 240px;
  margin: 0 0 10px;
  padding: 0;
  overflow: auto;
  list-style: none;

  li {
    padding: 10px 12px;
    border: 1px solid var(--studioBorder);
    border-radius: 10px;
    background: var(--studioSurfaceMuted);
  }
}

.itemTitle { margin: 0; font-weight: 650; color: var(--studioText); }
.itemMeta { margin: 2px 0 0; font-size: 12px; color: var(--studioMuted); }
.itemNote { margin: 0 0 16px; font-size: 12px; color: var(--studioMuted); }
</style>
