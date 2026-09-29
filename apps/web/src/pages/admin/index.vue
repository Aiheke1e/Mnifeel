<template>
  <div class="adminShell">
    <adminSidebar />
    <main class="adminContent">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import adminSidebar from "./components/adminSidebar.vue";
</script>

<style scoped lang="scss">
.adminShell {
  display: flex;
  min-height: 100dvh;
  background:
    radial-gradient(circle at 86% -10%, color-mix(in srgb, var(--studioAccent) 11%, transparent), transparent 32%),
    var(--studioBackground);

  .adminContent {
    width: calc(100% - 244px);
    min-width: 0;
    min-height: 100dvh;
  }
}

@media (max-width: 820px) {
  .adminShell {
    display: block;

    .adminContent {
      width: 100%;
      padding-bottom: calc(68px + env(safe-area-inset-bottom));
    }
  }
}
</style>
