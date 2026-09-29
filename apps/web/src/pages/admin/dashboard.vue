<template>
  <section class="adminPage">
    <header class="pageHeader">
      <div><span class="eyebrow">ADMIN CONSOLE</span><h1>数据总览</h1><p>本地业务数据和生成服务运行概况。</p></div>
      <el-button :icon="IconRefresh" :loading="loading" @click="loadDashboard">刷新</el-button>
    </header>
    <el-skeleton v-if="loading && !dashboard" :rows="7" animated />
    <template v-else-if="dashboard">
      <div class="metricGrid">
        <article v-for="metric in metrics" :key="metric.label" class="metricCard">
          <span>{{ metric.label }}</span><strong>{{ metric.value }}</strong><small>{{ metric.note }}</small>
        </article>
      </div>
      <div class="detailGrid">
        <el-card shadow="never"><template #header>用户状态</template><el-progress :percentage="activeUserRate" /><p>{{ dashboard.users.active }} 个活跃账号，{{ dashboard.users.whitelist }} 个白名单账号</p></el-card>
        <el-card shadow="never"><template #header>任务成功率</template><el-progress :percentage="dashboard.tasks.successRate" :status="dashboard.tasks.successRate >= 80 ? 'success' : undefined" /><p>{{ dashboard.tasks.succeeded }} 成功，{{ dashboard.tasks.failed }} 失败，{{ dashboard.tasks.processing }} 处理中</p></el-card>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { IconRefresh } from "@tabler/icons-vue";
import api, { apiErrorMessage } from "@/lib/api";

type Dashboard = {
  users: { total: number; active: number; whitelist: number };
  projects: { total: number; active: number };
  tasks: { total: number; succeeded: number; failed: number; processing: number; successRate: number };
  consumedCredits: number;
  assetBytes: number;
};
type ApiResponse<T> = { data: T };

const loading = ref(false);
const dashboard = ref<Dashboard>();
const activeUserRate = computed(() => dashboard.value?.users.total ? Math.round(dashboard.value.users.active / dashboard.value.users.total * 100) : 0);
const metrics = computed(() => dashboard.value ? [
  { label: "注册用户", value: dashboard.value.users.total.toLocaleString(), note: `${dashboard.value.users.active} 个活跃` },
  { label: "项目总数", value: dashboard.value.projects.total.toLocaleString(), note: `${dashboard.value.projects.active} 个创作中` },
  { label: "生成任务", value: dashboard.value.tasks.total.toLocaleString(), note: `${dashboard.value.tasks.processing} 个处理中` },
  { label: "成功率", value: `${dashboard.value.tasks.successRate}%`, note: "成功任务 / 已结束任务" },
  { label: "积分消费", value: dashboard.value.consumedCredits.toLocaleString(), note: "已实际结算" },
  { label: "素材占用", value: formatBytes(dashboard.value.assetBytes), note: "数据库登记素材" },
] : []);

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

async function loadDashboard() {
  loading.value = true;
  try {
    const response = await api.get<ApiResponse<Dashboard>>("/admin/dashboard/get");
    dashboard.value = response.data.data;
  } catch (error) { ElMessage.error(apiErrorMessage(error, "读取统计失败")); }
  finally { loading.value = false; }
}

onMounted(loadDashboard);
</script>

<style scoped lang="scss">
.adminPage {
  max-width: 1320px;
  margin: 0 auto;
  padding: 38px clamp(20px, 4vw, 52px) 64px;

  .pageHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 30px; }
  .eyebrow { color: var(--el-color-primary); font-size: 11px; font-weight: 700; letter-spacing: 1.6px; }
  h1 { margin: 6px 0 8px; font-size: 30px; }
  p { margin: 0; color: var(--el-text-color-secondary); }
  .metricGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .metricCard { display: flex; flex-direction: column; gap: 9px; padding: 22px; border: 1px solid var(--el-border-color-lighter); border-radius: 14px; background: var(--el-bg-color); box-shadow: var(--el-box-shadow-lighter); }
  .metricCard span, .metricCard small { color: var(--el-text-color-secondary); }
  .metricCard strong { font-size: 28px; }
  .detailGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 16px; }
  .detailGrid p { margin-top: 14px; font-size: 13px; }
}
@media (max-width: 900px) { .adminPage .metricGrid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) { .adminPage .metricGrid, .adminPage .detailGrid { grid-template-columns: 1fr; } }
</style>
