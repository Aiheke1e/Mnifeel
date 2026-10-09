import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { readVideoCapability } from "@minifeel/tools-scaffold/runtime";
import type { VideoCapability } from "@minifeel/tools-scaffold/runtime";
import api from "@/lib/api";

type ApiResponse<T> = { code: number; data: T; message: string };

export type GenerationStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export type GenerationTask = {
  id: string;
  batchId: string;
  projectId: string;
  modelId: string;
  taskType: "text" | "image" | "video";
  status: GenerationStatus;
  requestSummary?: {
    input?: Record<string, unknown>;
    billing?: { billable?: boolean; estimatedUsage?: Record<string, number> };
    /** 冻结时的请求指纹；执行前与当前请求不一致则拒绝扣分。 */
    fingerprint?: string;
    /** 冻结时生效的视频能力版本。 */
    capabilityVersion?: number;
    /** 冻结时的引用角色与顺序，只保存工作区相对路径。 */
    references?: Array<{ role: string; dataType: string; path?: string }>;
  };
  result?: { files?: Array<{ path: string; mimeType: string; mediaType?: string }> } | null;
  progress: number;
  frozenCredits: number;
  actualCredits: number;
  refundedCredits: number;
  errorMessage: string | null;
  createdAt: string;
  startedAt?: string | null;
  heartbeatAt?: string | null;
  completedAt: string | null;
};

export type CreditTransaction = {
  id: string;
  taskId: string | null;
  type: "adminGrant" | "taskFreeze" | "taskSettle" | "taskRefund";
  availableDelta: number;
  frozenDelta: number;
  availableAfter: number;
  frozenAfter: number;
  createdAt: string;
};

export type PublicModel = {
  id: string;
  displayName: string;
  mediaType: "text" | "image" | "video";
  capabilities: Record<string, unknown>;
  isDefault: boolean;
  pricing: Record<string, number>;
  /** 只有显式声明并通过校验的视频能力才存在；未迁移的旧模型为 undefined。 */
  videoCapability?: VideoCapability;
};

export type GenerationEstimate = {
  taskType: "text" | "image" | "video";
  estimatedUsage: Record<string, number>;
  estimatedCredits: number;
  billable: boolean;
  /** 服务端按真实请求与引用文件生成的指纹；执行前需原样回传。 */
  fingerprint?: string;
};

export const useUserAppStore = defineStore("userApp", () => {
  const availableCredits = ref(0);
  const frozenCredits = ref(0);
  const transactions = ref<CreditTransaction[]>([]);
  const tasks = ref<GenerationTask[]>([]);
  const models = ref<PublicModel[]>([]);
  const accountLoaded = ref(false);
  const tasksLoaded = ref(false);
  const modelsLoaded = ref(false);
  const activeTaskCount = computed(() => tasks.value.filter(task => task.status === "pending" || task.status === "running").length);

  async function loadAccount(signal?: AbortSignal) {
    const { data } = await api.get<ApiResponse<{ availableCredits: number; frozenCredits: number; transactions: CreditTransaction[] }>>("/account/get", { signal });
    signal?.throwIfAborted();
    availableCredits.value = data.data.availableCredits;
    frozenCredits.value = data.data.frozenCredits;
    transactions.value = data.data.transactions;
    accountLoaded.value = true;
  }

  async function loadTasks(options: { projectId?: string; all?: boolean } = {}, signal?: AbortSignal) {
    // ACT: 项目页需要读取该项目完整任务记录（含候选与历史采用），按 projectId 分页拉全；
    // 任务中心与账户页保持单页最近记录。服务端单页上限 100。
    const limit = 100;
    let offset = 0;
    const collected: GenerationTask[] = [];
    for (;;) {
      const { data } = await api.get<ApiResponse<GenerationTask[]>>("/generation/list", {
        params: { ...(options.projectId ? { projectId: options.projectId } : {}), limit, offset },
        signal,
      });
      signal?.throwIfAborted();
      const page = data.data;
      collected.push(...page);
      if (!options.all || page.length < limit) break;
      offset += limit;
    }
    tasks.value = collected;
    tasksLoaded.value = true;
  }

  async function loadModels(signal?: AbortSignal) {
    const { data } = await api.get<ApiResponse<PublicModel[]>>("/models/get", { signal });
    signal?.throwIfAborted();
    models.value = data.data.map(model => ({ ...model, videoCapability: readVideoCapability(model.capabilities) }));
    modelsLoaded.value = true;
  }

  async function estimateGeneration(input: { projectId: string; modelId: string; request: Record<string, unknown> }) {
    const { data } = await api.post<ApiResponse<GenerationEstimate>>("/generation/estimate", input);
    return data.data;
  }

  async function cancelTask(taskId: string) {
    const { data } = await api.post<ApiResponse<GenerationTask>>("/generation/cancel", { taskId });
    const index = tasks.value.findIndex(task => task.id === taskId);
    if (index >= 0) tasks.value[index] = data.data;
    await loadAccount();
  }

  return {
    availableCredits,
    frozenCredits,
    transactions,
    tasks,
    models,
    accountLoaded,
    tasksLoaded,
    modelsLoaded,
    activeTaskCount,
    loadAccount,
    loadTasks,
    loadModels,
    estimateGeneration,
    cancelTask,
  };
});
