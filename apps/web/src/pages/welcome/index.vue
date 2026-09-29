<template>
  <main class="welcomePage">
    <header class="welcomeHeader">
      <router-link class="brand" to="/" aria-label="Minifeel 首页"><img :src="logoUrl" alt="" />Minifeel</router-link>
      <router-link class="loginLink" to="/login">登录</router-link>
    </header>
    <section class="welcomeHero" aria-labelledby="welcomeTitle">
      <p>AI 短剧创作</p>
      <h1 id="welcomeTitle">一个想法，开始你的短剧</h1>
      <form class="ideaBox" @submit.prevent="startCreation">
        <el-input
          v-model="idea"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 7 }"
          maxlength="4000"
          resize="none"
          aria-label="创作需求"
          placeholder="写下故事、角色或一个画面……"
          @keydown.ctrl.enter.prevent="startCreation"
          @keydown.meta.enter.prevent="startCreation" />
        <el-button nativeType="submit" type="primary" size="large" :loading="starting" :disabled="!idea.trim()" round>
          开始创作
          <icon-arrow-up-right :size="18" aria-hidden="true" />
        </el-button>
      </form>
      <p class="creationHint">登录后会保留这段创意，并自动继续创建。</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { IconArrowUpRight } from "@tabler/icons-vue";
import logoUrl from "@minifeel/assets/logo.svg";
import { savePendingIdea } from "@/lib/pendingIdea";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const auth = useAuthStore();
const idea = ref("");
const starting = ref(false);

async function startCreation() {
  const prompt = idea.value.trim();
  if (!prompt || starting.value) return;
  starting.value = true;
  savePendingIdea(prompt);
  try {
    await auth.load();
    if (!auth.user) return await router.push({ path: "/login", query: { redirect: "/app?create=1" } });
    await router.push(auth.user.role === "admin" ? "/admin/dashboard" : { path: "/app", query: { create: "1" } });
  } finally {
    starting.value = false;
  }
}
</script>

<style scoped lang="scss">
.welcomePage {
  min-height: 100svh;
  padding: 24px clamp(20px, 5vw, 72px);
  background: radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--el-color-primary) 13%, transparent), transparent 34%), var(--el-bg-color-page);

  .welcomeHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .brand { display: flex; align-items: center; gap: 9px; color: var(--el-text-color-primary); font-size: 20px; font-weight: 700; text-decoration: none; }
    .brand img { width: 32px; height: 32px; }
    .loginLink { color: var(--el-color-primary); text-decoration: none; }
  }

  .welcomeHero {
    display: flex;
    min-height: calc(100svh - 110px);
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;

    > p:first-child { margin: 0; color: var(--el-color-primary); font-size: 13px; font-weight: 700; letter-spacing: 2px; }
    h1 { margin: 16px 0 34px; font-size: clamp(38px, 7vw, 68px); line-height: 1.08; letter-spacing: -3px; }
    .creationHint { color: var(--el-text-color-secondary); font-size: 12px; }
  }

  .ideaBox {
    width: min(760px, 100%);
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--el-color-primary) 35%, var(--el-border-color));
    border-radius: 24px;
    background: var(--el-bg-color-overlay);
    box-shadow: 0 24px 70px color-mix(in srgb, var(--el-color-primary) 14%, transparent);
    text-align: right;

    :deep(.el-textarea__inner) { min-height: 100px !important; padding: 16px; border: 0; box-shadow: none; background: transparent; font-size: 17px; line-height: 1.7; }
    :deep(.el-button > span) { gap: 7px; }
  }
}

@media (max-width: 640px) {
  .welcomePage .welcomeHero h1 { letter-spacing: -1.6px; }
  .welcomePage .ideaBox .el-button { width: 100%; }
}
</style>
