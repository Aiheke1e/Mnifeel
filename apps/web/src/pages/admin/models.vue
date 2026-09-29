<template>
  <section class="adminPage">
    <header class="pageHeader"><div><span>MODEL CATALOG</span><h1>模型与计费</h1><p>用户只能选择这里启用的模型，默认模型按媒体类型唯一生效。</p></div><el-button :icon="IconRefresh" :loading="loading" @click="loadModels">刷新</el-button></header>
    <div class="filters"><el-segmented v-model="mediaFilter" :options="mediaOptions" /><span>共 {{ filteredModels.length }} 个模型</span></div>
    <el-table v-loading="loading" :data="filteredModels" rowKey="id" class="modelTable">
      <el-table-column label="模型" minWidth="210"><template #default="scope"><strong>{{ scope.row.displayName }}</strong><small>{{ scope.row.upstreamModelId }}</small></template></el-table-column>
      <el-table-column prop="providerDisplayName" label="供应商" width="150" /><el-table-column label="类型" width="90"><template #default="scope"><el-tag>{{ mediaText(scope.row.mediaType) }}</el-tag></template></el-table-column>
      <el-table-column label="状态" width="130"><template #default="scope"><el-tag :type="scope.row.enabled ? 'success' : 'info'">{{ scope.row.enabled ? "已启用" : "未启用" }}</el-tag><el-tag v-if="scope.row.isDefault" class="defaultTag">默认</el-tag></template></el-table-column>
      <el-table-column label="计价" minWidth="230"><template #default="scope">{{ pricingText(scope.row) }}</template></el-table-column>
      <el-table-column label="操作" width="100" fixed="right"><template #default="scope"><el-button size="small" @click="openEditor(scope.row)">编辑</el-button></template></el-table-column>
      <template #empty><el-empty description="暂无模型，请先到供应商页面同步" /></template>
    </el-table>
    <el-dialog v-model="editorVisible" title="编辑模型" width="min(620px, 92vw)">
      <el-form v-if="editing" labelPosition="top">
        <el-form-item label="显示名称"><el-input v-model="editing.displayName" maxlength="160" /></el-form-item>
        <div class="switches"><el-switch v-model="editing.enabled" activeText="允许用户使用" /><el-switch v-model="editing.isDefault" activeText="设为此类型默认模型" :disabled="!editing.enabled" /></div>
        <el-form-item :label="`价格（${pricingUnit(editing.mediaType)}）`">
          <div v-if="editing.mediaType === 'text'" class="pricingFields"><el-input-number v-model="editing.pricing.inputPerMillionTokens" :min="0" :max="1000000000" /><span>输入</span><el-input-number v-model="editing.pricing.outputPerMillionTokens" :min="0" :max="1000000000" /><span>输出</span></div>
          <div v-else-if="editing.mediaType === 'image'" class="pricingFields"><el-input-number v-model="editing.pricing.perImage" :min="0" :max="1000000000" /><span>每张图片</span></div>
          <div v-else class="pricingFields"><el-radio-group v-model="videoPricingMode"><el-radio-button value="perTask">每次任务</el-radio-button><el-radio-button value="perSecond">每秒</el-radio-button></el-radio-group><el-input-number v-model="videoPrice" :min="0" :max="1000000000" /></div>
        </el-form-item>
        <el-form-item label="能力参数（JSON）"><el-input v-model="capabilitiesText" type="textarea" :rows="6" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="editorVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveModel">保存</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { IconRefresh } from "@tabler/icons-vue";
import api, { apiErrorMessage } from "@/lib/api";

type MediaType = "text" | "image" | "video";
type Model = { id: string; upstreamModelId: string; displayName: string; providerDisplayName: string; mediaType: MediaType; enabled: boolean; isDefault: boolean; capabilities: Record<string, unknown>; pricing: Record<string, number> };
type ApiResponse<T> = { data: T };
const models = ref<Model[]>([]); const loading = ref(false); const saving = ref(false); const mediaFilter = ref<"all" | MediaType>("all"); const editorVisible = ref(false); const editing = ref<Model>(); const capabilitiesText = ref("{}"); const videoPricingMode = ref<"perTask" | "perSecond">("perTask"); const videoPrice = ref(0);
const mediaOptions = [{ label: "全部", value: "all" }, { label: "文本", value: "text" }, { label: "图片", value: "image" }, { label: "视频", value: "video" }];
const filteredModels = computed(() => mediaFilter.value === "all" ? models.value : models.value.filter(model => model.mediaType === mediaFilter.value));
function mediaText(type: MediaType) { return { text: "文本", image: "图片", video: "视频" }[type]; }
function pricingUnit(type: MediaType) { return { text: "积分 / 百万 token", image: "积分 / 张", video: "积分 / 次或秒" }[type]; }
function pricingText(modelValue: unknown) { const model = modelValue as Model; if (model.mediaType === "text") return `输入 ${model.pricing.inputPerMillionTokens ?? 0} / 输出 ${model.pricing.outputPerMillionTokens ?? 0} 积分 / 百万 token`; if (model.mediaType === "image") return `${model.pricing.perImage ?? 0} 积分 / 张`; if ("perSecond" in model.pricing) return `${model.pricing.perSecond} 积分 / 秒`; return `${model.pricing.perTask ?? 0} 积分 / 次`; }
async function loadModels() { loading.value = true; try { const response = await api.get<ApiResponse<Model[]>>("/admin/models/get"); models.value = response.data.data; } catch (error) { ElMessage.error(apiErrorMessage(error, "读取模型失败")); } finally { loading.value = false; } }
function openEditor(modelValue: unknown) { const model = modelValue as Model; editing.value = { ...model, capabilities: { ...model.capabilities }, pricing: { ...model.pricing } }; capabilitiesText.value = JSON.stringify(model.capabilities, null, 2); videoPricingMode.value = "perSecond" in model.pricing ? "perSecond" : "perTask"; videoPrice.value = model.pricing[videoPricingMode.value] ?? 0; editorVisible.value = true; }
async function saveModel() { if (!editing.value) return; let capabilities: Record<string, unknown>; try { const parsed: unknown = JSON.parse(capabilitiesText.value); if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error(); capabilities = parsed as Record<string, unknown>; } catch { return ElMessage.error("能力参数必须是 JSON 对象"); } saving.value = true; try { const pricing = editing.value.mediaType === "video" ? { [videoPricingMode.value]: videoPrice.value } : editing.value.pricing; await api.put("/admin/models/save", { modelId: editing.value.id, displayName: editing.value.displayName, mediaType: editing.value.mediaType, enabled: editing.value.enabled, isDefault: editing.value.isDefault, capabilities, pricing }); editorVisible.value = false; await loadModels(); ElMessage.success("模型配置已保存"); } catch (error) { ElMessage.error(apiErrorMessage(error, "保存模型失败")); } finally { saving.value = false; } }
onMounted(loadModels);
</script>

<style scoped lang="scss">
.adminPage { max-width: 1360px; margin: 0 auto; padding: 38px clamp(18px, 3vw, 46px) 64px;
  .pageHeader { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px; } .pageHeader span { color: var(--el-color-primary); font-size: 11px; font-weight: 700; letter-spacing: 1.6px; } h1 { margin: 6px 0 8px; font-size: 30px; } p, small, .filters span { color: var(--el-text-color-secondary); } p { margin: 0; }
  .filters { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .modelTable { border: 1px solid var(--el-border-color-lighter); border-radius: 12px; } .modelTable strong, .modelTable small { display: block; } .modelTable small { margin-top: 4px; } .defaultTag { margin-left: 5px; }
  .switches { display: flex; gap: 24px; margin-bottom: 20px; } .pricingFields { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; width: 100%; }
}
</style>
