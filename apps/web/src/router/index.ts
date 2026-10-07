import { createRouter, createWebHashHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { loadSettings } from "@/stores/settings";

const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { left: 0, top: 0 };
  },
  routes: [
    {
      path: "/",
      component: () => import("@/pages/welcome/index.vue"),
      meta: { public: true },
    },
    {
      path: "/login",
      component: () => import("@/pages/login/index.vue"),
      meta: { public: true, guestOnly: true },
    },
    {
      path: "/app",
      component: () => import("@/pages/app/index.vue"),
      meta: { role: "user" },
      children: [
        { path: "", component: () => import("@/pages/app/dashboard.vue") },
        { path: "projects", component: () => import("@/pages/app/myProjects.vue") },
        { path: "assets", component: () => import("@/pages/app/assets.vue") },
        { path: "tasks", component: () => import("@/pages/app/tasks.vue") },
        { path: "account", component: () => import("@/pages/app/account.vue") },
        { path: "projects/new", redirect: { path: "/app", query: { create: "1" } } },
        { path: "projects/import", component: () => import("@/pages/app/legacyImport.vue") },
        { path: "projects/:projectId", component: () => import("@/pages/project/index.vue") },
      ],
    },
    {
      path: "/app/projects/:projectId/advanced",
      component: () => import("@/pages/workspace/index.vue"),
      meta: { role: "user" },
    },
    {
      path: "/admin",
      component: () => import("@/pages/admin/index.vue"),
      meta: { role: "admin" },
      children: [
        { path: "", redirect: "/admin/dashboard" },
        { path: "dashboard", component: () => import("@/pages/admin/dashboard.vue") },
        { path: "users", component: () => import("@/pages/admin/users.vue") },
        { path: "providers", component: () => import("@/pages/admin/providers.vue") },
        { path: "models", component: () => import("@/pages/admin/models.vue") },
        { path: "tasks", component: () => import("@/pages/admin/tasks.vue") },
        { path: "audit", component: () => import("@/pages/admin/audit.vue") },
      ],
    },
    {
      path: "/admin/projects/:projectId/advanced",
      component: () => import("@/pages/workspace/index.vue"),
      meta: { role: "admin" },
    },
    {
      path: "/hello",
      redirect: "/",
    },
    {
      path: "/home",
      redirect: "/app",
    },
    {
      path: "/canvas",
      redirect: "/app",
    },
    {
      path: "/workspace",
      redirect: "/app",
    },
    {
      path: "/app/workspace",
      redirect: "/app",
    },
  ],
});

router.beforeEach(async to => {
  const auth = useAuthStore();
  await auth.load();
  if (to.meta.public) {
    if (!auth.user || !to.meta.guestOnly) return true;
    return auth.user.role === "admin" ? "/admin/dashboard" : "/app";
  }
  if (!auth.user) return { path: "/login", query: { redirect: to.fullPath } };
  if (to.meta.role && to.meta.role !== auth.user.role) return auth.user.role === "admin" ? "/admin/dashboard" : "/app";
  await loadSettings(auth.user.role);
  return true;
});

export default router;
