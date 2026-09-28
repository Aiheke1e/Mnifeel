import type { GenerationStatus, GenerationTask } from "@/stores/userApp";

export const taskTypeLabels: Record<GenerationTask["taskType"], string> = {
  text: "文本创作",
  image: "图片生成",
  video: "视频生成",
};

export const taskStatusLabels: Record<GenerationStatus, string> = {
  pending: "等待中",
  running: "生成中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

export const taskStatusTypes: Record<GenerationStatus, "info" | "primary" | "success" | "danger" | "warning"> = {
  pending: "info",
  running: "primary",
  succeeded: "success",
  failed: "danger",
  cancelled: "warning",
};

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export function taskCreditText(task: GenerationTask) {
  if (task.status === "succeeded") return `消耗 ${task.actualCredits} 积分`;
  if (task.refundedCredits) return `已退回 ${task.refundedCredits} 积分`;
  if (task.frozenCredits) return `冻结 ${task.frozenCredits} 积分`;
  return "0 积分";
}
