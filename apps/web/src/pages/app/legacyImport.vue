<template>
  <div class="legacyImportPage studioPage narrowPage" :aria-busy="loading || importing">
    <header class="importHeader">
      <router-link class="backLink" to="/app"><icon-arrow-left :size="18" aria-hidden="true" />返回首页</router-link>
      <p class="eyebrow">迁移旧项目</p>
      <h1>复制已有项目到当前账号</h1>
      <p>导入只会复制文件，原目录和原文件保持不变。完成后可直接使用高级工作台继续编辑。</p>
    </header>

    <el-alert v-if="errorMessage" class="pageAlert" :title="errorMessage" type="error" showIcon :closable="false" />
    <el-alert
      v-else-if="!loading && !configured"
      class="pageAlert"
      title="管理员尚未配置旧项目目录"
      description="请先在应用服务中设置 MINIFEEL_LEGACY_WORKSPACE_DIR，再重新打开本页面。"
      type="info"
      showIcon
      :closable="false" />

    <form v-if="configured" class="importForm panelCard" @submit.prevent="importProject">
      <div class="formHeading">
        <span><icon-copy :size="20" aria-hidden="true" /></span>
        <div>
          <h2>选择要复制的项目</h2>
          <p>仅显示管理员配置目录下的第一层文件夹。</p>
        </div>
      </div>

      <label class="fieldLabel" for="legacyProject">旧项目</label>
      <el-select id="legacyProject" v-model="form.legacyId" size="large" placeholder="选择旧项目" :loading="loading" @change="selectProject">
        <el-option v-for="project in projects" :key="project.id" :label="project.name" :value="project.id" />
      </el-select>

      <label class="fieldLabel" for="projectName">新项目名称</label>
      <el-input id="projectName" v-model="form.name" size="large" maxlength="120" showWordLimit placeholder="输入导入后的项目名称" />

      <p v-if="!loading && !projects.length" class="emptyMessage">配置目录下没有可导入的项目文件夹。</p>
      <p class="copyNotice"><icon-info-circle :size="17" aria-hidden="true" />导入过程不会移动、修改或删除旧项目。</p>

      <div class="formActions">
        <router-link class="textAction" to="/app">取消</router-link>
        <el-button nativeType="submit" type="primary" size="large" round :loading="importing" :disabled="!form.legacyId || !form.name.trim()">
          复制并打开项目
          <icon-arrow-right :size="17" aria-hidden="true" />
        </el-button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { IconArrowLeft, IconArrowRight, IconCopy, IconInfoCircle } from "@tabler/icons-vue";
import api, { apiErrorMessage } from "@/lib/api";
import { setProjectMode } from "@/lib/projectMode";
import { useWorkspaceStore } from "@/stores/workspace";

type LegacyProject = { id: string; name: string };
type LegacyResponse = { code: number; data: { configured: boolean; projects: LegacyProject[] }; message: string };

const router = useRouter();
const workspaceStore = useWorkspaceStore();
const loading = ref(true);
const importing = ref(false);
const configured = ref(false);
const projects = ref<LegacyProject[]>([]);
const errorMessage = ref("");
const suggestedName = ref("");
const form = reactive({ legacyId: "", name: "" });

onMounted(async () => {
  try {
    const { data } = await api.get<LegacyResponse>("/projects/legacy/get");
    configured.value = data.data.configured;
    projects.value = data.data.projects;
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "旧项目列表加载失败");
  } finally {
    loading.value = false;
  }
});

function selectProject(id: string) {
  const nextName = projects.value.find(project => project.id === id)?.name ?? "";
  if (!form.name.trim() || form.name === suggestedName.value) form.name = nextName;
  suggestedName.value = nextName;
}

async function importProject() {
  const name = form.name.trim();
  if (!form.legacyId || !name || importing.value) return;
  importing.value = true;
  errorMessage.value = "";
  try {
    const project = await workspaceStore.importLegacyProject(form.legacyId, name);
    setProjectMode("advanced");
    await router.push(`/app/projects/${project.id}/advanced`);
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "旧项目导入失败");
  } finally {
    importing.value = false;
  }
}
</script>

<style scoped lang="scss">
.legacyImportPage {
  .importHeader {
    max-width: 720px;
    margin-bottom: 32px;

    .backLink { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 42px; color: var(--studioMuted); text-decoration: none; }
    h1 { margin: 8px 0 12px; color: var(--studioText); font-size: clamp(30px, 5vw, 46px); line-height: 1.15; letter-spacing: -1.6px; }
    > p:last-child { margin: 0; color: var(--studioMuted); line-height: 1.7; }
  }

  .importForm {
    display: grid;
    gap: 13px;

    .formHeading {
      display: flex;
      align-items: flex-start;
      gap: 13px;
      margin-bottom: 8px;

      > span { display: grid; width: 38px; height: 38px; flex-shrink: 0; place-items: center; border-radius: 12px; background: var(--studioAccentSoft); color: var(--studioAccent); }
      h2 { margin: 1px 0 5px; color: var(--studioText); font-size: 18px; }
      p { margin: 0; color: var(--studioMuted); font-size: 12px; }
    }

    .fieldLabel { margin-top: 8px; color: var(--studioText); font-size: 13px; font-weight: 650; }
    :deep(.el-select), :deep(.el-input) { width: 100%; }
    :deep(.el-select__wrapper), :deep(.el-input__wrapper) { border-radius: 12px; }

    .emptyMessage { margin: 4px 0 0; color: var(--studioMuted); font-size: 13px; }
    .copyNotice { display: flex; align-items: center; gap: 7px; margin: 8px 0 0; color: var(--studioMuted); font-size: 12px; }

    .formActions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 18px;
      margin-top: 12px;

      .textAction { color: var(--studioMuted); text-decoration: none; }
      :deep(.el-button > span) { gap: 8px; }
    }
  }
}

@media (max-width: 620px) {
  .legacyImportPage .importForm .formActions {
    align-items: stretch;
    flex-direction: column-reverse;
    text-align: center;
    :deep(.el-button) { width: 100%; margin: 0; }
  }
}
</style>
