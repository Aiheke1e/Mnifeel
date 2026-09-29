import { computed, ref } from "vue";
import { defineStore } from "pinia";
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
  requestSummary: { input: Record<string, unknown> };
  progress: number;
  frozenCredits: number;
  actualCredits: number;
  refundedCredits: number;
  errorMessage: string | null;
  createdAt: string;
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
};

export type GenerationEstimate = {
  taskType: "text" | "image" | "video";
  estimatedUsage: Record<string, number>;
  estimatedCredits: number;
  billable: boolean;
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

  async function loadTasks(signal?: AbortSignal) {
    const { data } = await api.get<ApiResponse<GenerationTask[]>>("/generation/list", { params: { limit: 100, offset: 0 }, signal });
    signal?.throwIfAborted();
    tasks.value = data.data;
    tasksLoaded.value = true;
  }

  async function loadModels(signal?: AbortSignal) {
    const { data } = await api.get<ApiResponse<PublicModel[]>>("/models/get", { signal });
    signal?.throwIfAborted();
    models.value = data.data;
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
