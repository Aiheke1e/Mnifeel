<template>
  <nav class="projectStages" aria-label="创作步骤">
    <button
      v-for="(stage, index) in stages"
      :key="stage.id"
      type="button"
      :aria-current="modelValue === stage.id ? 'step' : undefined"
      :data-status="statuses[stage.id]"
      @click="emit('update:modelValue', stage.id)">
      <span class="stageNumber">{{ index + 1 }}</span>
      <span class="stageText"><strong>{{ stage.name }}</strong><small>{{ stage.caption }}</small></span>
      <span class="stageStatus">{{ statusLabels[statuses[stage.id]] }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
export type ProjectStage = "script" | "characters" | "storyboard" | "video";
export type ProjectStageStatus = "notStarted" | "running" | "review" | "complete" | "failed";

defineProps<{ modelValue: ProjectStage; statuses: Record<ProjectStage, ProjectStageStatus> }>();
const emit = defineEmits<{ "update:modelValue": [value: ProjectStage] }>();
const stages: Array<{ id: ProjectStage; name: string; caption: string }> = [
  { id: "script", name: "写剧本", caption: "整理故事与对白" },
  { id: "characters", name: "资产设定", caption: "确认角色、场景和道具" },
  { id: "storyboard", name: "做分镜", caption: "设计画面节奏" },
  { id: "video", name: "镜头制作", caption: "生成视频片段" },
];
const statusLabels: Record<ProjectStageStatus, string> = {
  notStarted: "未开始",
  running: "进行中",
  review: "待确认",
  complete: "已完成",
  failed: "需处理",
};
</script>

<style scoped lang="scss">
.projectStages {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;

  button {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) auto;
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

    .stageStatus {
      color: var(--studioMuted);
      font-size: 10px;
      white-space: nowrap;
    }

    &[data-status="running"] .stageStatus,
    &[data-status="review"] .stageStatus { color: var(--studioAccent); }
    &[data-status="complete"] .stageStatus { color: var(--el-color-success); }
    &[data-status="failed"] .stageStatus { color: var(--el-color-danger); }

    &[aria-current="step"] {
      border-color: var(--studioAccent);
      background: var(--studioAccentSoft);
      color: var(--studioAccent);
      .stageNumber { background: var(--studioAccent); color: white; }
    }

    &:focus-visible { outline: 2px solid var(--studioAccent); outline-offset: 2px; }
  }
}

@media (max-width: 720px) {
  .projectStages {
    grid-template-columns: repeat(4, minmax(172px, 1fr));
    overflow-x: auto;
    padding-bottom: 5px;
  }
}
</style>
