<template>
  <div class="dashboardPage studioPage" :aria-busy="loading">
    <header class="pageTopbar">
      <div>
        <p class="eyebrow">创作中心</p>
        <h1>{{ greeting }}，准备好讲一个新故事了吗？</h1>
        <p>从一句灵感开始，按步骤完成短剧创作。</p>
      </div>
      <router-link class="primaryAction" to="/app/projects/new">
        <icon-plus :size="18" aria-hidden="true" />
        开始创作
      </router-link>
    </header>

    <el-alert v-if="errorMessage" class="pageAlert" :title="errorMessage" type="error" showIcon :closable="false" />

    <section class="summaryGrid" aria-label="创作概览">
      <article class="summaryCard accentCard">
        <span>可用积分</span>
        <strong>{{ userAppStore.availableCredits.toLocaleString() }}</strong>
        <small v-if="userAppStore.frozenCredits">另有 {{ userAppStore.frozenCredits }} 积分正在使用</small>
        <small v-else>用于文本与图片生成</small>
      </article>
      <article class="summaryCard">
        <span>我的项目</span>
        <strong>{{ workspaceStore.projectList.length }}</strong>
        <small>最近更新 {{ latestProjectTime }}</small>
      </article>
      <article class="summaryCard">
        <span>进行中的任务</span>
        <strong>{{ userAppStore.activeTaskCount }}</strong>
        <small>{{ userAppStore.activeTaskCount ? "完成后会自动保存" : "当前没有等待任务" }}</small>
      </article>
    </section>

    <section class="contentSection" aria-labelledby="recentProjectsTitle">
      <div class="sectionHeading">
        <div>
          <p class="eyebrow">继续创作</p>
          <h2 id="recentProjectsTitle">最近项目</h2>
        </div>
        <router-link v-if="workspaceStore.projectList.length" to="/app/projects/new">新建项目</router-link>
      </div>
      <div v-if="workspaceStore.projectList.length" class="projectGrid">
        <button v-for="project in workspaceStore.projectList.slice(0, 4)" :key="project.id" class="projectCard" type="button" @click="openProject(project)">
          <span class="projectCover"><icon-movie :size="30" aria-hidden="true" /></span>
          <span class="projectBody">
            <strong>{{ project.name }}</strong>
            <span>{{ project.description || "尚未填写创作描述" }}</span>
            <small>更新于 {{ formatDate(project.updatedAt) }}</small>
          </span>
          <icon-chevron-right :size="18" aria-hidden="true" />
        </button>
      </div>
      <div v-else class="emptyPanel">
        <icon-movie :size="34" aria-hidden="true" />
        <h3>还没有短剧项目</h3>
        <p>选择一个模板，几分钟内开始你的第一个故事。</p>
        <router-link class="secondaryAction" to="/app/projects/new">创建第一个项目</router-link>
      </div>
    </section>

    <section class="contentSection" aria-labelledby="templatesTitle">
      <div class="sectionHeading">
        <div>
          <p class="eyebrow">快速开始</p>
          <h2 id="templatesTitle">内置模板</h2>
        </div>
      </div>
      <div class="templateGrid">
        <router-link v-for="item in projectTemplates" :key="item.id" class="templateCard" :to="{ path: '/app/projects/new', query: { template: item.id } }">
          <span class="templateIcon" :style="{ '--templateAccent': item.accent }"><component :is="item.icon" :size="23" aria-hidden="true" /></span>
          <strong>{{ item.name }}</strong>
          <span>{{ item.description }}</span>
        </router-link>
      </div>
    </section>

    <section class="contentSection" aria-labelledby="recentTasksTitle">
      <div class="sectionHeading">
        <div>
          <p class="eyebrow">生成记录</p>
          <h2 id="recentTasksTitle">最近任务</h2>
        </div>
        <router-link to="/app/tasks">查看全部</router-link>
      </div>
      <div v-if="userAppStore.tasks.length" class="recentTasks">
        <article v-for="task in userAppStore.tasks.slice(0, 5)" :key="task.id" class="taskRow">
          <span class="taskTypeIcon"><component :is="taskIcons[task.taskType]" :size="18" aria-hidden="true" /></span>
          <span class="taskInfo">
            <strong>{{ taskTypeLabels[task.taskType] }}</strong>
            <small>{{ formatDate(task.createdAt) }} · {{ taskCreditText(task) }}</small>
          </span>
          <el-tag :type="taskStatusTypes[task.status]" effect="light" round>{{ taskStatusLabels[task.status] }}</el-tag>
        </article>
      </div>
      <p v-else class="quietEmpty">生成记录会显示在这里。</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { IconChevronRight, IconFileText, IconMovie, IconPhoto, IconPlus, IconVideo } from "@tabler/icons-vue";
import { apiErrorMessage } from "@/lib/api";
import { getProjectMode } from "@/lib/projectMode";
import { useAuthStore } from "@/stores/auth";
import { useUserAppStore } from "@/stores/userApp";
import { useWorkspaceStore, type Project } from "@/stores/workspace";
import { formatDate, taskCreditText, taskStatusLabels, taskStatusTypes, taskTypeLabels } from "./appFormat";
import { projectTemplates } from "./projectTemplates";

const router = useRouter();
const authStore = useAuthStore();
const workspaceStore = useWorkspaceStore();
const userAppStore = useUserAppStore();
const loading = ref(false);
const errorMessage = ref("");
const taskIcons = { text: IconFileText, image: IconPhoto, video: IconVideo };
const greeting = computed(() => {
  const hour = new Date().getHours();
  return hour < 11 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
});
const latestProjectTime = computed(() => workspaceStore.projectList[0] ? formatDate(workspaceStore.projectList[0].updatedAt) : "—");

onMounted(async () => {
  loading.value = true;
  try {
    await Promise.all([workspaceStore.loadProjects(), userAppStore.loadAccount(), userAppStore.loadTasks()]);
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "首页信息加载失败");
  } finally {
    loading.value = false;
  }
});

async function openProject(project: Project) {
  loading.value = true;
  try {
    await workspaceStore.openProject(project.id);
    const path = getProjectMode() === "advanced" ? `/app/projects/${project.id}/advanced` : `/app/projects/${project.id}`;
    await router.push(path);
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "项目打开失败");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.dashboardPage {
  .summaryGrid {
    display: grid;
    grid-template-columns: 1.35fr 1fr 1fr;
    gap: 16px;
    margin-top: 28px;

    .summaryCard {
      display: flex;
      min-height: 136px;
      flex-direction: column;
      justify-content: center;
      padding: 24px;
      border: 1px solid var(--studioBorder);
      border-radius: var(--studioRadiusLarge);
      background: var(--studioSurface);

      span { color: var(--studioMuted); font-size: 13px; }
      strong { margin: 8px 0 5px; color: var(--studioText); font-size: clamp(28px, 4vw, 38px); letter-spacing: -1px; }
      small { color: var(--studioMuted); }

      &.accentCard {
        border-color: transparent;
        background: linear-gradient(135deg, #302c78, #5b4ec8 60%, #7758d9);
        box-shadow: 0 20px 50px #4f46e530;
        span, strong, small { color: white; }
        small { opacity: 0.72; }
      }
    }
  }

  .projectGrid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;

    .projectCard {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr) auto;
      align-items: center;
      gap: 16px;
      padding: 16px;
      border: 1px solid var(--studioBorder);
      border-radius: var(--studioRadiusLarge);
      background: var(--studioSurface);
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: 180ms ease;

      &:hover { border-color: color-mix(in srgb, var(--studioAccent) 38%, var(--studioBorder)); transform: translateY(-2px); box-shadow: var(--studioShadow); }
      &:focus-visible { outline: 2px solid var(--studioAccent); outline-offset: 2px; }

      .projectCover {
        display: grid;
        width: 72px;
        height: 72px;
        place-items: center;
        border-radius: 16px;
        background: linear-gradient(145deg, var(--studioAccentSoft), #f1e8ff);
        color: var(--studioAccent);
      }

      .projectBody {
        display: grid;
        gap: 5px;
        min-width: 0;
        strong, span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        strong { color: var(--studioText); }
        span, small { color: var(--studioMuted); }
        span { font-size: 13px; }
        small { font-size: 11px; }
      }
    }
  }

  .templateGrid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;

    .templateCard {
      display: flex;
      min-height: 188px;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      padding: 22px;
      border: 1px solid var(--studioBorder);
      border-radius: var(--studioRadiusLarge);
      background: var(--studioSurface);
      color: var(--studioText);
      text-decoration: none;
      transition: 180ms ease;

      &:hover { transform: translateY(-3px); box-shadow: var(--studioShadow); }
      &:focus-visible { outline: 2px solid var(--studioAccent); outline-offset: 2px; }
      > span:last-child { color: var(--studioMuted); font-size: 13px; line-height: 1.65; }

      .templateIcon {
        display: grid;
        width: 44px;
        height: 44px;
        place-items: center;
        border-radius: 13px;
        background: color-mix(in srgb, var(--templateAccent) 13%, transparent);
        color: var(--templateAccent);
      }
    }
  }

  .recentTasks {
    overflow: hidden;
    border: 1px solid var(--studioBorder);
    border-radius: var(--studioRadiusLarge);
    background: var(--studioSurface);

    .taskRow {
      display: flex;
      align-items: center;
      gap: 13px;
      padding: 15px 18px;
      + .taskRow { border-top: 1px solid var(--studioBorder); }

      .taskTypeIcon {
        display: grid;
        width: 36px;
        height: 36px;
        flex-shrink: 0;
        place-items: center;
        border-radius: 11px;
        background: var(--studioSurfaceMuted);
        color: var(--studioAccent);
      }
      .taskInfo { display: grid; flex: 1; gap: 3px; }
      .taskInfo strong { font-size: 14px; }
      .taskInfo small { color: var(--studioMuted); }
    }
  }
}

@media (max-width: 920px) {
  .dashboardPage {
    .summaryGrid { grid-template-columns: 1fr 1fr; .accentCard { grid-column: 1 / -1; } }
    .projectGrid { grid-template-columns: 1fr; }
  }
}

@media (max-width: 620px) {
  .dashboardPage {
    .summaryGrid, .templateGrid { grid-template-columns: 1fr; }
    .summaryGrid .accentCard { grid-column: auto; }
    .projectGrid .projectCard { grid-template-columns: 56px minmax(0, 1fr) auto; .projectCover { width: 56px; height: 56px; } }
  }
}
</style>
