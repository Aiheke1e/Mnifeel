<template>
  <div class="appShell">
    <appSidebar />
    <main class="appContent">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import appSidebar from "./components/appSidebar.vue";
import { useUserAppStore } from "@/stores/userApp";

const userAppStore = useUserAppStore();
onMounted(() => {
  if (!userAppStore.accountLoaded) void userAppStore.loadAccount();
});
</script>

<style scoped lang="scss">
.appShell {
  display: flex;
  min-height: 100dvh;
  background:
    radial-gradient(circle at 82% -8%, color-mix(in srgb, var(--studioAccent) 12%, transparent), transparent 32%),
    var(--studioBackground);

  .appContent {
    width: calc(100% - 236px);
    min-width: 0;
    min-height: 100dvh;
  }
}

@media (max-width: 760px) {
  .appShell .appContent {
    width: 100%;
    padding-bottom: calc(68px + env(safe-area-inset-bottom));
  }
}
</style>
