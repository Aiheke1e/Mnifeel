<template>
  <div class="projectCreatePage studioPage narrowPage">
    <header class="createHeader">
      <router-link class="backLink" to="/app"><icon-arrow-left :size="18" aria-hidden="true" />返回首页</router-link>
      <p class="eyebrow">新建短剧</p>
      <h1>先告诉我们，你想创作什么</h1>
      <p>只需要名称、创作描述和一个起点，其他内容可以进入项目后慢慢完善。</p>
    </header>

    <el-alert v-if="errorMessage" class="pageAlert" :title="errorMessage" type="error" showIcon :closable="false" />

    <form class="createForm" @submit.prevent="create">
      <section class="formSection panelCard" aria-labelledby="basicTitle">
        <div class="formHeading">
          <span>01</span>
          <div><h2 id="basicTitle">项目信息</h2><p>之后可以随时修改项目名称。</p></div>
        </div>
        <label class="fieldLabel" for="projectName">项目名称</label>
        <el-input id="projectName" v-model="form.name" maxlength="120" showWordLimit placeholder="例如：雨夜便利店" size="large" />
        <label class="fieldLabel" for="projectDescription">创作描述</label>
        <el-input
          id="projectDescription"
          v-model="form.description"
          type="textarea"
          :rows="5"
          maxlength="4000"
          showWordLimit
          resize="none"
          placeholder="用几句话描述人物、冲突、风格或你最想呈现的画面。" />
      </section>

      <section class="formSection panelCard" aria-labelledby="templateTitle">
        <div class="formHeading">
          <span>02</span>
          <div><h2 id="templateTitle">选择起点</h2><p>模板只影响创作提示，不会限制后续内容。</p></div>
        </div>
        <div class="templateChoices" role="radiogroup" aria-labelledby="templateTitle">
          <button
            v-for="item in projectTemplates"
            :key="item.id"
            type="button"
            role="radio"
            :aria-checked="form.templateId === item.id"
            @click="form.templateId = item.id">
            <span class="templateIcon" :style="{ '--templateAccent': item.accent }"><component :is="item.icon" :size="22" aria-hidden="true" /></span>
            <span class="templateText"><strong>{{ item.name }}</strong><small>{{ item.description }}</small></span>
            <icon-circle-check v-if="form.templateId === item.id" class="checkedIcon" :size="21" aria-hidden="true" />
          </button>
        </div>
      </section>

      <div class="formActions">
        <router-link class="textAction" to="/app">取消</router-link>
        <el-button nativeType="submit" type="primary" size="large" :loading="creating" :disabled="!form.name.trim()" round>
          创建并进入项目
          <icon-arrow-right :size="17" aria-hidden="true" />
        </el-button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconArrowLeft, IconArrowRight, IconCircleCheck } from "@tabler/icons-vue";
import { apiErrorMessage } from "@/lib/api";
import { setProjectMode } from "@/lib/projectMode";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { useWorkspaceStore } from "@/stores/workspace";
import { projectTemplates } from "./projectTemplates";

const route = useRoute();
const router = useRouter();
const workspaceStore = useWorkspaceStore();
const creating = ref(false);
const errorMessage = ref("");
const form = reactive({ name: "", description: "", templateId: "freeStory" });

onMounted(() => {
  const requested = typeof route.query.template === "string" ? route.query.template : "";
  if (projectTemplates.some(item => item.id === requested)) form.templateId = requested;
});

async function create() {
  const name = form.name.trim();
  if (!name || creating.value) return;
  creating.value = true;
  errorMessage.value = "";
  let projectId = "";
  try {
    const project = await workspaceStore.createProject(name, form.description.trim(), form.templateId);
    projectId = project.id;
    await useWorkspaceFiles(project.id).writeJson("画布1.json", {
      minifeelCanvas: true,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }, true);
    setProjectMode("guided");
    await router.push(`/app/projects/${project.id}`);
  } catch (error) {
    if (projectId) await workspaceStore.removeProject(projectId).catch(() => undefined);
    errorMessage.value = apiErrorMessage(error, "项目创建失败，请稍后重试");
  } finally {
    creating.value = false;
  }
}
</script>

<style scoped lang="scss">
.projectCreatePage {
  .createHeader {
    max-width: 690px;
    margin-bottom: 32px;
    .backLink { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 42px; color: var(--studioMuted); text-decoration: none; }
    h1 { margin: 8px 0 12px; color: var(--studioText); font-size: clamp(30px, 5vw, 46px); line-height: 1.15; letter-spacing: -1.6px; }
    > p:last-child { margin: 0; color: var(--studioMuted); line-height: 1.7; }
  }

  .createForm {
    display: grid;
    gap: 18px;

    .formSection {
      display: grid;
      gap: 12px;

      .formHeading {
        display: flex;
        align-items: flex-start;
        gap: 13px;
        margin-bottom: 8px;
        > span { display: grid; width: 31px; height: 31px; flex-shrink: 0; place-items: center; border-radius: 10px; background: var(--studioAccentSoft); color: var(--studioAccent); font-size: 11px; font-weight: 700; }
        h2 { margin: 1px 0 4px; font-size: 17px; }
        p { margin: 0; color: var(--studioMuted); font-size: 12px; }
      }

      .fieldLabel { margin-top: 8px; color: var(--studioText); font-size: 13px; font-weight: 600; }
      :deep(.el-input__wrapper), :deep(.el-textarea__inner) { border-radius: 12px; }
    }

    .templateChoices {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;

      button {
        position: relative;
        display: flex;
        min-height: 160px;
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
        padding: 18px;
        border: 1px solid var(--studioBorder);
        border-radius: 15px;
        background: var(--studioSurface);
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;

        &[aria-checked="true"] { border-color: var(--studioAccent); box-shadow: inset 0 0 0 1px var(--studioAccent); }
        &:focus-visible { outline: 2px solid var(--studioAccent); outline-offset: 2px; }

        .templateIcon { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 12px; background: color-mix(in srgb, var(--templateAccent) 13%, transparent); color: var(--templateAccent); }
        .templateText { display: grid; gap: 7px; strong { color: var(--studioText); } small { color: var(--studioMuted); font-size: 12px; line-height: 1.55; } }
        .checkedIcon { position: absolute; top: 16px; right: 16px; color: var(--studioAccent); }
      }
    }

    .formActions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 18px;
      padding: 8px 0 30px;
      .textAction { color: var(--studioMuted); text-decoration: none; }
      :deep(.el-button > span) { gap: 8px; }
    }
  }
}

@media (max-width: 680px) {
  .projectCreatePage .createForm .templateChoices { grid-template-columns: 1fr; button { min-height: 0; } }
}
</style>
