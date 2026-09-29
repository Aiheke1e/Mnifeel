<template>
  <aside class="adminSidebar">
    <router-link class="brand" to="/admin/dashboard" aria-label="Minifeel 管理后台">
      <img :src="logoUrl" alt="" />
      <span><strong>Minifeel</strong><small>管理后台</small></span>
    </router-link>
    <nav class="navigation" aria-label="后台导航">
      <router-link v-for="item in navigation" :key="item.path" :to="item.path">
        <component :is="item.icon" :size="19" aria-hidden="true" />
        <span>{{ item.label }}</span>
      </router-link>
    </nav>
    <div class="sidebarFooter">
      <span class="adminAccount">{{ authStore.user?.phone || authStore.user?.email || "管理员" }}</span>
      <el-button text :icon="IconLogout" @click="logout">退出登录</el-button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import {
  IconActivity, IconAdjustments, IconCoins, IconDatabase,
  IconLogout, IconRobot, IconUsers,
} from "@tabler/icons-vue";
import logoUrl from "@minifeel/assets/logo.svg";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const authStore = useAuthStore();
const navigation = [
  { path: "/admin/dashboard", label: "数据总览", icon: IconActivity },
  { path: "/admin/users", label: "用户与积分", icon: IconUsers },
  { path: "/admin/providers", label: "供应商配置", icon: IconDatabase },
  { path: "/admin/models", label: "模型与计费", icon: IconRobot },
  { path: "/admin/tasks", label: "生成任务", icon: IconCoins },
  { path: "/admin/audit", label: "审计记录", icon: IconAdjustments },
];

async function logout() {
  await authStore.logout();
  await router.replace("/login");
}
</script>

<style scoped lang="scss">
.adminSidebar {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  width: 244px;
  height: 100dvh;
  padding: 22px 16px;
  border-right: 1px solid var(--el-border-color-lighter);
  background: color-mix(in srgb, var(--el-bg-color) 92%, transparent);
  backdrop-filter: blur(20px);

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 10px 22px;
    color: var(--el-text-color-primary);
    text-decoration: none;

    img { width: 34px; height: 34px; }
    span { display: flex; flex-direction: column; gap: 2px; }
    strong { font-size: 17px; }
    small { color: var(--el-text-color-secondary); }
  }

  .navigation {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 6px;

    a {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 11px 13px;
      border-radius: 10px;
      color: var(--el-text-color-regular);
      text-decoration: none;

      &:hover { background: var(--el-fill-color-light); }
      &.router-link-active { background: var(--el-color-primary-light-9); color: var(--el-color-primary); font-weight: 600; }
    }
  }

  .sidebarFooter {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px 8px 0;
    border-top: 1px solid var(--el-border-color-lighter);

    .adminAccount { overflow: hidden; color: var(--el-text-color-secondary); font-size: 12px; text-overflow: ellipsis; }
    .el-button { justify-content: flex-start; margin: 0; }
  }
}

@media (max-width: 820px) {
  .adminSidebar {
    position: fixed;
    z-index: 20;
    top: auto;
    bottom: 0;
    display: block;
    width: 100%;
    height: calc(68px + env(safe-area-inset-bottom));
    padding: 8px 10px env(safe-area-inset-bottom);
    border-top: 1px solid var(--el-border-color-lighter);
    border-right: 0;

    .brand, .sidebarFooter { display: none; }
    .navigation {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 2px;

      a { flex-direction: column; gap: 2px; padding: 6px 2px; font-size: 10px; }
    }
  }
}
</style>
