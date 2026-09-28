import { createRouter, createWebHashHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { loadSettings } from "@/stores/settings";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      redirect: "/login",
    },
    {
      path: "/login",
      component: () => import("@/pages/login/index.vue"),
      meta: { public: true },
    },
    {
      path: "/app",
      component: () => import("@/pages/home/index.vue"),
      meta: { role: "user" },
    },
    {
      path: "/app/workspace",
      component: () => import("@/pages/workspace/index.vue"),
      meta: { role: "user" },
    },
    {
      path: "/admin/dashboard",
      component: () => import("@/pages/home/index.vue"),
      meta: { role: "admin" },
    },
    {
      path: "/hello",
      redirect: "/login",
    },
    {
      path: "/home",
      redirect: "/app",
    },
    {
      path: "/canvas",
      redirect: "/app/workspace",
    },
    {
      path: "/workspace",
      redirect: "/app/workspace",
    },
  ],
});

router.beforeEach(async to => {
  const auth = useAuthStore();
  await auth.load();
  if (to.meta.public) {
    if (!auth.user) return true;
    return auth.user.role === "admin" ? "/admin/dashboard" : "/app";
  }
  if (!auth.user) return { path: "/login", query: { redirect: to.fullPath } };
  if (to.meta.role && to.meta.role !== auth.user.role) return auth.user.role === "admin" ? "/admin/dashboard" : "/app";
  await loadSettings();
  return true;
});

export default router;
