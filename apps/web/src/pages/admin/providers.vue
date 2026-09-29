<template>
  <section class="adminPage">
    <header class="pageHeader"><div><span>MODEL GATEWAY</span><h1>供应商配置</h1><p>密钥只会提交到本地服务并加密保存，页面不会回显已有密钥。</p></div><el-button :icon="IconRefresh" :loading="loading" @click="loadProviders">刷新</el-button></header>
    <div v-loading="loading" class="providerGrid">
      <el-card v-for="provider in providers" :key="provider.type" shadow="never">
        <template #header><div class="cardHeader"><div><strong>{{ provider.displayName }}</strong><small>{{ provider.type }}</small></div><el-tag :type="statusType(provider.connectionStatus)">{{ statusText(provider.connectionStatus) }}</el-tag></div></template>
        <el-form labelPosition="top">
          <el-form-item label="显示名称"><el-input v-model="provider.displayName" maxlength="120" /></el-form-item>
          <el-form-item label="API 地址"><el-input v-model="provider.baseUrl" /></el-form-item>
          <el-form-item :label="provider.hasApiKey ? '替换 API Key（已配置）' : 'API Key（未配置）'"><el-input v-model="provider.apiKey" type="password" showPassword autocomplete="new-password" :placeholder="provider.hasApiKey ? '留空则保留现有密钥' : '输入新的 API Key'" /></el-form-item>
          <el-form-item><el-switch v-model="provider.enabled" activeText="启用此供应商" /></el-form-item>
        </el-form>
        <p v-if="provider.lastTestMessage" class="testMessage">{{ provider.lastTestMessage }}<br /><small>{{ provider.lastTestedAt ? formatTime(provider.lastTestedAt) : "" }}</small></p>
        <div class="cardActions"><el-button type="primary" :loading="actionId === provider.type + 'save'" @click="saveProvider(provider)">保存</el-button><el-button :loading="actionId === provider.type + 'test'" :disabled="!provider.id" @click="testProvider(provider)">连接测试</el-button><el-button :loading="actionId === provider.type + 'sync'" :disabled="!provider.id || provider.connectionStatus !== 'passed'" @click="syncModels(provider)">同步模型</el-button></div>
      </el-card>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { IconRefresh } from "@tabler/icons-vue";
import api, { apiErrorMessage } from "@/lib/api";

type Provider = { id?: string; type: "deepSeek" | "agnes" | "bananaPro"; displayName: string; baseUrl: string; enabled: boolean; hasApiKey: boolean; connectionStatus: "pending" | "passed" | "failed"; lastTestedAt: string | null; lastTestMessage: string | null; apiKey?: string };
type ApiResponse<T> = { data: T };
const providers = ref<Provider[]>([]);
const loading = ref(false);
const actionId = ref("");

function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }
function statusText(status: Provider["connectionStatus"]) { return { pending: "待测试", passed: "已通过", failed: "失败" }[status]; }
function statusType(status: Provider["connectionStatus"]) { return status === "passed" ? "success" : status === "failed" ? "danger" : "info"; }
async function loadProviders() { loading.value = true; try { const response = await api.get<ApiResponse<Provider[]>>("/admin/providers/get"); const saved = new Map(response.data.data.map(provider => [provider.type, provider])); providers.value = ([{ type: "deepSeek", displayName: "DeepSeek" }, { type: "agnes", displayName: "Agnes" }, { type: "bananaPro", displayName: "BananaPro" }] as const).map(item => ({ id: undefined, baseUrl: "", enabled: false, hasApiKey: false, connectionStatus: "pending", lastTestedAt: null, lastTestMessage: null, ...item, ...saved.get(item.type), apiKey: "" })); } catch (error) { ElMessage.error(apiErrorMessage(error, "读取供应商失败")); } finally { loading.value = false; } }
async function saveProvider(provider: Provider) { actionId.value = provider.type + "save"; try { await api.put("/admin/providers/save", { type: provider.type, displayName: provider.displayName, baseUrl: provider.baseUrl, enabled: provider.enabled, ...(provider.apiKey?.trim() ? { apiKey: provider.apiKey.trim() } : {}) }); await loadProviders(); ElMessage.success("供应商配置已保存"); } catch (error) { ElMessage.error(apiErrorMessage(error, "保存供应商失败")); } finally { actionId.value = ""; } }
async function testProvider(provider: Provider) { if (!provider.id) return; actionId.value = provider.type + "test"; try { await api.post("/admin/providers/test", { providerId: provider.id }); await loadProviders(); ElMessage.success("连接测试通过"); } catch (error) { await loadProviders(); ElMessage.error(apiErrorMessage(error, "连接测试失败")); } finally { actionId.value = ""; } }
async function syncModels(provider: Provider) { if (!provider.id) return; actionId.value = provider.type + "sync"; try { const response = await api.post<ApiResponse<{ count: number }>>("/admin/providers/syncModels", { providerId: provider.id }); ElMessage.success(`已同步 ${response.data.data.count} 个模型`); } catch (error) { ElMessage.error(apiErrorMessage(error, "同步模型失败")); } finally { actionId.value = ""; } }
onMounted(loadProviders);
</script>

<style scoped lang="scss">
.adminPage { max-width: 1240px; margin: 0 auto; padding: 38px clamp(20px, 4vw, 52px) 64px;
  .pageHeader { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px; } .pageHeader span { color: var(--el-color-primary); font-size: 11px; font-weight: 700; letter-spacing: 1.6px; } h1 { margin: 6px 0 8px; font-size: 30px; } p, small { color: var(--el-text-color-secondary); } p { margin: 0; }
  .providerGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 18px; }
  .cardHeader { display: flex; align-items: center; justify-content: space-between; } .cardHeader strong, .cardHeader small { display: block; } .cardHeader small { margin-top: 3px; }
  .testMessage { min-height: 42px; margin: 2px 0 16px; padding: 10px; border-radius: 8px; background: var(--el-fill-color-light); font-size: 13px; line-height: 1.5; }
  .cardActions { display: flex; flex-wrap: wrap; gap: 8px; } .cardActions .el-button { margin: 0; }
}
</style>
