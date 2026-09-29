<template>
  <aside class="appSidebar">
    <router-link class="brand" to="/app" aria-label="返回创作首页">
      <img :src="logoUrl" alt="" />
      <span>Minifeel</span>
    </router-link>
    <nav class="primaryNav" aria-label="创作端主导航">
      <router-link v-for="item in navItems" :key="item.path" class="navItem" :to="item.path" :aria-label="item.label">
        <component :is="item.icon" :size="20" aria-hidden="true" />
        <span>{{ item.label }}</span>
      </router-link>
    </nav>
    <div class="sidebarFooter">
      <div class="creditSummary" aria-label="积分余额">
        <span class="creditLabel">可用积分</span>
        <strong>{{ userAppStore.accountLoaded ? userAppStore.availableCredits.toLocaleString() : "—" }}</strong>
      </div>
      <div class="userSummary">
        <span class="userAvatar">{{ userInitial }}</span>
        <span class="userIdentity" :title="identity">{{ identity }}</span>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconHome, IconListCheck, IconPhoto, IconUserCircle } from "@tabler/icons-vue";
import logoUrl from "@minifeel/assets/logo.svg";
import { useAuthStore } from "@/stores/auth";
import { useUserAppStore } from "@/stores/userApp";

const authStore = useAuthStore();
const userAppStore = useUserAppStore();
const navItems = [
  { path: "/app", label: "创作首页", icon: IconHome },
  { path: "/app/assets", label: "我的资产", icon: IconPhoto },
  { path: "/app/tasks", label: "生成任务", icon: IconListCheck },
  { path: "/app/account", label: "我的账户", icon: IconUserCircle },
];
const identity = computed(() => authStore.user?.phone || authStore.user?.email || "创作者");
const userInitial = computed(() => identity.value.slice(0, 1).toUpperCase());
</script>

<style scoped lang="scss">
.appSidebar {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  width: 236px;
  height: 100dvh;
  padding: 24px 16px 18px;
  border-right: 1px solid var(--studioBorder);
  background: color-mix(in srgb, var(--studioSurface) 92%, transparent);
  backdrop-filter: blur(20px);

  .brand {
    display: flex;
    align-items: center;
    gap: 11px;
    min-height: 44px;
    padding: 0 10px;
    color: var(--studioText);
    font-size: 18px;
    font-weight: 720;
    letter-spacing: -0.4px;
    text-decoration: none;

    img {
      width: 29px;
      height: 29px;

      .dark & { filter: invert(1); }
    }
  }

  .primaryNav {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 5px;
    margin-top: 34px;

    .navItem {
      display: flex;
      align-items: center;
      gap: 11px;
      min-height: 44px;
      padding: 0 13px;
      border-radius: 12px;
      color: var(--studioMuted);
      font-size: 14px;
      font-weight: 560;
      text-decoration: none;
      transition: 160ms ease;

      &:hover {
        background: var(--studioSurfaceMuted);
        color: var(--studioText);
      }

      &.router-link-exact-active {
        background: var(--studioAccentSoft);
        color: var(--studioAccent);
      }

      &:focus-visible {
        outline: 2px solid var(--studioAccent);
        outline-offset: 2px;
      }
    }
  }

  .sidebarFooter {
    display: grid;
    gap: 12px;

    .creditSummary {
      display: flex;
      align-items: end;
      justify-content: space-between;
      padding: 14px;
      border: 1px solid var(--studioBorder);
      border-radius: 14px;
      background: var(--studioSurfaceMuted);

      .creditLabel { color: var(--studioMuted); font-size: 12px; }
      strong { color: var(--studioText); font-size: 17px; }
    }

    .userSummary {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      padding: 4px 8px;

      .userAvatar {
        display: grid;
        width: 30px;
        height: 30px;
        flex-shrink: 0;
        place-items: center;
        border-radius: 50%;
        background: linear-gradient(145deg, var(--studioAccent), #8b5cf6);
        color: white;
        font-size: 12px;
        font-weight: 700;
      }

      .userIdentity {
        min-width: 0;
        overflow: hidden;
        color: var(--studioMuted);
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }
}

@media (max-width: 760px) {
  .appSidebar {
    position: fixed;
    inset: auto 0 0;
    z-index: 20;
    width: auto;
    height: 68px;
    padding: 6px max(10px, env(safe-area-inset-right)) calc(6px + env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
    border-top: 1px solid var(--studioBorder);
    border-right: 0;

    .brand,
    .sidebarFooter { display: none; }

    .primaryNav {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      margin: 0;

      .navItem {
        flex-direction: column;
        justify-content: center;
        gap: 2px;
        min-height: 52px;
        padding: 4px;
        font-size: 11px;
      }
    }
  }
}
</style>
