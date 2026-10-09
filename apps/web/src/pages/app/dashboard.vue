<template>
  <div class="dashboardPage studioPage" :aria-busy="creating || loading">
    <section class="creationHero" aria-labelledby="creationTitle">
      <p class="eyebrow"><icon-sparkles :size="13" aria-hidden="true" /> AI 短剧创作</p>
      <h1 id="creationTitle">你想创作什么?</h1>
      <p class="heroSub">写下故事、角色或一个画面，导演助手会陪你逐步完成剧本、角色、分镜和成片。</p>

      <form class="creationBox" @submit.prevent="createFromIdea">
        <el-input
          ref="ideaInput"
          v-model="idea"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 7 }"
          maxlength="4000"
          resize="none"
          aria-label="创作需求"
          placeholder="例如：一位坐遍全城宵摊的失踪侦探，一只提着手电筒漫无目的地巡逻的橘猫，角色形象需要每集保持一致。"
          @keydown.ctrl.enter.prevent="createFromIdea"
          @keydown.meta.enter.prevent="createFromIdea" />
        <div class="creationActions">
          <span>每轮草案最多收取一次文字模型费用；图片和视频确认预计积分后再生成</span>
          <el-button class="creationSubmit" nativeType="submit" size="large" :loading="creating" :disabled="!idea.trim()" round>
            开始创作
            <icon-arrow-up-right :size="18" aria-hidden="true" />
          </el-button>
        </div>
      </form>

      <ol class="creationSteps" aria-label="创作流程">
        <li><strong>1</strong><span>新建剧本</span></li>
        <li><strong>2</strong><span>角色资产</span></li>
        <li><strong>3</strong><span>镜头分镜</span></li>
        <li><strong>4</strong><span>成片生成</span></li>
      </ol>

      <div class="ideaExamples" aria-label="创作示例">
        <span>试试：</span>
        <button v-for="example in examples" :key="example" type="button" @click="idea = example">{{ example }}</button>
      </div>
    </section>

    <el-alert v-if="errorMessage" class="pageAlert" :title="errorMessage" type="error" showIcon :closable="false" />

    <section class="contentSection" aria-labelledby="recentProjectsTitle">
      <div class="sectionHeading">
        <div>
          <p class="eyebrow">创作首页</p>
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
import { IconArrowUpRight, IconChevronRight, IconMovie, IconSparkles } from "@tabler/icons-vue";
import { apiErrorMessage } from "@/lib/api";
import { clearPendingIdea, readPendingIdea, savePendingIdea } from "@/lib/pendingIdea";
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
    const pendingIdea = readPendingIdea();
    if (pendingIdea) {
      idea.value = pendingIdea;
      await createFromIdea();
    } else if (route.query.create) await nextTick(() => ideaInput.value?.focus());
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "首页信息加载失败");
  } finally {
    loading.value = false;
  }
});

function projectName(prompt: string) {
  return prompt.split(/[。！？!?\n]/)[0]!.trim().replace(/^[：:，,\s]+|[：:，,\s]+$/g, "").slice(0, 16) || "未命名故事";
}

async function createFromIdea() {
  const prompt = idea.value.trim();
  if (!prompt || creating.value) return;
  creating.value = true;
  errorMessage.value = "";
  let projectId = "";
  try {
    clearPendingIdea();
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
      displayPrompt: prompt,
      prompt: `/skill:workflow\n\n用户的创作需求：${prompt}\n\n直接在当前空画布建立一份可编辑的短剧草稿。首轮只生成文字草稿，不调用图片或视频生成。剧本使用文本节点并命名为 Minifeel/剧本；按故事实际需要建立角色、场景、道具和风格的图片生成节点，分别命名为 Minifeel/角色/<名称>、Minifeel/场景/<名称>、Minifeel/道具/<名称>、Minifeel/风格/<名称>，只填写提示词；每个镜头建立图片生成节点并按顺序命名为 Minifeel/分镜/001、002……，只填写提示词。仅将与该镜头直接相关的资产图片输出连接到对应分镜节点的 in 输入，并保留连接顺序；不要把全部资产连接到每个镜头。完成后整理画布并停止，等待用户确认。不要创建第二份状态文件，也不要直接修改画布 JSON。首轮使用尽可能少的模型调用，不要一次询问交付范围、总时长、画幅、视觉风格和模型；能从创意合理推断的先形成草案。剧本中注明自然时长；进入视频制作前必须按实时读取到的模型时长限制给出分段数量和预计积分，再等待用户确认。不得展示未从 listMediaModels 或节点 getConfig 实时读取的模型选项。只有用户明确要求进入媒体生成时，才读取真实可用模型，提出一个最小可行方案，并一次说明生成数量、实际模型、规格、参考资产和算力消耗等待确认。`,
    };
    setProjectMode("guided");
    await router.push(`/app/projects/${project.id}`);
  } catch (error) {
    savePendingIdea(prompt);
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
    setProjectMode("guided");
    await router.push(`/app/projects/${project.id}`);
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "项目打开失败");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.dashboardPage {
  .creationHero {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: clamp(36px, 5vw, 72px) 20px 0;
    text-align: center;

    .eyebrow { justify-content: center; color: var(--studioAccent); }

    h1 {
      margin: 14px 0 10px;
      color: var(--studioText);
      font-size: clamp(38px, 4.6vw, 56px);
      line-height: 1.05;
      letter-spacing: -2.8px;
    }

    .heroSub {
      max-width: 640px;
      margin: 0;
      color: var(--studioMuted);
      font-size: 14px;
      line-height: 1.7;
    }

    .creationBox {
      width: min(920px, 100%);
      min-width: 0;
      margin-top: 34px;
      padding: 18px 20px 14px;
      border: 1px solid var(--studioBorder);
      border-radius: 18px;
      background: var(--studioSurface);
      box-shadow: var(--studioShadowSoft);
      text-align: left;

      :deep(.el-textarea__inner) {
        min-height: 118px !important;
        padding: 12px 6px;
        border: none;
        border-radius: 0;
        box-shadow: none;
        background: transparent;
        color: var(--studioText);
        font-size: 15px;
        line-height: 1.7;

        &:focus { border: none; }
      }

      .creationActions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 8px 0 2px;

        > span { max-width: 380px; color: var(--studioMuted); font-size: 10px; line-height: 1.5; text-align: left; }

        :deep(.el-button.creationSubmit) {
          border: 1px solid color-mix(in srgb, var(--studioAccent) 26%, var(--studioBorder));
          background: var(--studioAccentSoft);
          color: var(--studioAccent);
          font-weight: 650;

          &:hover, &:focus-visible {
            border-color: color-mix(in srgb, var(--studioAccent) 45%, var(--studioBorder));
            background: color-mix(in srgb, var(--studioAccent) 18%, var(--studioSurface));
            color: var(--studioAccent);
          }
        }
      }
    }

    .creationSteps {
      display: flex;
      align-items: center;
      gap: 0;
      width: min(680px, 100%);
      margin: 28px 0 0;
      padding: 0;
      color: var(--studioMuted);
      font-size: 11px;
      list-style: none;

      li {
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        gap: 7px;
        white-space: nowrap;

        &:not(:last-child)::after {
          width: 100%;
          height: 1px;
          margin: 0 10px;
          background: color-mix(in srgb, var(--studioAccent) 22%, var(--studioBorder));
          content: "";
        }
      }

      strong { display: grid; width: 22px; height: 22px; flex-shrink: 0; place-items: center; border-radius: 50%; background: var(--studioAccentSoft); color: var(--studioAccent); }
    }

    .ideaExamples {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-top: 24px;
      color: var(--studioMuted);
      font-size: 12px;

      button {
        max-width: 320px;
        overflow: hidden;
        padding: 8px 14px;
        border: 1px solid var(--studioBorder);
        border-radius: 999px;
        background: var(--studioSurface);
        color: var(--studioMuted);
        font: inherit;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: pointer;
        transition: 160ms ease;

        &:hover { border-color: color-mix(in srgb, var(--studioAccent) 40%, var(--studioBorder)); background: var(--studioAccentWash); color: var(--studioAccent); }
        &:focus-visible { outline: 2px solid var(--studioAccent); outline-offset: 2px; }
      }
    }
  }

  .contentSection {
    width: 100%;
    max-width: 1120px;
    margin: 38px auto 0;
    padding: 0 24px;
    box-sizing: border-box;
  }


  .projectGrid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;

    .projectCard {
      display: grid;
      grid-template-columns: 62px minmax(0, 1fr) auto;
      align-items: center;
      gap: 14px;
      min-height: 96px;
      padding: 16px;
      border: 1px solid var(--studioBorder);
      border-radius: 18px;
      background: var(--studioSurface);
      box-shadow: var(--studioShadowSoft);
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: 160ms ease;
      &:hover { border-color: color-mix(in srgb, var(--studioAccent) 40%, var(--studioBorder)); box-shadow: var(--studioShadow); transform: translateY(-2px); }
      &:focus-visible { outline: 2px solid var(--studioAccent); outline-offset: 2px; }

      .projectCover {
        display: grid;
        width: 62px;
        height: 62px;
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

@media (max-width: 1280px) {
  .dashboardPage {
    .projectGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
}

@media (max-width: 760px) {
  .dashboardPage {
    .creationHero {
      padding: 26px 16px 0;

      h1 { font-size: clamp(32px, 11vw, 44px); letter-spacing: -2px; }
      .creationSteps li:not(:last-child)::after { margin-inline: 5px; }
      .creationSteps li span { display: none; }
      .creationBox .creationActions { align-items: stretch; flex-direction: column; .el-button { width: 100%; } }
    }
    .projectGrid { grid-template-columns: 1fr; }
  }
}
</style>
