<template>
  <section class="directorPanel panelCard" aria-label="导演助手">
    <header class="directorHeader">
      <div>
        <p class="eyebrow">创作建议</p>
        <h3>导演助手</h3>
      </div>
      <el-button text size="small" :aria-expanded="visible" @click="visible = !visible">
        {{ visible ? "收起" : "展开" }}
      </el-button>
    </header>
    <div v-show="visible" class="directorContent">
      <agent v-model="visible" mode="guided" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import agent from "@/components/agent/index.vue";

const visible = ref(true);
</script>

<style scoped lang="scss">
.directorPanel {
  display: flex;
  min-height: 560px;
  flex-direction: column;
  padding: 0;
  overflow: hidden;

  .directorHeader {
    display: flex;
    min-height: 62px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--studioBorder);

    h3 { margin: 3px 0 0; color: var(--studioText); font-size: 15px; }
  }

  .directorContent {
    flex: 1;
    min-height: 0;
    height: 560px;
  }
}

@media (max-width: 1100px) {
  .directorPanel {
    min-height: 0;
    .directorContent { height: 520px; }
  }
}
</style>
