import { z } from "zod";
import type { ProviderAdapter, ProviderRuntimeConfig } from "@/utils/providers/types";

const modelsSchema = z.object({
  data: z.array(z.object({
    id: z.string().trim().min(1),
    display_name: z.string().trim().min(1).optional(),
    displayName: z.string().trim().min(1).optional(),
  })).min(1).max(2000),
});

const textInputSchema = z.object({
  messages: z.array(z.json()).min(1).max(2000),
  systemPrompt: z.string().max(100000).optional(),
  maxTokens: z.number().int().positive().max(393216).optional(),
  temperature: z.number().min(0).max(2).optional(),
  tools: z.array(z.json()).max(128).optional(),
});

const completionSchema = z.object({
  choices: z.array(z.object({
    finish_reason: z.string().nullable(),
    message: z.object({
      content: z.string().nullable().optional(),
      reasoning_content: z.string().nullable().optional(),
    }),
  })).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
    prompt_cache_hit_tokens: z.number().int().nonnegative().optional(),
    prompt_tokens_details: z.object({ cached_tokens: z.number().int().nonnegative().optional() }).optional(),
    completion_tokens_details: z.object({ reasoning_tokens: z.number().int().nonnegative().optional() }).optional(),
  }),
});

function endpoint(config: ProviderRuntimeConfig, path: string) {
  return new URL(path.replace(/^\/+/, ""), `${config.baseUrl.replace(/\/+$/, "")}/`).href;
}

function requestSignal(signal?: AbortSignal) {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000);
}

async function fetchJson(config: ProviderRuntimeConfig, path: string, init: RequestInit = {}, signal?: AbortSignal) {
  const response = await fetch(endpoint(config, path), {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...init.headers,
    },
    signal: requestSignal(signal),
    redirect: "error",
  });
  if (!response.ok) throw Object.assign(new Error(`DeepSeek 请求失败（HTTP ${response.status}）`), { status: 502 });
  return response.json();
}

const deepSeek: ProviderAdapter = {
  async testConnection(config, signal) {
    const models = modelsSchema.parse(await fetchJson(config, "models", {}, signal));
    return { message: `连接成功，可用模型 ${models.data.length} 个` };
  },

  async listModels(config, signal) {
    const result = modelsSchema.parse(await fetchJson(config, "models", {}, signal));
    return result.data.map(model => ({
      upstreamModelId: model.id,
      displayName: model.display_name ?? model.displayName ?? model.id,
      mediaType: "text" as const,
      capabilities: { protocol: "openai-completions", streaming: true },
    }));
  },

  async runText(config, model, input, signal) {
    const parsed = textInputSchema.parse(input);
    const messages = parsed.systemPrompt
      ? [{ role: "system", content: parsed.systemPrompt }, ...parsed.messages]
      : parsed.messages;
    const result = completionSchema.parse(await fetchJson(config, "chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model.upstreamModelId,
        messages,
        stream: false,
        ...(parsed.maxTokens ? { max_tokens: parsed.maxTokens } : {}),
        ...(parsed.temperature !== undefined ? { temperature: parsed.temperature } : {}),
        ...(parsed.tools?.length ? { tools: parsed.tools } : {}),
      }),
    }, signal));
    const choice = result.choices[0]!;
    return {
      content: choice.message.content ?? "",
      ...(choice.message.reasoning_content ? { reasoning: choice.message.reasoning_content } : {}),
      finishReason: choice.finish_reason ?? "stop",
      usage: {
        inputTokens: result.usage.prompt_tokens,
        outputTokens: result.usage.completion_tokens,
        totalTokens: result.usage.total_tokens,
        cachedInputTokens: result.usage.prompt_cache_hit_tokens ?? result.usage.prompt_tokens_details?.cached_tokens,
        reasoningTokens: result.usage.completion_tokens_details?.reasoning_tokens,
      },
    };
  },
};

export default deepSeek;
