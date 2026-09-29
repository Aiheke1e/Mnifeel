<template>
  <div class="about">
    <div class="brandMark"><img class="brandLogo" :src="logoUrl" alt="Minifeel Logo" /></div>
    <div>
      <h3>Minifeel</h3>
      <p>版本 {{ currentVersion }}</p>
    </div>
    <el-alert title="本地 Web 版" description="账号、项目、积分和配置保存在本地 PostgreSQL 与数据目录中。模型服务由管理员在管理后台统一配置。" type="info" :closable="false" showIcon />
  </div>
</template>

<script setup lang="ts">
import logoUrl from "@minifeel/assets/logo.svg?url";

const currentVersion = import.meta.env.appVersion;
</script>

<style lang="scss" scoped>
.about {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 16px;

  .brandMark {
    display: grid;
    place-items: center;
    width: 60px;
    height: 60px;
    border-radius: calc(var(--ui-radius) * 1.5);
    background: var(--el-fill-color-light);

    .brandLogo { width: 42px; height: 42px; }
  }

  h3 { margin: 0; font-size: 20px; }
  p { margin: 6px 0 0; color: var(--el-text-color-secondary); }
  :deep(.el-alert) { grid-column: 1 / -1; }
}
</style>
