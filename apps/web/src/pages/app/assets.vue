<template>
  <div class="assetsPage">
    <header class="pageHeader">
      <div>
        <p class="eyebrow">ASSET LIBRARY</p>
        <h1>我的资产</h1>
        <p>保存角色、场景和道具图片，在后续项目和剧集中继续使用。</p>
      </div>
      <el-button type="primary" :icon="IconFolderPlus" @click="createGroup">新建分组</el-button>
    </header>

    <el-alert v-if="errorMessage" :title="errorMessage" type="error" :closable="false" showIcon />

    <div class="assetWorkspace" v-loading="loading">
      <aside class="groupPanel" aria-label="资产分组">
        <button :class="{ active: selectedGroup === undefined }" @click="selectedGroup = undefined">
          <icon-layout-grid :size="18" /><span>全部资产</span><small>{{ files.length }}</small>
        </button>
        <button :class="{ active: selectedGroup === '' }" @click="selectedGroup = ''">
          <icon-photo :size="18" /><span>未分组</span><small>{{ rootFiles.length }}</small>
        </button>
        <div v-for="group in groups" :key="group.path" class="groupRow" :style="{ paddingLeft: `${12 + group.depth * 14}px` }">
          <button :class="{ active: selectedGroup === group.path }" @click="selectedGroup = group.path">
            <icon-folder :size="18" /><span>{{ group.name }}</span><small>{{ group.files.length }}</small>
          </button>
          <el-button text :icon="IconEdit" :aria-label="`重命名分组 ${group.name}`" @click="renameGroup(group)" />
        </div>
      </aside>

      <main class="assetContent">
        <div class="contentHeader">
          <div>
            <h2>{{ currentGroupName }}</h2>
            <span>{{ visibleFiles.length }} 个资产</span>
          </div>
          <el-input v-model="searchQuery" class="searchInput" :prefixIcon="IconSearch" placeholder="搜索资产" clearable />
        </div>

        <div v-if="visibleFiles.length" class="assetGrid">
          <article v-for="asset in visibleFiles" :key="asset.path" class="assetCard">
            <button class="previewButton" :aria-label="`预览 ${asset.name}`" @click="previewAsset(asset)">
              <el-image v-if="mediaKind(asset.name) === 'image'" :src="assetUrl(asset.path)" fit="cover" loading="lazy">
                <template #error><icon-photo :size="32" /></template>
              </el-image>
              <span v-else class="filePreview">
                <icon-video v-if="mediaKind(asset.name) === 'video'" :size="36" />
                <icon-music v-else-if="mediaKind(asset.name) === 'audio'" :size="36" />
                <icon-file v-else :size="36" />
              </span>
            </button>
            <div class="assetInfo">
              <div>
                <strong :title="asset.name">{{ displayName(asset.name) }}</strong>
                <span>{{ asset.group || "未分组" }}</span>
              </div>
              <el-button text :icon="IconEdit" :aria-label="`编辑 ${asset.name}`" @click="editAsset(asset)" />
            </div>
          </article>
        </div>
        <div v-else class="emptyAssets">
          <icon-photo :size="42" />
          <strong>这里还没有资产</strong>
          <span>图片生成成功后会自动保存在这里。</span>
        </div>
      </main>
    </div>

    <el-image-viewer v-if="preview?.kind === 'image'" :urlList="[preview.url]" teleported @close="preview = undefined" />
    <el-dialog :modelValue="preview?.kind === 'video'" :title="preview?.name" width="min(800px, calc(100vw - 32px))" alignCenter appendToBody destroyOnClose @update:modelValue="preview = undefined">
      <video v-if="preview?.kind === 'video'" class="previewVideo" :src="preview.url" controls playsinline />
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑资产" width="440px" alignCenter appendToBody :closeOnClickModal="false">
      <el-form labelPosition="top" @submit.prevent="saveAsset">
        <el-form-item label="资产名称">
          <el-input v-model="editName" maxlength="80" showWordLimit placeholder="例如：女主角小雨" />
        </el-form-item>
        <el-form-item label="所属分组">
          <el-select v-model="editGroup" placeholder="选择分组">
            <el-option label="未分组" value="" />
            <el-option v-for="group in groups" :key="group.path" :label="group.label" :value="group.path" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="saving" @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="!editName.trim() || /[\\/]/.test(editName)" @click="saveAsset">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { IconEdit, IconFile, IconFolder, IconFolderPlus, IconLayoutGrid, IconMusic, IconPhoto, IconSearch, IconVideo } from "@tabler/icons-vue";
import api, { apiErrorMessage } from "@/lib/api";

type AssetEntry = { name: string; path: string; type: "file" | "directory"; children?: AssetEntry[] };
type AssetFile = AssetEntry & { group: string };
type AssetGroup = AssetEntry & { depth: number; label: string; files: AssetFile[] };

const entries = ref<AssetEntry[]>([]);
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const searchQuery = ref("");
const selectedGroup = ref<string>();
const editVisible = ref(false);
const editName = ref("");
const editGroup = ref("");
const editingAsset = ref<AssetFile>();
const preview = ref<{ name: string; url: string; kind: "image" | "video" }>();

const rootFiles = computed(() => entries.value.filter(entry => entry.type === "file").map(entry => ({ ...entry, group: "" })));
const groups = computed<AssetGroup[]>(() => {
  function flatten(items: AssetEntry[], depth = 0): AssetGroup[] {
    return items.filter(item => item.type === "directory").flatMap(item => {
      const directFiles = (item.children ?? []).filter(child => child.type === "file").map(child => ({ ...child, group: item.path }));
      return [{ ...item, depth, label: `${"　".repeat(depth)}${item.name}`, files: directFiles }, ...flatten(item.children ?? [], depth + 1)];
    });
  }
  return flatten(entries.value);
});
const files = computed(() => [...rootFiles.value, ...groups.value.flatMap(group => group.files)]);
const visibleFiles = computed(() => {
  const scoped = selectedGroup.value === undefined ? files.value : selectedGroup.value === "" ? rootFiles.value : groups.value.find(group => group.path === selectedGroup.value)?.files ?? [];
  const query = searchQuery.value.trim().toLocaleLowerCase();
  return query ? scoped.filter(asset => asset.name.toLocaleLowerCase().includes(query)) : scoped;
});
const currentGroupName = computed(() => selectedGroup.value === undefined ? "全部资产" : selectedGroup.value === "" ? "未分组" : groups.value.find(group => group.path === selectedGroup.value)?.name ?? "资产");

onMounted(loadAssets);

function assetUrl(path: string) {
  return `/api/myAssets/read?path=${encodeURIComponent(path)}`;
}

function extension(name: string) {
  return name.match(/\.[^./\\]+$/)?.[0] ?? "";
}

function displayName(name: string) {
  const suffix = extension(name);
  return suffix ? name.slice(0, -suffix.length) : name;
}

function mediaKind(name: string) {
  if (/\.(avif|apng|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(name)) return "image";
  if (/\.(mp4|m4v|webm|mov|mkv|avi|ogv)$/i.test(name)) return "video";
  if (/\.(mp3|wav|ogg|opus|flac|m4a|aac)$/i.test(name)) return "audio";
  return "file";
}

async function loadAssets() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const { data } = await api.get<{ data: { entries: AssetEntry[] } }>("/myAssets/list");
    entries.value = data.data.entries;
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "资产加载失败");
  } finally {
    loading.value = false;
  }
}

async function createGroup() {
  try {
    const { value } = await ElMessageBox.prompt("给角色、场景或道具建立分组", "新建分组", {
      inputPlaceholder: "例如：主要角色",
      inputPattern: /^[^\\/]+$/,
      inputValidator: value => !!value?.trim() || "请输入分组名称",
      inputErrorMessage: "名称不能包含斜杠",
      confirmButtonText: "创建",
      cancelButtonText: "取消",
    });
    await api.post("/myAssets/mkdir", { path: value.trim() });
    await loadAssets();
    selectedGroup.value = value.trim();
  } catch (error) {
    if (error !== "cancel" && error !== "close") ElMessage.error(apiErrorMessage(error, "分组创建失败"));
  }
}

async function renameGroup(group: AssetGroup) {
  try {
    const { value } = await ElMessageBox.prompt("分组名称", "重命名分组", {
      inputValue: group.name,
      inputPattern: /^[^\\/]+$/,
      inputValidator: value => !!value?.trim() || "请输入分组名称",
      inputErrorMessage: "名称不能包含斜杠",
      confirmButtonText: "保存",
      cancelButtonText: "取消",
    });
    const parent = group.path.split("/").slice(0, -1).join("/");
    const target = parent ? `${parent}/${value.trim()}` : value.trim();
    await api.post("/myAssets/rename", { path: group.path, target });
    if (selectedGroup.value === group.path) selectedGroup.value = target;
    await loadAssets();
  } catch (error) {
    if (error !== "cancel" && error !== "close") ElMessage.error(apiErrorMessage(error, "分组重命名失败"));
  }
}

function editAsset(asset: AssetFile) {
  editingAsset.value = asset;
  editName.value = displayName(asset.name);
  editGroup.value = asset.group;
  editVisible.value = true;
}

async function saveAsset() {
  const asset = editingAsset.value;
  const name = editName.value.trim();
  if (!asset || !name || /[\\/]/.test(name) || saving.value) return;
  const targetName = `${name}${extension(asset.name)}`;
  const target = editGroup.value ? `${editGroup.value}/${targetName}` : targetName;
  saving.value = true;
  try {
    await api.post("/myAssets/rename", { path: asset.path, target });
    editVisible.value = false;
    ElMessage.success("资产已更新");
    await loadAssets();
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, "资产保存失败"));
  } finally {
    saving.value = false;
  }
}

function previewAsset(asset: AssetFile) {
  const kind = mediaKind(asset.name);
  if (kind === "image" || kind === "video") preview.value = { name: asset.name, url: assetUrl(asset.path), kind };
}
</script>

<style scoped lang="scss">
.assetsPage {
  min-height: 100dvh;
  padding: 42px clamp(20px, 4vw, 56px);

  .pageHeader {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 24px;
    max-width: 1180px;
    margin: 0 auto 28px;

    .eyebrow { margin: 0 0 8px; color: var(--studioAccent); font-size: 11px; font-weight: 700; letter-spacing: 1.5px; }
    h1 { margin: 0; color: var(--studioText); font-size: 36px; letter-spacing: -1.2px; }
    p:last-child { margin: 8px 0 0; color: var(--studioMuted); }
  }

  .assetWorkspace {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 18px;
    max-width: 1180px;
    min-height: 560px;
    margin: 18px auto 0;
  }

  .groupPanel,
  .assetContent {
    border: 1px solid var(--studioBorder);
    border-radius: 18px;
    background: var(--studioSurface);
  }

  .groupPanel {
    padding: 10px;

    > button,
    .groupRow button {
      display: flex;
      align-items: center;
      gap: 9px;
      width: 100%;
      min-height: 42px;
      padding: 0 10px;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: var(--studioMuted);
      font: inherit;
      text-align: left;
      cursor: pointer;
      span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      small { font-size: 11px; }
      &.active { background: var(--studioAccentSoft); color: var(--studioAccent); }
    }

    .groupRow {
      display: flex;
      align-items: center;
      button:first-child { min-width: 0; }
      .el-button { width: 30px; flex-shrink: 0; margin: 0; padding: 0; }
    }
  }

  .assetContent { padding: 20px; }
  .contentHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 18px;
    h2 { margin: 0 0 3px; color: var(--studioText); font-size: 20px; }
    span { color: var(--studioMuted); font-size: 12px; }
    .searchInput { width: min(260px, 45%); }
  }

  .assetGrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 14px;
  }

  .assetCard {
    overflow: hidden;
    border: 1px solid var(--studioBorder);
    border-radius: 14px;
    background: var(--studioSurfaceMuted);
    .previewButton { width: 100%; aspect-ratio: 1; padding: 0; border: 0; background: var(--studioBackground); cursor: pointer; }
    .el-image, .filePreview { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; color: var(--studioMuted); }
    .assetInfo { display: flex; align-items: center; gap: 6px; padding: 10px; }
    .assetInfo > div { display: grid; flex: 1; min-width: 0; gap: 3px; }
    strong, span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    strong { color: var(--studioText); font-size: 13px; }
    span { color: var(--studioMuted); font-size: 11px; }
    .el-button { width: 28px; margin: 0; padding: 0; }
  }

  .emptyAssets {
    display: grid;
    min-height: 360px;
    place-content: center;
    justify-items: center;
    gap: 8px;
    color: var(--studioMuted);
    strong { color: var(--studioText); }
    span { font-size: 12px; }
  }
}

.previewVideo { display: block; width: 100%; max-height: 68dvh; background: #000; }

@media (max-width: 760px) {
  .assetsPage {
    padding: 24px 14px;
    .pageHeader { align-items: flex-start; flex-direction: column; h1 { font-size: 30px; } }
    .assetWorkspace { grid-template-columns: 1fr; }
    .groupPanel { display: flex; overflow-x: auto; .groupRow { flex-shrink: 0; padding-left: 0 !important; } > button, .groupRow button { width: auto; min-width: max-content; } }
    .contentHeader { align-items: stretch; flex-direction: column; .searchInput { width: 100%; } }
    .assetGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
}
</style>
