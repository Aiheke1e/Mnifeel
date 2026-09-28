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

export type ProviderAdapter = {
  testConnection(config: ProviderRuntimeConfig, signal?: AbortSignal): Promise<{ message?: string } | void>;
  listModels(config: ProviderRuntimeConfig, signal?: AbortSignal): Promise<ProviderModelDefinition[]>;
  runText?(config: ProviderRuntimeConfig, model: ProviderModelDefinition, input: unknown, signal?: AbortSignal): Promise<unknown>;
  runImage?(config: ProviderRuntimeConfig, model: ProviderModelDefinition, input: unknown, signal?: AbortSignal): Promise<unknown>;
  createVideo?(config: ProviderRuntimeConfig, model: ProviderModelDefinition, input: unknown, signal?: AbortSignal): Promise<unknown>;
  getVideo?(config: ProviderRuntimeConfig, taskId: string, signal?: AbortSignal): Promise<unknown>;
  cancelVideo?(config: ProviderRuntimeConfig, taskId: string, signal?: AbortSignal): Promise<void>;
};
