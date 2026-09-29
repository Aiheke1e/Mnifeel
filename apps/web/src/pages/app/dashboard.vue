<template>
  <div class="dashboardPage studioPage" :aria-busy="creating || loading">
    <section class="creationHero" aria-labelledby="creationTitle">
      <p class="eyebrow">AI 短剧创作</p>
      <h1 id="creationTitle">你想创作什么？</h1>
      <p>写下故事、角色或一个画面，剩下的交给创作助手。</p>

      <form class="creationBox" @submit.prevent="createFromIdea">
        <el-input
          ref="ideaInput"
          v-model="idea"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 7 }"
          maxlength="4000"
          resize="none"
          aria-label="创作需求"
          placeholder="例如：做一部治愈系短剧，一只橘猫每天清晨去叫醒独居老人，角色形象需要每集保持一致。"
          @keydown.ctrl.enter.prevent="createFromIdea"
          @keydown.meta.enter.prevent="createFromIdea" />
        <div class="creationActions">
          <span>生成的角色图片会自动保存到“我的资产”，可在后续每一集继续使用</span>
          <el-button nativeType="submit" type="primary" size="large" :loading="creating" :disabled="!idea.trim()" round>
            开始创作
            <icon-arrow-up-right :size="18" aria-hidden="true" />
          </el-button>
        </div>
      </form>

      <div class="ideaExamples" aria-label="创作示例">
        <span>试试：</span>
        <button v-for="example in examples" :key="example" type="button" @click="idea = example">{{ example }}</button>
      </div>
    </section>

    <el-alert v-if="errorMessage" class="pageAlert" :title="errorMessage" type="error" showIcon :closable="false" />

    <section class="contentSection" aria-labelledby="recentProjectsTitle">
      <div class="sectionHeading">
        <div>
          <p class="eyebrow">继续创作</p>
          <h2 id="recentProjectsTitle">我的项目</h2>
        </div>
        <router-link to="/app/projects/import">导入旧项目</router-link>
      </div>
      <div v-if="workspaceStore.projectList.length" class="projectGrid">
        <button v-for="project in workspaceStore.projectList.slice(0, 6)" :key="project.id" class="projectCard" type="button" @click="openProject(project)">
          <span class="projectCover"><icon-movie :size="27" aria-hidden="true" /></span>
          <span class="projectBody">
            <strong>{{ project.name }}</strong>
            <span>{{ project.description || "继续完善这个故事" }}</span>
            <small>{{ formatDate(project.updatedAt) }}</small>
          </span>
          <icon-chevron-right :size="18" aria-hidden="true" />
        </button>
      </div>
      <p v-else class="quietEmpty">输入上面的创作需求，建立你的第一个项目。</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElInput } from "element-plus";
import { IconArrowUpRight, IconChevronRight, IconMovie } from "@tabler/icons-vue";
import { apiErrorMessage } from "@/lib/api";
import { setProjectMode } from "@/lib/projectMode";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { modelChoices } from "@/stores/settings";
import { useUserAppStore } from "@/stores/userApp";
import { useWorkspaceStore, type Project } from "@/stores/workspace";
import { formatDate } from "./appFormat";

const route = useRoute();
const router = useRouter();
const workspaceStore = useWorkspaceStore();
const userAppStore = useUserAppStore();
const ideaInput = ref<InstanceType<typeof ElInput>>();
const idea = ref("");
const creating = ref(false);
const loading = ref(false);
const errorMessage = ref("");
const examples = [
  "都市悬疑：外卖员发现每个订单都来自同一个不存在的房间",
  "治愈萌宠：橘猫每天清晨叫醒独居老人，做成连续短剧",
  "古风爱情：失忆将军与女医师在边城重逢",
];

onMounted(async () => {
  loading.value = true;
  try {
    await Promise.all([workspaceStore.loadProjects(), userAppStore.loadAccount()]);
    if (route.query.create) await nextTick(() => ideaInput.value?.focus());
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "首页信息加载失败");
  } finally {
    loading.value = false;
  }
});

function projectName(prompt: string) {
  return prompt.split(/[。！？!?\n]/)[0]!.trim().replace(/^[：:，,\s]+|[：:，,\s]+$/g, "").slice(0, 32) || "未命名故事";
}

async function createFromIdea() {
  const prompt = idea.value.trim();
  if (!prompt || creating.value) return;
  creating.value = true;
  errorMessage.value = "";
  let projectId = "";
  try {
    const project = await workspaceStore.createProject(projectName(prompt), prompt, "freeStory");
    projectId = project.id;
    await useWorkspaceFiles(project.id).writeJson("画布1.json", {
      minifeelCanvas: true,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }, true);
    workspaceStore.pendingAgentMessage = {
      projectId: project.id,
      model: modelChoices.value[0]?.value ?? "",
      reasoningEffort: "",
      prompt: `/skill:workflow\n\n用户的创作需求：${prompt}\n\n直接在当前空画布开始创作，建立需要的剧本、角色、分镜和生成节点。生成角色参考图后，将它保存到“我的资产”供后续各集和镜头复用；再次生成同一角色时优先引用已有角色资产，保持脸部、发型、服装和主色一致。需要调用图片或视频模型前，先明确本次生成数量并让用户确认。`,
    };
    setProjectMode("advanced");
    await router.push(`/app/projects/${project.id}/advanced`);
  } catch (error) {
    if (projectId) await workspaceStore.removeProject(projectId).catch(() => undefined);
    errorMessage.value = apiErrorMessage(error, "项目创建失败，请稍后重试");
  } finally {
    creating.value = false;
  }
}

async function openProject(project: Project) {
  loading.value = true;
  errorMessage.value = "";
  try {
    await workspaceStore.openProject(project.id);
    setProjectMode("advanced");
    await router.push(`/app/projects/${project.id}/advanced`);
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "项目打开失败");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.dashboardPage {
  max-width: 1120px;

  .creationHero {
    display: flex;
    min-height: 56dvh;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;

    h1 {
      margin: 12px 0 10px;
      color: var(--studioText);
      font-size: clamp(38px, 7vw, 66px);
      line-height: 1.08;
      letter-spacing: -2.8px;
    }

    > p:not(.eyebrow) {
      margin: 0;
      color: var(--studioMuted);
      font-size: 16px;
    }

    .creationBox {
      width: min(760px, 100%);
      margin-top: 34px;
      padding: 10px 12px 12px;
      border: 1px solid color-mix(in srgb, var(--studioAccent) 28%, var(--studioBorder));
      border-radius: 24px;
      background: var(--studioSurface);
      box-shadow: 0 24px 70px color-mix(in srgb, var(--studioAccent) 14%, transparent);
      text-align: left;

      :deep(.el-textarea__inner) {
        min-height: 94px !important;
        padding: 16px 17px;
        border: 0;
        box-shadow: none;
        background: transparent;
        color: var(--studioText);
        font-size: 16px;
        line-height: 1.7;
      }

      .creationActions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding: 7px 6px 0 16px;

        > span { color: var(--studioMuted); font-size: 12px; line-height: 1.5; }
        :deep(.el-button > span) { gap: 7px; }
      }
    }

    .ideaExamples {
      display: flex;
      width: min(760px, 100%);
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 15px;
      color: var(--studioMuted);
      font-size: 12px;

      button {
        max-width: 210px;
        overflow: hidden;
        padding: 7px 11px;
        border: 1px solid var(--studioBorder);
        border-radius: 999px;
        background: color-mix(in srgb, var(--studioSurface) 72%, transparent);
        color: var(--studioMuted);
        font: inherit;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: pointer;
        &:hover { border-color: var(--studioAccent); color: var(--studioAccent); }
        &:focus-visible { outline: 2px solid var(--studioAccent); outline-offset: 2px; }
      }
    }
  }

  .contentSection { margin-top: 24px; }

  .projectGrid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;

    .projectCard {
      display: grid;
      grid-template-columns: 54px minmax(0, 1fr) auto;
      align-items: center;
      gap: 14px;
      padding: 14px;
      border: 1px solid var(--studioBorder);
      border-radius: 16px;
      background: var(--studioSurface);
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: 160ms ease;
      &:hover { border-color: color-mix(in srgb, var(--studioAccent) 40%, var(--studioBorder)); transform: translateY(-1px); }
      &:focus-visible { outline: 2px solid var(--studioAccent); outline-offset: 2px; }

      .projectCover {
        display: grid;
        width: 54px;
        height: 54px;
        place-items: center;
        border-radius: 14px;
        background: var(--studioAccentSoft);
        color: var(--studioAccent);
      }

      .projectBody {
        display: grid;
        gap: 4px;
        min-width: 0;
        strong, span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        strong { color: var(--studioText); }
        span, small { color: var(--studioMuted); }
        span { font-size: 12px; }
        small { font-size: 10px; }
      }
    }
  }
}

@media (max-width: 760px) {
  .dashboardPage {
    .creationHero {
      min-height: 64dvh;
      h1 { letter-spacing: -1.8px; }
      .creationBox .creationActions { align-items: stretch; flex-direction: column; padding-left: 6px; .el-button { width: 100%; } }
      .ideaExamples { justify-content: flex-start; button { max-width: 100%; } }
    }
    .projectGrid { grid-template-columns: 1fr; }
  }
}
</style>
