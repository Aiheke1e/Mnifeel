<template>
  <div class="workspaceMenu">
    <el-card shadow="never" :bodyStyle="{ padding: '5px 10px' }">
      <div class="menuContent">
        <el-button class="toolButton" text :loading="leaving" :aria-label="returnTitle" :title="returnTitle" @click="exitProject">
          <icon-arrow-left :size="17" aria-hidden="true" />
        </el-button>
        <el-button class="toolButton" text aria-label="设置" title="设置" @click="emit('openSettings')">
          <icon-settings :size="17" aria-hidden="true" />
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { IconArrowLeft, IconSettings } from "@tabler/icons-vue";

const props = defineProps<{ returnPath: string }>();

const emit = defineEmits<{ openSettings: [] }>();
const router = useRouter();
const leaving = ref(false);
const returnTitle = computed(() => props.returnPath.startsWith("/admin/") ? "返回项目列表" : "返回首页");

async function exitProject() {
  if (leaving.value) return;
  leaving.value = true;
  try {
    await router.push(props.returnPath);
  } finally {
    leaving.value = false;
  }
}
</script>

<style scoped lang="scss">
.workspaceMenu {
  .menuContent {
    display: flex;
    align-items: center;
    gap: 10px;

    .toolButton {
      width: 28px;
      height: 28px;
      margin: 0;
      padding: 0;
    }
  }
}
</style>
