<template>
  <div class="projectRuntime" inert aria-hidden="true">
    <canvasHost ref="canvasRef" :active="true" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import canvasHost from "@/pages/workspace/panels/canvas/canvasHost.vue";

const canvasRef = ref<InstanceType<typeof canvasHost>>();
const canvasReady = computed(() => canvasRef.value?.canvasReady ?? false);

defineExpose({
  canvasReady,
  getCanvasContext: () => canvasRef.value?.getCanvasContext(),
  flushSave: () => canvasRef.value?.flushSave() ?? Promise.resolve(),
  cancelSave: () => canvasRef.value?.cancelSave(),
  get saveBusy() { return canvasRef.value?.saveBusy ?? false; },
});
</script>

<style scoped lang="scss">
.projectRuntime {
  position: fixed;
  top: 0;
  left: -10000px;
  width: 1280px;
  height: 720px;
  overflow: hidden;
  pointer-events: none;
}
</style>
