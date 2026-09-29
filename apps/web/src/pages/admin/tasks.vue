<template>
  <section class="adminPage">
    <header class="pageHeader"><div><span>GENERATION QUEUE</span><h1>生成任务</h1><p>查看任务运行状态、耗时、结算积分和脱敏错误。</p></div><el-button :icon="IconRefresh" :loading="loading" @click="loadTasks">刷新</el-button></header>
    <div class="filters"><el-input v-model="user" clearable placeholder="搜索手机号或邮箱" :prefixIcon="IconSearch" @keyup.enter="loadTasks" @clear="loadTasks" /><el-select v-model="status" clearable placeholder="全部状态" @change="loadTasks"><el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select><el-button type="primary" @click="loadTasks">查询</el-button></div>
    <el-table v-loading="loading" :data="tasks" rowKey="id" class="taskTable">
      <el-table-column label="任务" minWidth="210"><template #default="scope"><strong>{{ scope.row.projectName }}</strong><small>{{ scope.row.id }}</small></template></el-table-column>
      <el-table-column prop="userLabel" label="用户" minWidth="150" /><el-table-column label="模型" minWidth="160"><template #default="scope"><strong>{{ scope.row.modelName }}</strong><small>{{ scope.row.providerName }}</small></template></el-table-column>
      <el-table-column label="状态" width="110"><template #default="scope"><el-tag :type="statusType(scope.row.status)">{{ statusText(scope.row.status) }}</el-tag></template></el-table-column>
      <el-table-column label="耗时" width="95"><template #default="scope">{{ durationText(scope.row.durationSeconds) }}</template></el-table-column>
      <el-table-column label="消费 / 退款" width="130"><template #default="scope">{{ scope.row.actualCredits }} / {{ scope.row.refundedCredits }}</template></el-table-column>
      <el-table-column label="创建时间" width="178"><template #default="scope">{{ formatTime(scope.row.createdAt) }}</template></el-table-column>
      <el-table-column label="错误" minWidth="220"><template #default="scope"><span class="errorText" :title="scope.row.errorMessage || ''">{{ scope.row.errorMessage || "—" }}</span></template></el-table-column>
      <template #empty><el-empty description="暂无生成任务" /></template>
    </el-table>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { IconRefresh, IconSearch } from "@tabler/icons-vue";
import api, { apiErrorMessage } from "@/lib/api";

type TaskStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";
type Task = { id: string; userLabel: string | null; projectName: string; modelName: string; providerName: string; status: TaskStatus; actualCredits: number; refundedCredits: number; durationSeconds: number | null; errorMessage: string | null; createdAt: string };
type ApiResponse<T> = { data: T };
const tasks = ref<Task[]>([]); const loading = ref(false); const status = ref(""); const user = ref("");
const statusOptions = [{ label: "等待中", value: "pending" }, { label: "运行中", value: "running" }, { label: "成功", value: "succeeded" }, { label: "失败", value: "failed" }, { label: "已取消", value: "cancelled" }];
function statusText(value: TaskStatus) { return { pending: "等待中", running: "运行中", succeeded: "成功", failed: "失败", cancelled: "已取消" }[value]; }
function statusType(value: TaskStatus) { if (value === "succeeded") return "success"; if (value === "failed") return "danger"; if (value === "running") return "primary"; return "info"; }
function durationText(value: number | null) { if (value === null) return "—"; return value < 60 ? `${value} 秒` : `${Math.floor(value / 60)}分${value % 60}秒`; }
function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }
async function loadTasks() { loading.value = true; try { const response = await api.get<ApiResponse<Task[]>>("/admin/tasks/get", { params: { status: status.value || undefined, user: user.value || undefined } }); tasks.value = response.data.data; } catch (error) { ElMessage.error(apiErrorMessage(error, "读取任务失败")); } finally { loading.value = false; } }
onMounted(loadTasks);
</script>

<style scoped lang="scss">
.adminPage { max-width: 1500px; margin: 0 auto; padding: 38px clamp(18px, 3vw, 46px) 64px;
  .pageHeader { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px; } .pageHeader span { color: var(--el-color-primary); font-size: 11px; font-weight: 700; letter-spacing: 1.6px; } h1 { margin: 6px 0 8px; font-size: 30px; } p, small { color: var(--el-text-color-secondary); } p { margin: 0; }
  .filters { display: flex; gap: 10px; margin-bottom: 16px; } .filters .el-input { max-width: 260px; } .filters .el-select { width: 150px; }
  .taskTable { border: 1px solid var(--el-border-color-lighter); border-radius: 12px; } .taskTable strong, .taskTable small { display: block; } .taskTable small { overflow: hidden; margin-top: 4px; text-overflow: ellipsis; } .errorText { display: block; overflow: hidden; color: var(--el-color-danger); text-overflow: ellipsis; white-space: nowrap; }
}
</style>
