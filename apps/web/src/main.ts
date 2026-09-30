import { createApp, h } from "vue";
import { ElButton, ElResult } from "element-plus";
import { createPinia } from "pinia";
import { createPersistedState } from "pinia-plugin-persistedstate";
import App from "./App.vue";
import "@/assets/main.scss";
import "element-plus/dist/index.css";

import router from "@/router";
import { setUnauthorizedHandler } from "@/lib/api";
import { settingsStorage } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";

if (typeof crypto.randomUUID !== "function") {
  // ACT: IP 地址使用 HTTP 时浏览器不提供 randomUUID，用同源随机数能力补齐现有调用链。
  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    value: () => {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const value = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
      return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
    },
  });
}

const app = createApp(App);
const pinia = createPinia().use(createPersistedState({ storage: settingsStorage }));
app.use(pinia);
app.use(router);
setUnauthorizedHandler(() => {
  useAuthStore().clear();
  const route = router.currentRoute.value;
  if (!route.matched.length || route.meta.public || route.path === "/login") return;
  void router.replace({ path: "/login", query: { redirect: route.fullPath } });
});

router.isReady().then(() => {
  app.mount("#app");
}).catch(async (error) => {
  console.error("页面初始化失败：", error);
  createApp({
    render: () => h(ElResult, {
      icon: "error",
      title: "启动失败",
      subTitle: error instanceof Error ? error.message : "无法加载应用，请重试。",
    }, {
      extra: () => h(ElButton, {
        type: "primary",
        onClick: () => window.location.reload(),
      }, () => "重试"),
    }),
  }).mount("#app");
});
