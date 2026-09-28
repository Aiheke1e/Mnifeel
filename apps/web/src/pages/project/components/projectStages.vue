<template>
  <nav class="projectStages" aria-label="创作步骤">
    <button
      v-for="(stage, index) in stages"
      :key="stage.id"
      type="button"
      :aria-current="modelValue === stage.id ? 'step' : undefined"
      @click="emit('update:modelValue', stage.id)">
      <span class="stageNumber">{{ index + 1 }}</span>
      <span class="stageText"><strong>{{ stage.name }}</strong><small>{{ stage.caption }}</small></span>
    </button>
  </nav>
</template>

<script setup lang="ts">
export type ProjectStage = "script" | "characters" | "storyboard" | "video";

defineProps<{ modelValue: ProjectStage }>();
const emit = defineEmits<{ "update:modelValue": [value: ProjectStage] }>();
const stages: Array<{ id: ProjectStage; name: string; caption: string }> = [
  { id: "script", name: "写剧本", caption: "整理故事与对白" },
  { id: "characters", name: "定角色", caption: "确认人物形象" },
  { id: "storyboard", name: "做分镜", caption: "设计画面节奏" },
  { id: "video", name: "生成视频", caption: "完成短剧片段" },
];
</script>

<style scoped lang="scss">
.projectStages {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
  margin: 22px 0;

  button {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
    min-height: 72px;
    padding: 12px 14px;
    border: 1px solid var(--studioBorder);
    border-radius: 15px;
    background: var(--studioSurface);
    color: var(--studioMuted);
    font: inherit;
    text-align: left;
    cursor: pointer;

    .stageNumber {
      display: grid;
      width: 30px;
      height: 30px;
      flex-shrink: 0;
      place-items: center;
      border-radius: 10px;
      background: var(--studioSurfaceMuted);
      font-size: 12px;
      font-weight: 700;
    }

    .stageText {
      display: grid;
      gap: 4px;
      min-width: 0;
      strong { color: var(--studioText); font-size: 13px; }
      small { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    }

    &[aria-current="step"] {
      border-color: var(--studioAccent);
      background: var(--studioAccentSoft);
      color: var(--studioAccent);
      .stageNumber { background: var(--studioAccent); color: white; }
    }

    &:focus-visible { outline: 2px solid var(--studioAccent); outline-offset: 2px; }
  }
}

@media (max-width: 850px) {
  .projectStages { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 480px) {
  .projectStages { grid-template-columns: 1fr; }
}
</style>
