<template>
  <div class="myProjectsPage studioPage" :aria-busy="loading">
    <header class="pageTopbar">
      <div>
        <p class="eyebrow">创作空间</p>
        <h1>我的项目</h1>
        <p>全部短剧项目，支持按名称和描述搜索，并可切换排序方式。</p>
      </div>
      <router-link to="/app/projects/import">导入旧项目</router-link>
    </header>

    <el-alert v-if="errorMessage" class="pageAlert" :title="errorMessage" type="error" showIcon :closable="false" />

    <div class="listToolbar">
      <el-input v-model="searchKeyword" class="projectSearch" clearable aria-label="搜索项目" placeholder="搜索项目" />
      <el-select v-model="sortBy" class="projectSort" aria-label="项目排序">
        <el-option label="最近更新" value="recent" />
        <el-option label="名称" value="name" />
      </el-select>
      <span class="listCount">{{ visibleProjects.length }} 个项目</span>
    </div>

    <div v-if="visibleProjects.length" class="projectGrid">
      <button v-for="project in visibleProjects" :key="project.id" class="projectCard" type="button" @click="openProject(project)">
        <span class="projectCover"><icon-movie :size="27" aria-hidden="true" /></span>
        <span class="projectBody">
          <strong>{{ project.name }}</strong>
          <span>{{ project.description || "继续完善这个故事" }}</span>
          <small>{{ formatDate(project.updatedAt) }}</small>
        </span>
        <icon-chevron-right :size="18" aria-hidden="true" />
      </button>
    </div>
    <p v-else-if="workspaceStore.projectList.length" class="quietEmpty">没有匹配的项目，换个关键词试试。</p>
    <p v-else class="quietEmpty">还没有项目，回到创作首页输入一个想法就能开始。</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { IconChevronRight, IconMovie } from "@tabler/icons-vue";
import { apiErrorMessage } from "@/lib/api";
import { setProjectMode } from "@/lib/projectMode";
import { useWorkspaceStore, type Project } from "@/stores/workspace";
import { formatDate } from "./appFormat";

const router = useRouter();
const workspaceStore = useWorkspaceStore();
const loading = ref(false);
const errorMessage = ref("");
const searchKeyword = ref("");
const sortBy = ref<"recent" | "name">("recent");

const visibleProjects = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase();
  const matched = keyword
    ? workspaceStore.projectList.filter((project) => `${project.name}${project.description ?? ""}`.toLowerCase().includes(keyword))
    : workspaceStore.projectList;
  return [...matched].sort((a, b) => {
    if (sortBy.value === "name") return a.name.localeCompare(b.name, "zh-Hans-CN");
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
});

onMounted(async () => {
  loading.value = true;
  try {
    await workspaceStore.loadProjects();
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "项目列表加载失败");
  } finally {
    loading.value = false;
  }
});

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
.myProjectsPage {
  .listToolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-bottom: 18px;

    .projectSearch { width: 220px; }
    .projectSort { width: 132px; }
    .listCount { margin-left: auto; color: var(--studioMuted); font-size: 12px; }
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
  .myProjectsPage .projectGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 760px) {
  .myProjectsPage {
    .listToolbar { .projectSearch, .projectSort { width: 100%; } .listCount { margin-left: 0; } }
    .projectGrid { grid-template-columns: 1fr; }
  }
}
</style>
