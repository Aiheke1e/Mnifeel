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
