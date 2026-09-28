<template>
  <el-dialog
    v-model="visible"
    title="添加自定义媒体供应商"
    width="min(760px, 94vw)"
    alignCenter
    appendToBody
    destroyOnClose
    :closeOnClickModal="false"
    :closeOnPressEscape="!saving"
    :showClose="!saving">
    <el-scrollbar maxHeight="65vh">
      <div class="dialogContent">
        <el-form labelPosition="top" :disabled="saving" @submit.prevent>
          <el-form-item label="添加方式">
            <el-segmented v-model="activeTab" :options="addMethods" block ariaLabel="添加方式">
              <template #default="{ item }">
                <span class="methodOption">
                  <component :is="item.icon" :size="16" aria-hidden="true" />
                  {{ item.label }}
                </span>
              </template>
            </el-segmented>
          </el-form-item>
          <el-form-item v-if="activeTab === 'file'" label="供应商文件">
            <div class="fileSource">
              <input ref="fileInput" type="file" accept=".ts" hidden :disabled="saving" @change="readSourceFile" />
              <el-input :modelValue="fileName" :prefixIcon="IconFileCode" placeholder="尚未选择文件" readonly aria-label="已选择的供应商文件" />
              <el-button :icon="IconFolderOpen" @click="fileInput?.click()">选择文件</el-button>
            </div>
            <el-text class="fieldHint" type="info" size="small">支持 .ts 文件，最大 1 MB。</el-text>
          </el-form-item>
          <el-form-item v-else label="供应商代码">
            <el-input v-model="code" class="sourceInput" type="textarea" :rows="10" resize="none" aria-label="供应商代码" />
          </el-form-item>
        </el-form>
        <el-alert class="providerTips" title="没有供应商文件？可以让 AI 帮你生成" type="info" :closable="false" showIcon>
          <p>复制提示词发给其他 AI，按引导提供接口资料即可生成配置文件，随后在这里导入 .ts 文件或粘贴完整代码即可使用。</p>
          <el-button size="small" :icon="IconCopy" @click="copyPrompt">一键复制提示词</el-button>
          <details class="promptDetails" :open="promptExpanded" @toggle="promptExpanded = ($event.target as HTMLDetailsElement).open">
            <summary>查看完整提示词</summary>
            <el-input v-if="promptExpanded" :modelValue="providerPrompt" type="textarea" :rows="10" resize="none" readonly aria-label="供应商开发提示词" />
          </details>
        </el-alert>
        <el-alert v-if="formError" class="formError" :title="formError" type="error" :closable="false" showIcon />
      </div>
    </el-scrollbar>
    <template #footer>
      <el-button :disabled="saving" @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!source.trim()" @click="addProvider">确定添加供应商</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import axios from "axios";
import { computed, ref, shallowRef, watch } from "vue";
import { IconFileCode, IconCode, IconFolderOpen, IconCopy } from "@tabler/icons-vue";
import { ElMessage } from "element-plus";
import { invalidateNodeModels } from "@minifeel/nodes-scaffold/nodeAi";
import type { MediaProvider } from "./types";
import { providerPrompt } from "./providerPrompt";
import { writeClipboardText } from "@/lib/clipboard";

const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ added: [provider: MediaProvider] }>();
const activeTab = ref<"file" | "code">("file");
const addMethods = [
  { label: "文件导入", value: "file", icon: IconFileCode },
  { label: "粘贴代码", value: "code", icon: IconCode },
];
const promptExpanded = ref(false);
const code = ref("");
const fileSource = ref("");
const fileName = ref("");
const fileInput = ref<HTMLInputElement>();
const saving = ref(false);
const formError = ref("");
const addedProvider = shallowRef<MediaProvider>();
const source = computed(() => activeTab.value === "file" ? fileSource.value : code.value);

watch(activeTab, () => {
  formError.value = "";
  addedProvider.value = undefined;
});

watch(visible, value => {
  if (!value) return;
  activeTab.value = "file";
  promptExpanded.value = false;
  addedProvider.value = undefined;
  code.value = fileSource.value = fileName.value = formError.value = "";
});

async function readSourceFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  formError.value = "";
  try {
    if (!/\.ts$/i.test(file.name) || file.size > 1024 * 1024) throw new Error("请选择不超过 1 MB 的 .ts 文件");
    fileSource.value = await file.text();
    fileName.value = file.name;
  } catch (error) {
    fileSource.value = fileName.value = "";
    formError.value = error instanceof Error ? error.message : "读取文件失败";
  }
}

async function addProvider() {
  if (saving.value || !source.value.trim()) return;
  saving.value = true;
  formError.value = "";
  try {
    if (!addedProvider.value) {
      const { data } = await axios.post<{ data: MediaProvider }>("/api/providers/media/add", { source: source.value });
      addedProvider.value = data.data;
      emit("added", data.data);
      invalidateNodeModels("media");
    }
    invalidateNodeModels("media");
    visible.value = false;
  } catch (error) {
    const message = axios.isAxiosError(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : "添加失败，请重试";
    formError.value = message;
  } finally {
    saving.value = false;
  }
}

async function copyPrompt() {
  try {
    await writeClipboardText(providerPrompt);
    ElMessage.success("提示词已复制，发给其他 AI 后跟着回答问题即可");
  } catch {
    ElMessage.error("复制失败，请展开「查看完整提示词」后手动复制");
  }
}
</script>

<style lang="scss" scoped>
.dialogContent {
  padding: 4px;

  .methodOption {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 4px 0;
  }

  .fileSource {
    display: flex;
    width: 100%;
    gap: 8px;

    .el-input { min-width: 0; }
    .el-button { flex-shrink: 0; }
  }

  .fieldHint {
    margin-top: 6px;
  }

  .sourceInput :deep(.el-textarea__inner) {
    height: min(28vh, 240px);
    min-height: 140px;
  }

  .providerTips {
    align-items: flex-start;

    :deep(.el-alert__content) {
      flex: 1;
      min-width: 0;
    }

    p {
      margin: 6px 0 12px;
      line-height: 1.6;
    }

    .promptDetails {
      margin-top: 12px;

      summary {
        width: fit-content;
        color: var(--el-text-color-secondary);
        cursor: pointer;
        &:hover { color: var(--el-color-primary); }
      }

      .el-textarea { margin-top: 12px; }
    }
  }

  .formError {
    margin-top: 16px;
  }
}
</style>
