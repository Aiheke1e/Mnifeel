<template>
  <section class="adminPage">
    <header class="pageHeader"><div><span>SECURITY AUDIT</span><h1>审计记录</h1><p>管理员敏感操作的只读记录，数据库禁止修改和删除。</p></div><el-button :icon="IconRefresh" :loading="loading" @click="loadAudit">刷新</el-button></header>
    <div class="filters"><el-input v-model="action" clearable placeholder="搜索操作名称" :prefixIcon="IconSearch" @keyup.enter="loadAudit" @clear="loadAudit" /><el-button type="primary" @click="loadAudit">查询</el-button></div>
    <el-table v-loading="loading" :data="records" rowKey="id" class="auditTable">
      <el-table-column label="时间" width="178"><template #default="scope">{{ formatTime(scope.row.createdAt) }}</template></el-table-column><el-table-column prop="adminLabel" label="管理员" minWidth="150" /><el-table-column prop="action" label="操作" minWidth="180" /><el-table-column label="目标" minWidth="210"><template #default="scope"><strong>{{ scope.row.targetType || "—" }}</strong><small>{{ scope.row.targetId || "" }}</small></template></el-table-column><el-table-column label="详情" minWidth="320"><template #default="scope"><code>{{ JSON.stringify(scope.row.details) }}</code></template></el-table-column>
      <template #empty><el-empty description="暂无审计记录" /></template>
    </el-table>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { IconRefresh, IconSearch } from "@tabler/icons-vue";
import api, { apiErrorMessage } from "@/lib/api";
type AuditRecord = { id: string; adminLabel: string | null; action: string; targetType: string | null; targetId: string | null; details: unknown; createdAt: string };
type ApiResponse<T> = { data: T };
const records = ref<AuditRecord[]>([]); const loading = ref(false); const action = ref("");
function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }
async function loadAudit() { loading.value = true; try { const response = await api.get<ApiResponse<AuditRecord[]>>("/admin/audit/get", { params: { action: action.value || undefined } }); records.value = response.data.data; } catch (error) { ElMessage.error(apiErrorMessage(error, "读取审计记录失败")); } finally { loading.value = false; } }
onMounted(loadAudit);
</script>

<style scoped lang="scss">
.adminPage { max-width: 1420px; margin: 0 auto; padding: 38px clamp(18px, 3vw, 46px) 64px;
  .pageHeader { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px; } .pageHeader span { color: var(--el-color-primary); font-size: 11px; font-weight: 700; letter-spacing: 1.6px; } h1 { margin: 6px 0 8px; font-size: 30px; } p, small { color: var(--el-text-color-secondary); } p { margin: 0; }
  .filters { display: flex; gap: 10px; margin-bottom: 16px; } .filters .el-input { max-width: 280px; }
  .auditTable { border: 1px solid var(--el-border-color-lighter); border-radius: 12px; } .auditTable strong, .auditTable small { display: block; } .auditTable small { overflow: hidden; margin-top: 4px; text-overflow: ellipsis; } code { color: var(--el-text-color-regular); white-space: normal; word-break: break-all; }
}
</style>
