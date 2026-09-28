<template>
  <header class="projectHeader">
    <div class="projectIdentity">
      <router-link class="backLink" to="/app" aria-label="返回创作首页">
        <icon-arrow-left :size="18" aria-hidden="true" />
      </router-link>
      <div>
        <p class="eyebrow">短剧项目</p>
        <h1>{{ projectName }}</h1>
        <p v-if="description">{{ description }}</p>
      </div>
    </div>
    <div class="modeActions" aria-label="创作模式">
      <span class="guidedMode"><icon-route :size="16" aria-hidden="true" />引导创作</span>
      <el-button round @click="emit('openAdvanced')">
        <icon-layout-dashboard :size="16" aria-hidden="true" />
        高级创作
      </el-button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { IconArrowLeft, IconLayoutDashboard, IconRoute } from "@tabler/icons-vue";

defineProps<{ projectName: string; description?: string }>();
const emit = defineEmits<{ openAdvanced: [] }>();
</script>

<style scoped lang="scss">
.projectHeader {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--studioBorder);

  .projectIdentity {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    min-width: 0;

    .backLink {
      display: grid;
      width: 40px;
      height: 40px;
      flex-shrink: 0;
      place-items: center;
      border: 1px solid var(--studioBorder);
      border-radius: 12px;
      background: var(--studioSurface);
      color: var(--studioText);
      text-decoration: none;
    }

    h1 {
      margin: 5px 0 6px;
      overflow: hidden;
      color: var(--studioText);
      font-size: clamp(22px, 3vw, 31px);
      letter-spacing: -0.7px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    p:last-child {
      max-width: 680px;
      margin: 0;
      overflow: hidden;
      color: var(--studioMuted);
      font-size: 13px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .modeActions {
    display: flex;
    align-items: center;
    gap: 9px;
    flex-shrink: 0;

    .guidedMode {
      display: flex;
      align-items: center;
      gap: 7px;
      min-height: 40px;
      padding: 0 14px;
      border-radius: 999px;
      background: var(--studioAccentSoft);
      color: var(--studioAccent);
      font-size: 13px;
      font-weight: 650;
    }

    :deep(.el-button > span) { gap: 7px; }
  }
}

@media (max-width: 720px) {
  .projectHeader {
    flex-direction: column;
    .modeActions { width: 100%; .guidedMode, .el-button { flex: 1; justify-content: center; } }
  }
}
</style>
