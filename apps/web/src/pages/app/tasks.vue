<template>
  <div class="tasksPage studioPage" :aria-busy="loading">
    <header class="pageTopbar">
      <div>
        <p class="eyebrow">任务中心</p>
        <h1>每一次生成，都有清楚记录</h1>
        <p>查看生成进度、积分消费和失败退款。</p>
      </div>
      <el-button :icon="IconRefresh" :loading="loading" round @click="load">刷新</el-button>
    </header>

    <el-alert v-if="errorMessage" class="pageAlert" :title="errorMessage" type="error" showIcon :closable="false" />

    <div class="filterBar" role="group" aria-label="筛选任务">
      <button v-for="item in filters" :key="item.value" type="button" :aria-pressed="filter === item.value" @click="filter = item.value">
        {{ item.label }}
        <span>{{ taskCount(item.value) }}</span>
      </button>
    </div>

    <section v-if="filteredTasks.length" class="taskList" aria-label="生成任务列表">
      <article v-for="task in filteredTasks" :key="task.id" class="taskCard">
        <div class="taskMain">
          <span class="taskIcon"><component :is="taskIcons[task.taskType]" :size="21" aria-hidden="true" /></span>
          <div class="taskIdentity">
            <div class="taskTitle">
              <strong>{{ taskTypeLabels[task.taskType] }}</strong>
              <el-tag :type="taskStatusTypes[task.status]" effect="light" round>{{ taskStatusLabels[task.status] }}</el-tag>
            </div>
            <span>{{ projectName(task.projectId) }} · {{ formatDate(task.createdAt) }}</span>
          </div>
          <div class="taskCredits">
            <strong>{{ taskCreditText(task) }}</strong>
            <span v-if="task.refundedCredits">本次费用已退回</span>
            <span v-else-if="task.status === 'succeeded'">已完成结算</span>
            <span v-else>按完成结果结算</span>
          </div>
          <el-button
            v-if="task.status === 'pending' || task.status === 'running'"
            type="danger"
            plain
            round
            :loading="cancellingId === task.id"
            :aria-label="`取消${taskTypeLabels[task.taskType]}任务`"
            @click="cancel(task)">
            取消
          </el-button>
        </div>
        <el-progress
          v-if="task.status === 'pending' || task.status === 'running'"
          class="taskProgress"
          :percentage="task.progress"
          :strokeWidth="5"
          :showText="false"
          :indeterminate="task.status === 'pending'" />
        <p v-if="task.errorMessage" class="taskError" role="alert">{{ task.errorMessage }}</p>
      </article>
    </section>
    <div v-else class="emptyPanel">
      <icon-list-check :size="36" aria-hidden="true" />
      <h2>这里还没有任务</h2>
      <p>开始创作后，文本、图片和视频的生成进度会显示在这里。</p>
      <router-link class="secondaryAction" to="/app/projects/new">开始创作</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { IconFileText, IconListCheck, IconPhoto, IconRefresh, IconVideo } from "@tabler/icons-vue";
import { apiErrorMessage } from "@/lib/api";
import { useUserAppStore, type GenerationStatus, type GenerationTask } from "@/stores/userApp";
import { useWorkspaceStore } from "@/stores/workspace";
import { formatDate, taskCreditText, taskStatusLabels, taskStatusTypes, taskTypeLabels } from "./appFormat";

type TaskFilter = "all" | GenerationStatus;

const userAppStore = useUserAppStore();
const workspaceStore = useWorkspaceStore();
const loading = ref(false);
const errorMessage = ref("");
const filter = ref<TaskFilter>("all");
const cancellingId = ref("");
const taskIcons = { text: IconFileText, image: IconPhoto, video: IconVideo };
const filters: Array<{ label: string; value: TaskFilter }> = [
  { label: "全部", value: "all" },
  { label: "进行中", value: "running" },
  { label: "等待中", value: "pending" },
  { label: "已完成", value: "succeeded" },
  { label: "失败", value: "failed" },
  { label: "已取消", value: "cancelled" },
];
const filteredTasks = computed(() => filter.value === "all" ? userAppStore.tasks : userAppStore.tasks.filter(task => task.status === filter.value));
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

function taskCount(value: TaskFilter) {
  return value === "all" ? userAppStore.tasks.length : userAppStore.tasks.filter(task => task.status === value).length;
}

function projectName(projectId: string) {
  return workspaceStore.projectList.find(project => project.id === projectId)?.name ?? "已归档项目";
}

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    await Promise.all([userAppStore.loadTasks(), workspaceStore.loadProjects()]);
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "任务列表加载失败");
  } finally {
    loading.value = false;
    clearTimeout(refreshTimer);
    if (userAppStore.activeTaskCount) refreshTimer = setTimeout(load, 5000);
  }
}

async function cancel(task: GenerationTask) {
  const confirmed = await ElMessageBox.confirm("取消后，本次冻结的积分会退回账户。", "取消生成任务", {
    confirmButtonText: "确认取消",
    cancelButtonText: "继续等待",
    type: "warning",
  }).then(() => true, () => false);
  if (!confirmed) return;
  cancellingId.value = task.id;
  try {
    await userAppStore.cancelTask(task.id);
    ElMessage.success("任务已取消，冻结积分已退回");
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, "取消任务失败"));
  } finally {
    cancellingId.value = "";
  }
}

onMounted(load);
onBeforeUnmount(() => clearTimeout(refreshTimer));
</script>

<style scoped lang="scss">
.tasksPage {
  .filterBar {
    display: flex;
    gap: 7px;
    margin: 28px 0 18px;
    overflow-x: auto;
    padding-bottom: 2px;

    button {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      gap: 7px;
      min-height: 38px;
      padding: 0 14px;
      border: 1px solid var(--studioBorder);
      border-radius: 999px;
      background: var(--studioSurface);
      color: var(--studioMuted);
      font: inherit;
      cursor: pointer;

      span {
        display: grid;
        min-width: 20px;
        height: 20px;
        place-items: center;
        border-radius: 999px;
        background: var(--studioSurfaceMuted);
        font-size: 11px;
      }

      &[aria-pressed="true"] {
        border-color: var(--studioAccent);
        background: var(--studioAccentSoft);
        color: var(--studioAccent);
      }

      &:focus-visible { outline: 2px solid var(--studioAccent); outline-offset: 2px; }
    }
  }

  .taskList {
    display: grid;
    gap: 11px;

    .taskCard {
      overflow: hidden;
      border: 1px solid var(--studioBorder);
      border-radius: var(--studioRadiusLarge);
      background: var(--studioSurface);

      .taskMain {
        display: grid;
        grid-template-columns: 44px minmax(190px, 1fr) minmax(150px, auto) auto;
        align-items: center;
        gap: 15px;
        padding: 18px;

        .taskIcon {
          display: grid;
          width: 44px;
          height: 44px;
          place-items: center;
          border-radius: 13px;
          background: var(--studioAccentSoft);
          color: var(--studioAccent);
        }

        .taskIdentity {
          display: grid;
          gap: 6px;
          min-width: 0;
          > span { overflow: hidden; color: var(--studioMuted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
        }

        .taskTitle { display: flex; align-items: center; gap: 9px; }
        .taskCredits { display: grid; gap: 4px; text-align: right; strong { font-size: 13px; } span { color: var(--studioMuted); font-size: 11px; } }
      }

      .taskProgress { margin: -3px 18px 16px 77px; }
      .taskError { margin: 0; padding: 11px 18px; border-top: 1px solid var(--studioBorder); background: var(--el-color-danger-light-9); color: var(--el-color-danger); font-size: 12px; }
    }
  }
}

@media (max-width: 700px) {
  .tasksPage .taskList .taskCard {
    .taskMain {
      grid-template-columns: 40px minmax(0, 1fr) auto;
      gap: 11px;
      padding: 15px;
      .taskIcon { width: 40px; height: 40px; }
      .taskCredits { grid-column: 2 / -1; text-align: left; }
      .el-button { grid-column: 2 / -1; justify-self: start; }
    }
    .taskProgress { margin: -3px 15px 14px 66px; }
  }
}
</style>
