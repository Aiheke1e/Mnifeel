<template>
  <el-dialog
    :modelValue="visible"
    width="440px"
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

const props = defineProps<{
  visible: boolean;
  modelName: string;
  generationType: string;
  count: number;
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
</style>
