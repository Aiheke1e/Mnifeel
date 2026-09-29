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

export function friendlyTaskError(message: string | null) {
  if (!message) return "";
  if (/积分不足|insufficient.*credit/i.test(message)) return "积分不足，请联系管理员补充积分后重试";
  if (/模型.*(?:停用|禁用|不可用)|model.*(?:disabled|unavailable|not enabled)/i.test(message)) return "所选模型已停用，请重新选择模型";
  if (/任务.*(?:取消|已取消)|\bcancell?ed\b/i.test(message)) return "任务已取消，未消耗的积分已退回";
  if (/服务.*(?:重启|恢复|中断)|(?:worker|server).*(?:restart|stale)|heartbeat.*(?:lost|timeout)/i.test(message)) return "服务重启后任务未能恢复，冻结积分已退回，请重新生成";
  if (/request was aborted|operation was aborted|aborterror/i.test(message)) return "生成连接已中断，请重试";
  if (/socket connection was closed|connection.*closed|econnreset|供应商.*连接/i.test(message)) return "模型供应商连接失败，请稍后重试；持续失败请联系管理员检查配置";
  if (/\b429\b|too many requests|限频|频率限制|每分钟|一分钟/i.test(message)) return "模型服务正在限频，请按提示稍后再试";
  if (/\b503\b|service unavailable|供应商.*不可用/i.test(message)) return "模型供应商暂时不可用，请稍后重试；持续失败请联系管理员";
  if (/\b403\b|forbidden/i.test(message)) return "模型服务拒绝请求，请检查供应商配置";
  return /[\u4e00-\u9fff]/.test(message) ? message : "生成失败，请稍后重试";
}
