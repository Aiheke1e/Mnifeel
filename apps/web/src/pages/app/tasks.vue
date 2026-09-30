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

    <section class="taskOverview" aria-label="任务概览">
      <article>
        <span class="overviewIcon active"><icon-activity :size="20" aria-hidden="true" /></span>
        <span><small>进行中的任务</small><strong>{{ taskCount("running") + taskCount("pending") }}</strong></span>
      </article>
      <article>
        <span class="overviewIcon success"><icon-circle-check :size="20" aria-hidden="true" /></span>
        <span><small>已经完成</small><strong>{{ taskCount("succeeded") }}</strong></span>
      </article>
      <article>
        <span class="overviewIcon danger"><icon-alert-circle :size="20" aria-hidden="true" /></span>
        <span><small>需要关注</small><strong>{{ taskCount("failed") }}</strong></span>
      </article>
    </section>

    <div class="filterBar" role="group" aria-label="筛选任务">
      <button v-for="item in filters" :key="item.value" type="button" :aria-pressed="filter === item.value" @click="filter = item.value">
        {{ item.label }}
        <span>{{ taskCount(item.value) }}</span>
      </button>
    </div>

    <section v-if="filteredGroups.length" class="taskList" aria-label="生成任务列表">
      <article v-for="group in filteredGroups" :key="group.id" class="taskCard">
        <div class="taskMain">
          <span class="taskIcon"><component :is="taskIcons[group.taskType]" :size="21" aria-hidden="true" /></span>
          <div class="taskIdentity">
            <div class="taskTitle">
              <strong>{{ group.tasks.length > 1 ? "一轮文本创作" : taskTypeLabels[group.taskType] }}</strong>
              <el-tag :type="taskStatusTypes[group.status]" effect="light" round>{{ taskStatusLabels[group.status] }}</el-tag>
            </div>
            <span>{{ projectName(group.projectId) }} · {{ formatDate(group.createdAt) }}<template v-if="group.tasks.length > 1"> · {{ group.tasks.length }} 次模型调用</template></span>
          </div>
          <div class="taskCredits">
            <strong>{{ groupCreditText(group) }}</strong>
            <span v-if="group.refundedCredits">已退回 {{ group.refundedCredits }} 积分</span>
            <span v-else-if="group.status === 'succeeded'">已完成结算</span>
            <span v-else>按完成结果结算</span>
          </div>
          <el-button
            v-if="group.tasks.length === 1 && (group.status === 'pending' || group.status === 'running')"
            type="danger"
            plain
            round
            :loading="cancellingId === group.tasks[0]!.id"
            :aria-label="`取消${taskTypeLabels[group.taskType]}任务`"
            @click="cancel(group.tasks[0]!)">
            取消
          </el-button>
        </div>
        <el-progress
          v-if="group.status === 'pending' || group.status === 'running'"
          class="taskProgress"
          :percentage="group.progress"
          :strokeWidth="5"
          :showText="false"
          :indeterminate="group.status === 'pending'" />
        <p v-if="group.errorMessage" class="taskError" role="alert">{{ group.errorMessage }}</p>
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
import { IconActivity, IconAlertCircle, IconCircleCheck, IconFileText, IconListCheck, IconPhoto, IconRefresh, IconVideo } from "@tabler/icons-vue";
import { apiErrorMessage } from "@/lib/api";
import { useUserAppStore, type GenerationStatus, type GenerationTask } from "@/stores/userApp";
import { useWorkspaceStore } from "@/stores/workspace";
import { formatDate, friendlyTaskError, taskStatusLabels, taskStatusTypes, taskTypeLabels } from "./appFormat";

type TaskFilter = "all" | GenerationStatus;
type TaskGroup = {
  id: string;
  projectId: string;
  taskType: GenerationTask["taskType"];
  status: GenerationStatus;
  progress: number;
  actualCredits: number;
  frozenCredits: number;
  refundedCredits: number;
  errorMessage: string;
  createdAt: string;
  tasks: GenerationTask[];
};

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
const taskGroups = computed<TaskGroup[]>(() => {
  const groups = new Map<string, GenerationTask[]>();
  for (const task of userAppStore.tasks) {
    const key = task.taskType === "text" ? task.batchId : task.id;
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  return [...groups.entries()].map(([id, tasks]) => {
    const status = tasks.some(task => task.status === "running") ? "running"
      : tasks.some(task => task.status === "pending") ? "pending"
      : tasks.some(task => task.status === "failed") ? "failed"
      : tasks.every(task => task.status === "cancelled") ? "cancelled" : "succeeded";
    return {
      id,
      projectId: tasks[0]!.projectId,
      taskType: tasks[0]!.taskType,
      status,
      progress: Math.round(tasks.reduce((total, task) => total + task.progress, 0) / tasks.length),
      actualCredits: tasks.reduce((total, task) => total + task.actualCredits, 0),
      frozenCredits: tasks.reduce((total, task) => total + task.frozenCredits, 0),
      refundedCredits: tasks.reduce((total, task) => total + task.refundedCredits, 0),
      errorMessage: [...new Set(tasks.map(task => friendlyTaskError(task.errorMessage)).filter(Boolean))].join("；"),
      createdAt: tasks[0]!.createdAt,
      tasks,
    };
  });
});
const filteredGroups = computed(() => filter.value === "all" ? taskGroups.value : taskGroups.value.filter(group => group.status === filter.value));
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

function taskCount(value: TaskFilter) {
  return value === "all" ? taskGroups.value.length : taskGroups.value.filter(group => group.status === value).length;
}

function groupCreditText(group: TaskGroup) {
  if (group.actualCredits) return `消耗 ${group.actualCredits} 积分`;
  if (group.refundedCredits) return `已退回 ${group.refundedCredits} 积分`;
  if (group.frozenCredits) return `冻结 ${group.frozenCredits} 积分`;
  return "0 积分";
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
  .taskOverview {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-top: 20px;

    article {
      display: flex;
      align-items: center;
      gap: 13px;
      min-height: 88px;
      padding: 17px;
      border: 1px solid var(--studioBorder);
      border-radius: 18px;
      background: var(--studioSurface);
      box-shadow: var(--studioShadowSoft);

      .overviewIcon {
        display: grid;
        width: 42px;
        height: 42px;
        flex-shrink: 0;
        place-items: center;
        border-radius: 13px;
        background: var(--studioAccentSoft);
        color: var(--studioAccent);
        &.success { background: var(--el-color-success-light-9); color: var(--el-color-success); }
        &.danger { background: var(--el-color-danger-light-9); color: var(--el-color-danger); }
      }

      > span:last-child { display: grid; gap: 3px; }
      small { color: var(--studioMuted); font-size: 11px; }
      strong { color: var(--studioText); font-size: 23px; line-height: 1; }
    }
  }

  .filterBar {
    display: flex;
    gap: 7px;
    margin: 20px 0 14px;
    overflow-x: auto;
    padding: 10px;
    border: 1px solid var(--studioBorder);
    border-radius: 16px;
    background: color-mix(in srgb, var(--studioSurface) 74%, transparent);

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
        border-color: color-mix(in srgb, var(--studioAccent) 42%, var(--studioBorder));
        background: var(--studioAccentSoft);
        color: var(--studioAccent);
        font-weight: 650;
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
      box-shadow: var(--studioShadowSoft);
      transition: 160ms ease;

      &:hover { border-color: color-mix(in srgb, var(--studioAccent) 30%, var(--studioBorder)); transform: translateY(-1px); }

      .taskMain {
        display: grid;
        grid-template-columns: 44px minmax(190px, 1fr) minmax(150px, auto) auto;
        align-items: center;
        gap: 15px;
        padding: 20px;

        .taskIcon {
          display: grid;
          width: 46px;
          height: 46px;
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

      .taskProgress { margin: -3px 20px 18px 81px; }
      .taskError { margin: 0; padding: 11px 18px; border-top: 1px solid var(--studioBorder); background: var(--el-color-danger-light-9); color: var(--el-color-danger); font-size: 12px; }
    }
  }
}

@media (max-width: 700px) {
  .tasksPage {
    .taskOverview { grid-template-columns: 1fr; article { min-height: 72px; } }
    .taskList .taskCard {
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
}
</style>
