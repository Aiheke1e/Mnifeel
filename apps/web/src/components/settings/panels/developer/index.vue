<template>
  <div class="developerPanel">
    <div class="developer" :class="{ blurred: developerLocked }" :inert="developerLocked">
      <div class="developerRow">
        <div class="toolDescription">
          <h3>Agent 系统提示词</h3>
          <p>编辑 Agent 的基础指令，保存后下一条消息生效。</p>
        </div>
        <el-button :icon="IconEdit" @click="systemPromptVisible = true">编辑提示词</el-button>
      </div>
      <div class="storageManager">
        <div class="developerRow">
          <div class="toolDescription">
            <h3>浏览器持久缓存</h3>
            <p>管理当前站点的 localStorage。导入会覆盖同名项，保留其他项。</p>
          </div>
          <div class="storageToolbar">
            <input ref="storageFileInput" type="file" accept=".json,application/json" hidden @change="importStorage" />
            <el-button :icon="IconFileUpload" :loading="importingStorage" :disabled="storageBusy" @click="storageFileInput?.click()">导入</el-button>
            <el-button :icon="IconDownload" :disabled="storageBusy" @click="exportStorage">导出</el-button>
            <el-button :icon="IconRefresh" :disabled="storageBusy" @click="loadStorage">刷新列表</el-button>
          </div>
        </div>
        <el-text v-if="storageError" type="danger" role="alert">{{ storageError }}</el-text>
        <el-text v-else-if="storageMessage" type="success" role="status">{{ storageMessage }}</el-text>
        <div v-for="entry in storageEntries" :key="entry.key" class="storageItem">
          <div class="storageHeader">
            <span class="storageKey">{{ entry.key || "（空键名）" }}</span>
            <div class="storageActions">
              <el-button :icon="IconEdit" text :disabled="storageBusy" :aria-label="`修改 ${entry.key}`" @click="editStorage(entry)">修改</el-button>
              <el-popconfirm title="确定删除这条缓存？" confirmButtonText="删除" cancelButtonText="取消" @confirm="writeStorage(entry, null)">
                <template #reference>
                  <el-button :icon="IconTrash" type="danger" text :disabled="storageBusy" :aria-label="`删除 ${entry.key}`">删除</el-button>
                </template>
              </el-popconfirm>
            </div>
          </div>
          <template v-if="editingKey === entry.key">
            <el-input v-model="storageValue" type="textarea" :rows="5" :disabled="storageBusy" :aria-label="`${entry.key} 的值`" />
            <div class="storageActions">
              <el-button :disabled="storageBusy" @click="editingKey = null">取消</el-button>
              <el-button type="primary" :loading="writingStorage" :disabled="storageBusy" @click="writeStorage(entry, storageValue)">保存</el-button>
            </div>
          </template>
          <div v-else class="storageValue">{{ entry.value }}</div>
        </div>
      </div>
    </div>
    <systemPromptDialog v-if="systemPromptVisible" v-model="systemPromptVisible" />
    <div v-if="developerLocked" class="developerConfirm">
      <icon-code :size="28" aria-hidden="true" />
      <h3>确认进入开发者选项</h3>
      <p>此功能仅供本地调试。修改或清除缓存可能导致界面设置丢失。</p>
      <el-button type="primary" @click="confirmDeveloper">确认并继续</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from "vue";
import { useDeveloperStore } from "@/stores/developer";
import downloadFile from "@/lib/downloadFile";
import { IconCode, IconFileUpload, IconDownload, IconRefresh, IconEdit, IconTrash } from "@tabler/icons-vue";

const developerStore = useDeveloperStore();
const systemPromptDialog = defineAsyncComponent(() => import("./systemPromptDialog.vue"));
const systemPromptVisible = ref(false);
const developerLocked = computed(() => !developerStore.developerConfirmed);
const storageEntries = ref<{ key: string; value: string }[]>([]);
const storageError = ref("");
const editingKey = ref<string | null>(null);
const storageValue = ref("");
const storageFileInput = ref<HTMLInputElement>();
const importingStorage = ref(false);
const writingStorage = ref(false);
const storageBusy = computed(() => importingStorage.value || writingStorage.value);
const storageMessage = ref("");

function readStorage() {
  return Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key) ?? ""]));
}

function saveStorage(entries: [string, string | null][]) {
  const previous = entries.map(([key]) => [key, localStorage.getItem(key)] as const);
  try {
    for (const [key, value] of entries) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  } catch (error) {
    for (const [key, value] of previous.reverse()) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    throw error;
  }
}

function confirmDeveloper() {
  developerStore.developerConfirmed = true;
  loadStorage();
}

async function importStorage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || storageBusy.value) return;
  importingStorage.value = true;
  storageError.value = "";
  storageMessage.value = "";
  try {
    const data: unknown = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
    if (!data || typeof data !== "object" || Array.isArray(data) || Object.values(data).some(value => typeof value !== "string")) {
      throw new Error("请选择键值均为字符串的 JSON 对象。");
    }
    const entries = Object.entries(data) as [string, string][];
    saveStorage(entries);
    loadStorage();
    storageMessage.value = `已导入 ${entries.length} 项，重新加载页面后生效。`;
  } catch (error) {
    storageError.value = error instanceof Error ? error.message : "导入缓存失败";
  } finally { importingStorage.value = false; }
}

async function exportStorage() {
  storageError.value = "";
  storageMessage.value = "";
  try {
    await downloadFile(new Blob([JSON.stringify(readStorage(), null, 2)], { type: "application/json" }), "minifeelLocalStorage.json");
  } catch (error) {
    storageError.value = error instanceof Error ? error.message : "导出缓存失败";
  }
}

function loadStorage() {
  storageError.value = "";
  storageMessage.value = "";
  try {
    storageEntries.value = Object.entries(readStorage()).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => ({ key, value }));
    editingKey.value = null;
  } catch (error) {
    storageError.value = error instanceof Error ? error.message : "读取缓存失败";
  }
}

function editStorage(entry: { key: string; value: string }) {
  editingKey.value = entry.key;
  storageValue.value = entry.value;
}

function writeStorage(entry: { key: string; value: string }, value: string | null) {
  if (storageBusy.value) return;
  writingStorage.value = true;
  storageError.value = "";
  storageMessage.value = "";
  try {
    if (readStorage()[entry.key] !== entry.value) throw new Error("这条数据已发生变化，请刷新列表后重试。");
    saveStorage([[entry.key, value]]);
    loadStorage();
    storageMessage.value = "已保存，重新加载页面后生效。";
  } catch (error) {
    storageError.value = error instanceof Error ? error.message : "更新缓存失败";
  } finally { writingStorage.value = false; }
}

loadStorage();
</script>

<style lang="scss" scoped>
.developerPanel {
  position: relative;
  height: 100%;
  overflow: hidden;

  .developer {
    display: flex;
    flex-direction: column;
    gap: 20px;
    height: 100%;
    overflow-y: auto;

    &.blurred { filter: blur(6px); user-select: none; pointer-events: none; }
  }

  .developerRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .toolDescription {
    h3 { margin: 0 0 8px; font-size: 14px; }
    p { margin: 0; color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.6; }
  }

  .storageManager { display: flex; flex-direction: column; gap: 12px; }
  .storageToolbar, .storageActions { display: flex; flex-wrap: wrap; gap: 8px; }
  .storageItem { padding: 12px; border: 1px solid var(--el-border-color-light); border-radius: var(--ui-radius); }
  .storageHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .storageKey { overflow-wrap: anywhere; font-weight: 600; }
  .storageValue { max-height: 120px; margin-top: 8px; overflow: auto; color: var(--el-text-color-secondary); font: 12px/1.6 monospace; white-space: pre-wrap; overflow-wrap: anywhere; }

  .developerConfirm {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 12px;
    padding: 32px;
    text-align: center;

    h3, p { margin: 0; }
    p { max-width: 440px; color: var(--el-text-color-secondary); line-height: 1.7; }
  }
}
</style>
