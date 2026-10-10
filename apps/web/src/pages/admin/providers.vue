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
        <div class="cardActions"><el-button type="primary" :loading="actionId === provider.type + 'save'" @click="saveProvider(provider)">保存</el-button><el-button :loading="actionId === provider.type + 'test'" :disabled="!provider.id" @click="testProvider(provider)">连接测试</el-button><el-button :loading="actionId === provider.type + 'sync'" :disabled="!provider.id || provider.connectionStatus !== 'passed'" @click="syncModels(provider)">同步模型</el-button><el-button :disabled="!provider.id || provider.connectionStatus !== 'passed'" @click="openDebugger(provider)">功能调试</el-button></div>
      </el-card>
    </div>

    <el-dialog v-model="debugVisible" :title="`${debugProvider?.displayName ?? ''} 功能调试`" width="min(720px, 92vw)" :closeOnClickModal="!debugging" :closeOnPressEscape="!debugging" :showClose="!debugging">
      <el-form labelPosition="top">
        <el-form-item label="模型">
          <el-select v-model="debugModelId" class="debugControl" :loading="modelLoading" placeholder="选择已同步模型">
            <el-option v-for="model in debugModels" :key="model.id" :label="model.displayName" :value="model.id"><span>{{ model.displayName }}</span><small>{{ model.upstreamModelId }}</small></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="提示词"><el-input v-model="debugPrompt" type="textarea" :rows="5" maxlength="100000" showWordLimit /></el-form-item>
        <el-form-item v-if="debugProvider?.type === 'agnes'" label="首帧图片 URL（可选，须公网可访问）"><el-input v-model="debugFirstFrameUrl" placeholder="https://example.com/first.png" /></el-form-item>
        <el-form-item v-if="debugProvider?.type === 'agnes'" label="参考图片 URL（可选，每行一个，最多 5 张）"><el-input v-model="debugReferenceUrls" type="textarea" :rows="3" placeholder="https://example.com/character.png" /></el-form-item>
        <el-form-item v-if="debugProvider?.type === 'bananaPro'" label="参考图（可选，最多 10 MB）">
          <input ref="referenceInput" class="fileInput" type="file" accept="image/jpeg,image/png,image/webp" aria-label="选择参考图" @change="selectReference" />
          <div class="referenceActions"><el-button @click="referenceInput?.click()">选择图片</el-button><span v-if="referenceImage">{{ referenceImage.name }}</span><el-button v-if="referenceImage" text type="danger" @click="clearReference">移除</el-button></div>
        </el-form-item>
      </el-form>

      <div v-if="debugResult?.type === 'text'" class="debugResult">
        <h3>文本输出</h3><pre>{{ debugResult.content }}</pre>
        <template v-if="debugResult.reasoning"><h3>推理内容</h3><pre>{{ debugResult.reasoning }}</pre></template>
        <div class="usage"><span>输入 {{ debugResult.usage.inputTokens }} token</span><span>输出 {{ debugResult.usage.outputTokens }} token</span><span>总计 {{ debugResult.usage.totalTokens }} token</span><span v-if="debugResult.usage.cachedInputTokens !== undefined">缓存命中 {{ debugResult.usage.cachedInputTokens }} token</span><span v-if="debugResult.usage.reasoningTokens !== undefined">推理 {{ debugResult.usage.reasoningTokens }} token</span></div>
      </div>
      <div v-else-if="debugResult?.type === 'image'" class="debugResult"><img :src="assetUrl(debugResult.asset)" alt="图片调试结果" /></div>
      <div v-else-if="debugResult?.type === 'video'" class="debugResult"><video :src="assetUrl(debugResult.asset)" controls playsinline aria-label="视频调试结果" /></div>

      <template #footer><el-button v-if="debugging" type="danger" plain @click="cancelDebug">取消调试</el-button><el-button v-else @click="debugVisible = false">关闭</el-button><el-button type="primary" :loading="debugging" :disabled="debugging || !debugModelId || !debugPrompt.trim()" @click="runDebug">开始调试</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { IconRefresh } from "@tabler/icons-vue";
import api, { apiErrorMessage } from "@/lib/api";

type ProviderType = "deepSeek" | "agnes" | "bananaPro";
type Provider = { id?: string; type: ProviderType; displayName: string; baseUrl: string; enabled: boolean; hasApiKey: boolean; connectionStatus: "pending" | "passed" | "failed"; lastTestedAt: string | null; lastTestMessage: string | null; apiKey?: string };
type Model = { id: string; providerId: string; upstreamModelId: string; displayName: string; mediaType: "text" | "image" | "video" };
type MediaAsset = { type: "url"; url: string; mimeType?: string } | { type: "base64"; data: string; mimeType: string };
type TokenUsage = { inputTokens: number; outputTokens: number; totalTokens: number; cachedInputTokens?: number; reasoningTokens?: number };
type DebugResult = { type: "text"; content: string; reasoning?: string; finishReason: string; usage: TokenUsage } | { type: "image" | "video"; asset: MediaAsset };
type ApiResponse<T> = { data: T };

const providers = ref<Provider[]>([]);
const loading = ref(false);
const actionId = ref("");
const debugVisible = ref(false);
const debugProvider = ref<Provider>();
const debugModels = ref<Model[]>([]);
const debugModelId = ref("");
const debugPrompt = ref("");
const debugFirstFrameUrl = ref("");
const debugReferenceUrls = ref("");
const debugResult = ref<DebugResult>();
const modelLoading = ref(false);
const debugging = ref(false);
const referenceInput = ref<HTMLInputElement>();
const referenceImage = ref<{ name: string; data: string; mimeType: string }>();
let debugController: AbortController | undefined;

function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }
function statusText(status: Provider["connectionStatus"]) { return { pending: "待测试", passed: "已通过", failed: "失败" }[status]; }
function statusType(status: Provider["connectionStatus"]) { return status === "passed" ? "success" : status === "failed" ? "danger" : "info"; }
function assetUrl(asset: MediaAsset) { return asset.type === "url" ? asset.url : `data:${asset.mimeType};base64,${asset.data}`; }
async function loadProviders() { loading.value = true; try { const response = await api.get<ApiResponse<Provider[]>>("/admin/providers/get"); const saved = new Map(response.data.data.map(provider => [provider.type, provider])); providers.value = ([{ type: "deepSeek", displayName: "DeepSeek" }, { type: "agnes", displayName: "Agnes" }, { type: "bananaPro", displayName: "BananaPro" }] as const).map(item => ({ id: undefined, baseUrl: "", enabled: false, hasApiKey: false, connectionStatus: "pending", lastTestedAt: null, lastTestMessage: null, ...item, ...saved.get(item.type), apiKey: "" })); } catch (error) { ElMessage.error(apiErrorMessage(error, "读取供应商失败")); } finally { loading.value = false; } }
async function saveProvider(provider: Provider) { actionId.value = provider.type + "save"; try { await api.put("/admin/providers/save", { type: provider.type, displayName: provider.displayName, baseUrl: provider.baseUrl, enabled: provider.enabled, ...(provider.apiKey?.trim() ? { apiKey: provider.apiKey.trim() } : {}) }); await loadProviders(); ElMessage.success("供应商配置已保存"); } catch (error) { ElMessage.error(apiErrorMessage(error, "保存供应商失败")); } finally { actionId.value = ""; } }
async function testProvider(provider: Provider) { if (!provider.id) return; actionId.value = provider.type + "test"; try { await api.post("/admin/providers/test", { providerId: provider.id }); await loadProviders(); ElMessage.success("连接测试通过"); } catch (error) { await loadProviders(); ElMessage.error(apiErrorMessage(error, "连接测试失败")); } finally { actionId.value = ""; } }
async function syncModels(provider: Provider) { if (!provider.id) return; actionId.value = provider.type + "sync"; try { const response = await api.post<ApiResponse<{ count: number }>>("/admin/providers/syncModels", { providerId: provider.id }); ElMessage.success(`已同步 ${response.data.data.count} 个模型`); } catch (error) { ElMessage.error(apiErrorMessage(error, "同步模型失败")); } finally { actionId.value = ""; } }

async function openDebugger(provider: Provider) {
  if (!provider.id) return;
  debugProvider.value = provider;
  debugModels.value = [];
  debugModelId.value = "";
  debugPrompt.value = "";
  debugFirstFrameUrl.value = "";
  debugReferenceUrls.value = "";
  debugResult.value = undefined;
  clearReference();
  debugVisible.value = true;
  modelLoading.value = true;
  try {
    const response = await api.get<ApiResponse<Model[]>>("/admin/models/get");
    debugModels.value = response.data.data.filter(model => model.providerId === provider.id);
    debugModelId.value = debugModels.value[0]?.id ?? "";
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, "读取模型失败"));
  } finally {
    modelLoading.value = false;
  }
}

function clearReference() {
  referenceImage.value = undefined;
  if (referenceInput.value) referenceInput.value.value = "";
}

async function selectReference(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return clearReference();
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { clearReference(); return ElMessage.error("请选择 JPG、PNG 或 WebP 图片"); }
  if (file.size > 10 * 1024 * 1024) { clearReference(); return ElMessage.error("参考图不能超过 10 MB"); }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("读取参考图失败"));
    reader.onerror = () => reject(reader.error ?? new Error("读取参考图失败"));
    reader.readAsDataURL(file);
  }).catch(error => { ElMessage.error(apiErrorMessage(error, "读取参考图失败")); return ""; });
  if (!dataUrl) return clearReference();
  const separator = dataUrl.indexOf(",");
  if (separator < 0) { clearReference(); return ElMessage.error("参考图格式无效"); }
  referenceImage.value = { name: file.name, mimeType: file.type, data: dataUrl.slice(separator + 1) };
}

async function runDebug() {
  const provider = debugProvider.value;
  const prompt = debugPrompt.value.trim();
  if (!provider?.id || !debugModelId.value || !prompt) return;
  const controller = new AbortController();
  debugController = controller;
  debugging.value = true;
  debugResult.value = undefined;
  try {
    const response = await api.post<ApiResponse<DebugResult>>("/admin/providers/debug", {
      providerId: provider.id,
      modelId: debugModelId.value,
      prompt,
      ...(provider.type === "bananaPro" && referenceImage.value ? { referenceImage: { data: referenceImage.value.data, mimeType: referenceImage.value.mimeType } } : {}),
      ...(provider.type === "agnes" ? {
        firstFrameUrl: debugFirstFrameUrl.value.trim() || undefined,
        referenceImageUrls: debugReferenceUrls.value.split("\n").map(item => item.trim()).filter(Boolean),
      } : {}),
    }, { signal: controller.signal });
    debugResult.value = response.data.data;
  } catch (error) {
    if (controller.signal.aborted) ElMessage.info("已取消调试");
    else ElMessage.error(apiErrorMessage(error, "模型调试失败"));
  } finally {
    if (debugController === controller) debugController = undefined;
    debugging.value = false;
  }
}

function cancelDebug() { debugController?.abort(); }
onBeforeUnmount(cancelDebug);
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
.debugControl { width: 100%; } .debugControl small { float: right; margin-left: 20px; color: var(--el-text-color-secondary); }
.fileInput { display: none; }
.referenceActions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.debugResult { margin-top: 8px; padding: 16px; border: 1px solid var(--el-border-color-lighter); border-radius: 10px; background: var(--el-fill-color-light);
  h3 { margin: 0 0 10px; font-size: 14px; } h3:not(:first-child) { margin-top: 18px; }
  pre { max-height: 260px; margin: 0; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: 1.6; }
  img, video { display: block; max-width: 100%; max-height: 520px; margin: 0 auto; border-radius: 8px; }
  .usage { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 14px; color: var(--el-text-color-secondary); font-size: 13px; }
}
</style>
