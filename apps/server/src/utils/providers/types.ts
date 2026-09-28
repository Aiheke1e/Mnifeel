import type { MediaType, ProviderType } from "@/utils/database/types";

export type ProviderRuntimeConfig = {
  id: string;
  type: ProviderType;
  displayName: string;
  baseUrl: string;
  apiKey: string;
};

export type ProviderModelDefinition = {
  upstreamModelId: string;
  displayName: string;
  mediaType: MediaType;
  capabilities?: Record<string, unknown>;
};

export type ProviderTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
};

export type ProviderTextResult = {
  content: string;
  reasoning?: string;
  finishReason: string;
  usage: ProviderTokenUsage;
};

export type ProviderMediaInput = {
  data: string;
  mimeType: string;
};

export type ProviderMediaAsset =
  | { type: "url"; url: string; mimeType?: string }
  | { type: "base64"; data: string; mimeType: string };

export type ProviderImageRequest = {
  prompt: string;
  images?: ProviderMediaInput[];
  ratio?: string;
  size?: string;
};

export type ProviderVideoRequest = {
  prompt: string;
  duration?: number;
  resolution?: string;
  ratio?: string;
  firstFrame?: ProviderMediaInput;
  lastFrame?: ProviderMediaInput;
  images?: ProviderMediaInput[];
  videos?: ProviderMediaInput[];
  audios?: ProviderMediaInput[];
};

export type ProviderVideoTask = {
  id: string;
  modelId: string;
  status: "queued" | "running";
  progress: number;
};

export type ProviderVideoResult = {
  status: "queued" | "running" | "succeeded" | "failed";
  progress: number;
  asset?: ProviderMediaAsset;
  error?: string;
};

export type ProviderAdapter = {
  testConnection(config: ProviderRuntimeConfig, signal?: AbortSignal): Promise<{ message?: string } | void>;
  listModels(config: ProviderRuntimeConfig, signal?: AbortSignal): Promise<ProviderModelDefinition[]>;
  runText?(config: ProviderRuntimeConfig, model: ProviderModelDefinition, input: unknown, signal?: AbortSignal): Promise<ProviderTextResult>;
  runImage?(config: ProviderRuntimeConfig, model: ProviderModelDefinition, input: ProviderImageRequest, signal?: AbortSignal): Promise<ProviderMediaAsset[]>;
  createVideo?(config: ProviderRuntimeConfig, model: ProviderModelDefinition, input: ProviderVideoRequest, signal?: AbortSignal): Promise<ProviderVideoTask>;
  getVideo?(config: ProviderRuntimeConfig, task: ProviderVideoTask, signal?: AbortSignal): Promise<ProviderVideoResult>;
  cancelVideo?(config: ProviderRuntimeConfig, task: ProviderVideoTask, signal?: AbortSignal): Promise<void>;
};
