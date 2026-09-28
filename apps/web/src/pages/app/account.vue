<template>
  <div class="accountPage studioPage" :aria-busy="loading">
    <header class="pageTopbar">
      <div>
        <p class="eyebrow">账户与安全</p>
        <h1>管理你的账户</h1>
        <p>查看积分、密码状态和当前登录设备。</p>
      </div>
      <el-button :icon="IconLogout" round @click="logout">退出登录</el-button>
    </header>

    <el-alert v-if="errorMessage" class="pageAlert" :title="errorMessage" type="error" showIcon :closable="false" />
    <el-alert
      v-if="authStore.user && !authStore.user.hasPassword"
      class="passwordAlert"
      title="你还没有设置密码"
      description="设置密码后，除了验证码外，也可以使用手机号和密码登录。"
      type="warning"
      showIcon
      :closable="false">
      <template #default>
        <el-button type="warning" plain size="small" @click="passwordVisible = true">立即设置</el-button>
      </template>
    </el-alert>

    <section class="accountGrid">
      <article class="profileCard panelCard">
        <div class="profileAvatar">{{ identity.slice(0, 1).toUpperCase() }}</div>
        <div class="profileInfo">
          <p class="eyebrow">登录账号</p>
          <h2>{{ identity }}</h2>
          <div class="profileTags">
            <el-tag v-if="authStore.user?.phone" round>手机号账号</el-tag>
            <el-tag v-if="authStore.user?.email" type="info" round>邮箱账号</el-tag>
            <el-tag v-if="authStore.user?.isWhitelist" type="success" round>视频畅享</el-tag>
          </div>
        </div>
        <el-button round @click="passwordVisible = true">{{ authStore.user?.hasPassword ? "修改密码" : "设置密码" }}</el-button>
      </article>

      <article class="creditCard panelCard">
        <p class="eyebrow">积分账户</p>
        <div class="creditValue">{{ userAppStore.availableCredits.toLocaleString() }} <small>积分</small></div>
        <p v-if="userAppStore.frozenCredits">其中 {{ userAppStore.frozenCredits }} 积分正在任务中使用</p>
        <p v-else>当前没有冻结中的积分</p>
        <span v-if="authStore.user?.isWhitelist" class="whitelistHint">视频生成不扣积分，文本与图片按正常价格结算。</span>
      </article>
    </section>

    <section class="contentSection" aria-labelledby="sessionsTitle">
      <div class="sectionHeading">
        <div>
          <p class="eyebrow">账户安全</p>
          <h2 id="sessionsTitle">登录设备</h2>
        </div>
        <span>最多保留 2 个有效登录</span>
      </div>
      <div class="sessionList panelCard">
        <article v-for="session in sessions" :key="session.id" class="sessionRow">
          <span class="sessionIcon"><component :is="sessionIcon(session.userAgent)" :size="21" aria-hidden="true" /></span>
          <span class="sessionInfo">
            <strong>{{ sessionName(session.userAgent) }}</strong>
            <small>最近使用 {{ formatDate(session.lastUsedAt) }}<template v-if="session.ipAddress"> · {{ session.ipAddress }}</template></small>
          </span>
          <el-tag v-if="session.current" type="success" effect="light" round>当前设备</el-tag>
          <el-button v-else type="danger" text :loading="revokingId === session.id" @click="revokeSession(session.id)">退出此设备</el-button>
        </article>
      </div>
    </section>

    <section class="contentSection" aria-labelledby="transactionsTitle">
      <div class="sectionHeading">
        <div>
          <p class="eyebrow">收支记录</p>
          <h2 id="transactionsTitle">积分流水</h2>
        </div>
        <span>流水仅供查看，不可修改</span>
      </div>
      <div v-if="userAppStore.transactions.length" class="transactionList panelCard">
        <article v-for="transaction in userAppStore.transactions" :key="transaction.id" class="transactionRow">
          <span class="transactionIcon" :class="{ positive: transaction.availableDelta > 0 }">
            <component :is="transaction.availableDelta > 0 ? IconArrowUpRight : IconArrowDownRight" :size="19" aria-hidden="true" />
          </span>
          <span class="transactionInfo">
            <strong>{{ transactionLabels[transaction.type] }}</strong>
            <small>{{ formatDate(transaction.createdAt) }}</small>
          </span>
          <span class="transactionAmount" :class="{ positive: transaction.availableDelta > 0 }">
            {{ transaction.availableDelta > 0 ? "+" : "" }}{{ transaction.availableDelta }}
            <small>余额 {{ transaction.availableAfter }}</small>
          </span>
        </article>
      </div>
      <p v-else class="quietEmpty">暂无积分流水。</p>
    </section>

    <el-dialog v-model="passwordVisible" :title="authStore.user?.hasPassword ? '修改密码' : '设置密码'" width="min(420px, calc(100vw - 32px))" alignCenter appendToBody>
      <el-form labelPosition="top" @submit.prevent="savePassword">
        <el-form-item label="新密码">
          <el-input v-model="passwordForm.password" type="password" showPassword autocomplete="new-password" placeholder="至少 8 位" @keyup.enter="savePassword" />
        </el-form-item>
        <el-form-item label="再次输入">
          <el-input v-model="passwordForm.confirm" type="password" showPassword autocomplete="new-password" placeholder="再次输入新密码" @keyup.enter="savePassword" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingPassword" @click="savePassword">保存密码</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  IconArrowDownRight, IconArrowUpRight, IconDeviceDesktop, IconDeviceMobile,
  IconLogout,
} from "@tabler/icons-vue";
import api, { apiErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { useUserAppStore, type CreditTransaction } from "@/stores/userApp";
import { formatDate } from "./appFormat";

type Session = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
};
type ApiResponse<T> = { code: number; data: T; message: string };

const router = useRouter();
const authStore = useAuthStore();
const userAppStore = useUserAppStore();
const loading = ref(false);
const errorMessage = ref("");
const sessions = ref<Session[]>([]);
const revokingId = ref("");
const passwordVisible = ref(false);
const savingPassword = ref(false);
const passwordForm = reactive({ password: "", confirm: "" });
const identity = computed(() => authStore.user?.phone || authStore.user?.email || "创作者");
const transactionLabels: Record<CreditTransaction["type"], string> = {
  adminGrant: "积分到账",
  taskFreeze: "任务冻结",
  taskSettle: "任务结算",
  taskRefund: "任务退款",
};

function sessionName(userAgent: string | null) {
  if (!userAgent) return "未知设备";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "浏览器";
  const system = /Windows/i.test(userAgent) ? "Windows" : /Android/i.test(userAgent) ? "Android" : /iPhone|iPad/i.test(userAgent) ? "iOS" : /Mac OS/i.test(userAgent) ? "macOS" : "设备";
  return `${system} · ${browser}`;
}

function sessionIcon(userAgent: string | null) {
  return /Android|iPhone|iPad/i.test(userAgent || "") ? IconDeviceMobile : IconDeviceDesktop;
}

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [, response] = await Promise.all([
      userAppStore.loadAccount(),
      api.get<ApiResponse<Session[]>>("/auth/sessions/get"),
    ]);
    sessions.value = response.data.data;
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "账户信息加载失败");
  } finally {
    loading.value = false;
  }
}

async function revokeSession(sessionId: string) {
  const confirmed = await ElMessageBox.confirm("退出后，该设备需要重新登录。", "退出登录设备", {
    confirmButtonText: "确认退出",
    cancelButtonText: "取消",
    type: "warning",
  }).then(() => true, () => false);
  if (!confirmed) return;
  revokingId.value = sessionId;
  try {
    await api.delete("/auth/sessions/revoke", { data: { sessionId } });
    sessions.value = sessions.value.filter(session => session.id !== sessionId);
    ElMessage.success("设备已退出");
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, "退出设备失败"));
  } finally {
    revokingId.value = "";
  }
}

async function savePassword() {
  if (passwordForm.password.length < 8) return ElMessage.warning("密码至少需要 8 位");
  if (passwordForm.password !== passwordForm.confirm) return ElMessage.warning("两次输入的密码不一致");
  savingPassword.value = true;
  try {
    await authStore.setPassword(passwordForm.password);
    passwordForm.password = "";
    passwordForm.confirm = "";
    passwordVisible.value = false;
    ElMessage.success("密码已保存");
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, "密码保存失败"));
  } finally {
    savingPassword.value = false;
  }
}

async function logout() {
  await authStore.logout();
  await router.replace("/login");
}

onMounted(load);
</script>

<style scoped lang="scss">
.accountPage {
  .passwordAlert { margin-top: 24px; :deep(.el-alert__content) { width: 100%; } :deep(.el-alert__description) { margin-right: 110px; } :deep(.el-alert__content > .el-button) { position: absolute; right: 18px; top: 50%; transform: translateY(-50%); } }

  .accountGrid {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(260px, 0.8fr);
    gap: 16px;
    margin-top: 28px;

    .profileCard {
      display: flex;
      align-items: center;
      gap: 17px;

      .profileAvatar {
        display: grid;
        width: 58px;
        height: 58px;
        flex-shrink: 0;
        place-items: center;
        border-radius: 18px;
        background: linear-gradient(145deg, var(--studioAccent), #8b5cf6);
        color: white;
        font-size: 20px;
        font-weight: 700;
      }

      .profileInfo {
        flex: 1;
        min-width: 0;
        h2 { margin: 3px 0 9px; overflow: hidden; font-size: 20px; text-overflow: ellipsis; white-space: nowrap; }
        .profileTags { display: flex; flex-wrap: wrap; gap: 6px; }
      }
    }

    .creditCard {
      background: linear-gradient(145deg, var(--studioAccentSoft), var(--studioSurface));
      .creditValue { margin: 11px 0 7px; color: var(--studioText); font-size: 34px; font-weight: 750; letter-spacing: -1px; small { font-size: 12px; font-weight: 500; } }
      > p:not(.eyebrow), .whitelistHint { color: var(--studioMuted); font-size: 12px; }
      .whitelistHint { display: block; margin-top: 10px; line-height: 1.6; }
    }
  }

  .sessionList,
  .transactionList {
    padding: 0;
    overflow: hidden;
  }

  .sessionRow,
  .transactionRow {
    display: flex;
    align-items: center;
    gap: 13px;
    min-height: 70px;
    padding: 13px 18px;
    + article { border-top: 1px solid var(--studioBorder); }
  }

  .sessionIcon,
  .transactionIcon {
    display: grid;
    width: 38px;
    height: 38px;
    flex-shrink: 0;
    place-items: center;
    border-radius: 12px;
    background: var(--studioSurfaceMuted);
    color: var(--studioMuted);
    &.positive { background: var(--el-color-success-light-9); color: var(--el-color-success); }
  }

  .sessionInfo,
  .transactionInfo {
    display: grid;
    flex: 1;
    gap: 4px;
    min-width: 0;
    strong { font-size: 14px; }
    small { overflow: hidden; color: var(--studioMuted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  }

  .transactionAmount {
    display: grid;
    gap: 4px;
    color: var(--studioText);
    font-weight: 650;
    text-align: right;
    &.positive { color: var(--el-color-success); }
    small { color: var(--studioMuted); font-size: 11px; font-weight: 400; }
  }
}

@media (max-width: 760px) {
  .accountPage {
    .passwordAlert :deep(.el-alert__description) { margin-right: 0; }
    .passwordAlert :deep(.el-alert__content > .el-button) { position: static; margin-top: 10px; transform: none; }
    .accountGrid { grid-template-columns: 1fr; }
    .accountGrid .profileCard { align-items: flex-start; flex-wrap: wrap; .el-button { margin-left: 75px; } }
    .sessionRow, .transactionRow { padding-inline: 14px; }
  }
}
</style>
