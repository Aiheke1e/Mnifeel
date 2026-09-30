<template>
  <aside class="appSidebar">
    <router-link class="brand" to="/app" aria-label="返回创作首页">
      <img :src="logoUrl" alt="" />
      <span>Minifeel</span>
    </router-link>
    <nav class="primaryNav" aria-label="创作端主导航">
      <span class="navLabel">创作空间</span>
      <router-link
        v-for="item in navItems"
        :key="item.path"
        class="navItem"
        :class="{ active: isActive(item.path) }"
        :to="item.path"
        :aria-current="isActive(item.path) ? 'page' : undefined">
        <span class="navIcon"><component :is="item.icon" :size="19" aria-hidden="true" /></span>
        <span class="navCopy">
          <strong>{{ item.label }}</strong>
          <small>{{ item.description }}</small>
        </span>
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
import { useRoute } from "vue-router";
import { IconHome, IconListCheck, IconPhoto, IconUserCircle } from "@tabler/icons-vue";
import logoUrl from "@minifeel/assets/logo.svg";
import { useAuthStore } from "@/stores/auth";
import { useUserAppStore } from "@/stores/userApp";

const authStore = useAuthStore();
const userAppStore = useUserAppStore();
const route = useRoute();
const navItems = [
  { path: "/app", label: "创作首页", description: "灵感与短剧项目", icon: IconHome },
  { path: "/app/assets", label: "我的资产", description: "角色、场景与道具", icon: IconPhoto },
  { path: "/app/tasks", label: "生成任务", description: "进度与消费记录", icon: IconListCheck },
  { path: "/app/account", label: "我的账户", description: "积分与登录安全", icon: IconUserCircle },
];
const identity = computed(() => authStore.user?.phone || authStore.user?.email || "创作者");
const userInitial = computed(() => identity.value.slice(0, 1).toUpperCase());

function isActive(path: string) {
  if (path === "/app") return route.path === "/app" || route.path.startsWith("/app/projects/");
  return route.path === path;
}
</script>

<style scoped lang="scss">
.appSidebar {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  width: 252px;
  height: 100dvh;
  padding: 24px 18px 18px;
  border-right: 1px solid var(--studioBorder);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--studioSurface) 96%, transparent), color-mix(in srgb, var(--studioAccentWash) 92%, transparent));
  backdrop-filter: blur(20px);

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    padding: 0 9px;
    color: var(--studioText);
    font-size: 18px;
    font-weight: 720;
    letter-spacing: -0.4px;
    text-decoration: none;

    img {
      width: 31px;
      height: 31px;

      .dark & { filter: invert(1); }
    }
  }

  .primaryNav {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 7px;
    margin-top: 30px;

    .navLabel {
      margin: 0 12px 4px;
      color: var(--studioMuted);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
    }

    .navItem {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 60px;
      padding: 8px 10px;
      border: 1px solid transparent;
      border-radius: 16px;
      color: var(--studioMuted);
      text-decoration: none;
      transition: 160ms ease;

      .navIcon {
        display: grid;
        width: 36px;
        height: 36px;
        flex-shrink: 0;
        place-items: center;
        border-radius: 12px;
        background: color-mix(in srgb, var(--studioSurfaceMuted) 76%, transparent);
      }

      .navCopy {
        display: grid;
        gap: 3px;
        min-width: 0;

        strong { color: inherit; font-size: 13px; font-weight: 650; }
        small { overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
      }

      &:hover {
        border-color: var(--studioBorder);
        background: color-mix(in srgb, var(--studioSurface) 78%, transparent);
        color: var(--studioText);
      }

      &.active {
        border-color: color-mix(in srgb, var(--studioAccent) 18%, var(--studioBorder));
        background: var(--studioSurface);
        color: var(--studioAccent);
        box-shadow: var(--studioShadowSoft);

        .navIcon { background: var(--studioAccentSoft); }
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
      padding: 15px;
      border: 1px solid var(--studioBorder);
      border-radius: 14px;
      background:
        radial-gradient(circle at 100% 0, color-mix(in srgb, var(--studioAccent) 18%, transparent), transparent 48%),
        var(--studioSurface);
      box-shadow: var(--studioShadowSoft);

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

      .navLabel { display: none; }

      .navItem {
        flex-direction: column;
        justify-content: center;
        gap: 2px;
        min-height: 52px;
        padding: 4px;
        border: 0;
        border-radius: 12px;

        .navIcon { width: 24px; height: 24px; background: transparent; }
        .navCopy { display: block; strong { font-size: 10px; } small { display: none; } }
        &.active { background: var(--studioAccentSoft); box-shadow: none; }
      }
    }
  }
}
</style>
