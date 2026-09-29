<template>
  <section class="adminPage">
    <header class="pageHeader">
      <div><span>USER OPERATIONS</span><h1>用户与积分</h1><p>管理账号状态、白名单、会话和积分赠送。</p></div>
      <el-button :icon="IconRefresh" :loading="loading" @click="loadUsers">刷新</el-button>
    </header>
    <div class="filters">
      <el-input v-model="phone" clearable placeholder="搜索手机号" :prefixIcon="IconSearch" @keyup.enter="loadUsers" @clear="loadUsers" />
      <el-select v-model="status" clearable placeholder="全部状态" @change="loadUsers"><el-option label="正常" value="active" /><el-option label="已禁用" value="disabled" /></el-select>
      <el-button type="primary" @click="loadUsers">查询</el-button>
    </div>
    <el-table v-loading="loading" :data="users" rowKey="id" class="userTable">
      <el-table-column label="账号" minWidth="190"><template #default="scope"><strong>{{ scope.row.phone || scope.row.email || "未绑定" }}</strong><small>{{ scope.row.email && scope.row.phone ? scope.row.email : scope.row.id }}</small></template></el-table-column>
      <el-table-column label="状态" width="120"><template #default="scope"><el-switch :modelValue="scope.row.status === 'active'" inlinePrompt activeText="正常" inactiveText="禁用" :loading="savingId === scope.row.id" @change="value => updateUser(scope.row, { status: value ? 'active' : 'disabled' })" /></template></el-table-column>
      <el-table-column label="白名单" width="110"><template #default="scope"><el-switch :modelValue="scope.row.isWhitelist" :loading="savingId === scope.row.id" @change="value => updateUser(scope.row, { isWhitelist: !!value })" /></template></el-table-column>
      <el-table-column label="可用 / 冻结积分" width="160"><template #default="scope"><strong>{{ scope.row.availableCredits.toLocaleString() }}</strong><small>{{ scope.row.frozenCredits.toLocaleString() }}</small></template></el-table-column>
      <el-table-column label="项目 / 会话" width="130"><template #default="scope"><span>{{ scope.row.projects.length }} / {{ scope.row.sessions.length }}</span></template></el-table-column>
      <el-table-column label="注册时间" width="178"><template #default="scope">{{ formatTime(scope.row.createdAt) }}</template></el-table-column>
      <el-table-column label="操作" width="250" fixed="right"><template #default="scope"><el-button size="small" :icon="IconCoins" @click="showGrant(scope.row)">赠送积分</el-button><el-button size="small" @click="showDetails(scope.row)">查看详情</el-button></template></el-table-column>
      <template #empty><el-empty description="没有匹配用户" /></template>
    </el-table>

    <el-dialog v-model="grantVisible" title="赠送积分" width="420px">
      <p class="dialogHint">为 {{ selectedUser?.phone || selectedUser?.email }} 增加可用积分。流水写入后不可修改。</p>
      <el-input-number v-model="grantAmount" :min="1" :max="1000000000" :step="100" controlsPosition="right" />
      <template #footer><el-button @click="grantVisible = false">取消</el-button><el-button type="primary" :loading="granting" @click="grantCredits">确认赠送</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailsVisible" title="用户详情" size="min(680px, 94vw)">
      <template v-if="selectedUser">
        <el-descriptions :column="1" border><el-descriptions-item label="账号">{{ selectedUser.phone || selectedUser.email }}</el-descriptions-item><el-descriptions-item label="密码">{{ selectedUser.hasPassword ? "已设置" : "未设置" }}</el-descriptions-item><el-descriptions-item label="用户 ID">{{ selectedUser.id }}</el-descriptions-item></el-descriptions>
        <h2>有效会话</h2>
        <div v-for="session in selectedUser.sessions" :key="session.id" class="detailItem"><div><strong>{{ session.userAgent || "未知设备" }}</strong><small>{{ session.ipAddress || "未知 IP" }} · 最近使用 {{ formatTime(session.lastUsedAt) }}</small></div><el-button type="danger" plain size="small" @click="revokeSession(session.id)">撤销</el-button></div>
        <el-empty v-if="!selectedUser.sessions.length" description="没有有效会话" :imageSize="56" />
        <h2>项目摘要</h2>
        <div v-for="project in selectedUser.projects" :key="project.id" class="detailItem"><div><strong>{{ project.name }}</strong><small>{{ project.assetCount }} 个素材 · {{ formatBytes(project.assetBytes) }} · {{ formatTime(project.updatedAt) }}</small></div><el-button size="small" @click="openProjectSummary(project.id)">查看</el-button></div>
        <el-empty v-if="!selectedUser.projects.length" description="暂无项目" :imageSize="56" />
      </template>
    </el-drawer>

    <el-dialog v-model="projectVisible" title="项目只读摘要" width="min(620px, 92vw)">
      <el-skeleton v-if="projectLoading" :rows="5" animated />
      <el-descriptions v-else-if="projectSummary" :column="1" border>
        <el-descriptions-item label="项目">{{ projectSummary.name }}</el-descriptions-item><el-descriptions-item label="用户">{{ projectSummary.userLabel }}</el-descriptions-item><el-descriptions-item label="状态">{{ projectSummary.status }}</el-descriptions-item><el-descriptions-item label="更新时间">{{ formatTime(projectSummary.updatedAt) }}</el-descriptions-item><el-descriptions-item label="素材">{{ projectSummary.assetCount }} 个，{{ formatBytes(projectSummary.assetBytes) }}</el-descriptions-item><el-descriptions-item label="说明">{{ projectSummary.description || "—" }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { IconCoins, IconRefresh, IconSearch } from "@tabler/icons-vue";
import api, { apiErrorMessage } from "@/lib/api";

type Session = { id: string; userAgent: string | null; ipAddress: string | null; lastUsedAt: string; expiresAt: string };
type Project = { id: string; name: string; status: string; updatedAt: string; assetCount: number; assetBytes: number };
type User = { id: string; status: "active" | "disabled"; isWhitelist: boolean; hasPassword: boolean; phone: string | null; email: string | null; availableCredits: number; frozenCredits: number; createdAt: string; sessions: Session[]; projects: Project[] };
type ProjectSummary = { id: string; userLabel: string | null; name: string; description: string; status: string; updatedAt: string; assetCount: number; assetBytes: number };
type ApiResponse<T> = { data: T };

const users = ref<User[]>([]);
const loading = ref(false);
const savingId = ref("");
const phone = ref("");
const status = ref("");
const selectedUser = ref<User>();
const grantVisible = ref(false);
const detailsVisible = ref(false);
const projectVisible = ref(false);
const granting = ref(false);
const grantAmount = ref(100);
const projectLoading = ref(false);
const projectSummary = ref<ProjectSummary>();

function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

async function loadUsers() {
  loading.value = true;
  try {
    const response = await api.get<ApiResponse<User[]>>("/admin/users/get", { params: { phone: phone.value || undefined, status: status.value || undefined } });
    users.value = response.data.data;
    if (selectedUser.value) selectedUser.value = users.value.find(user => user.id === selectedUser.value?.id);
  } catch (error) { ElMessage.error(apiErrorMessage(error, "读取用户失败")); }
  finally { loading.value = false; }
}

async function updateUser(userValue: unknown, changes: Partial<Pick<User, "status" | "isWhitelist">>) {
  const user = userValue as User;
  if (changes.status === "disabled") {
    const confirmed = await ElMessageBox.confirm("禁用后该用户的所有有效会话会立即撤销。", "禁用用户", { type: "warning", confirmButtonText: "确认禁用", cancelButtonText: "取消" }).then(() => true, () => false);
    if (!confirmed) return;
  }
  savingId.value = user.id;
  try { await api.put("/admin/users/update", { userId: user.id, ...changes }); await loadUsers(); ElMessage.success("用户设置已保存"); }
  catch (error) { ElMessage.error(apiErrorMessage(error, "保存用户设置失败")); }
  finally { savingId.value = ""; }
}

function showGrant(userValue: unknown) { selectedUser.value = userValue as User; grantAmount.value = 100; grantVisible.value = true; }
function showDetails(userValue: unknown) { selectedUser.value = userValue as User; detailsVisible.value = true; }

async function grantCredits() {
  if (!selectedUser.value) return;
  granting.value = true;
  try { await api.post("/admin/users/grantCredits", { userId: selectedUser.value.id, amount: grantAmount.value }); grantVisible.value = false; await loadUsers(); ElMessage.success("积分已赠送"); }
  catch (error) { ElMessage.error(apiErrorMessage(error, "赠送积分失败")); }
  finally { granting.value = false; }
}

async function revokeSession(sessionId: string) {
  if (!selectedUser.value) return;
  const confirmed = await ElMessageBox.confirm("撤销后该设备需要重新登录。", "撤销会话", { type: "warning" }).then(() => true, () => false);
  if (!confirmed) return;
  try { await api.post("/admin/users/revokeSession", { userId: selectedUser.value.id, sessionId }); await loadUsers(); ElMessage.success("会话已撤销"); }
  catch (error) { ElMessage.error(apiErrorMessage(error, "撤销会话失败")); }
}

async function openProjectSummary(projectId: string) {
  projectVisible.value = true;
  projectLoading.value = true;
  projectSummary.value = undefined;
  try { const response = await api.post<ApiResponse<ProjectSummary>>("/admin/projects/open", { projectId }); projectSummary.value = response.data.data; }
  catch (error) { ElMessage.error(apiErrorMessage(error, "读取项目摘要失败")); }
  finally { projectLoading.value = false; }
}

onMounted(loadUsers);
</script>

<style scoped lang="scss">
.adminPage { max-width: 1420px; margin: 0 auto; padding: 38px clamp(18px, 3vw, 46px) 64px;
  .pageHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
  .pageHeader span { color: var(--el-color-primary); font-size: 11px; font-weight: 700; letter-spacing: 1.6px; }
  h1 { margin: 6px 0 8px; font-size: 30px; } p, small { color: var(--el-text-color-secondary); } p { margin: 0; }
  .filters { display: flex; gap: 10px; margin-bottom: 16px; } .filters .el-input { max-width: 260px; } .filters .el-select { width: 150px; }
  .userTable { border: 1px solid var(--el-border-color-lighter); border-radius: 12px; }
  .userTable strong, .userTable small { display: block; } .userTable small { overflow: hidden; margin-top: 4px; font-size: 12px; text-overflow: ellipsis; }
  .dialogHint { margin-bottom: 18px; line-height: 1.6; }
  h2 { margin: 28px 0 12px; font-size: 16px; }
  .detailItem { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 13px 0; border-bottom: 1px solid var(--el-border-color-lighter); }
  .detailItem div { min-width: 0; } .detailItem strong, .detailItem small { display: block; } .detailItem small { margin-top: 5px; }
}
@media (max-width: 600px) { .adminPage .filters { flex-wrap: wrap; } }
</style>
