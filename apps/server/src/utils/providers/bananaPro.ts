import { z } from "zod";
import type { ProviderAdapter, ProviderMediaAsset, ProviderRuntimeConfig } from "@/utils/providers/types";

const modelsSchema = z.object({
  models: z.array(z.object({
    id: z.string().trim().min(1),
    displayName: z.string().trim().min(1),
    supportedFormats: z.array(z.string()).optional(),
    aspectRatios: z.array(z.string()).optional(),
    imageSizes: z.array(z.string()).optional(),
    maxReferenceImages: z.number().int().positive().optional(),
  })).min(1).max(2000),
});

const submitSchema = z.object({
  task_id: z.string().min(1),
  status: z.string().min(1),
});

const imagePartSchema = z.object({
  inlineData: z.object({ mimeType: z.string().startsWith("image/"), data: z.string().min(1) }).optional(),
  fileData: z.object({ mimeType: z.string().startsWith("image/").optional(), fileUri: z.string().min(1) }).optional(),
});

const taskSchema = z.object({
  status: z.string().min(1),
  response: z.object({
    candidates: z.array(z.object({
      content: z.object({ parts: z.array(imagePartSchema) }),
    })).min(1),
  }).optional(),
  error: z.union([z.string(), z.object({ message: z.string().optional(), type: z.string().optional() })]).optional(),
});

function endpoint(config: ProviderRuntimeConfig, path: string) {
  return new URL(path.replace(/^\/+/, ""), `${config.baseUrl.replace(/\/+$/, "")}/`).href;
}

function requestSignal(signal: AbortSignal | undefined, timeout = 30000) {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
}

// 上游限频（429）与瞬时网关错误（502/503/504）通常可自愈，自动退避重试，避免整个生成任务直接失败。
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 4;

async function sleepWithAbort(delay: number, signal?: AbortSignal) {
  if (!signal) {
    await new Promise(resolve => setTimeout(resolve, delay));
    return;
  }
  await wait(signal, delay);
}

async function fetchJson(config: ProviderRuntimeConfig, path: string, init: RequestInit = {}, signal?: AbortSignal, timeout?: number) {
  let attempt = 0;
  while (true) {
    signal?.throwIfAborted();
    const response = await fetch(endpoint(config, path), {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        ...init.headers,
      },
      signal: requestSignal(signal, timeout),
      redirect: "error",
    });
    if (response.ok) {
      const contentLength = Number(response.headers.get("content-length"));
      if (contentLength > 140 * 1024 * 1024) throw new Error("BananaPro 响应超过 140 MB 限制");
      const text = await response.text();
      if (text.length > 140 * 1024 * 1024) throw new Error("BananaPro 响应超过 140 MB 限制");
      return JSON.parse(text.trim());
    }
    if (!RETRYABLE_STATUS.has(response.status) || attempt >= MAX_RETRIES) {
      throw Object.assign(new Error(`BananaPro 请求失败（HTTP ${response.status}）`), { status: 502 });
    }
    attempt += 1;
    const retryAfter = Number(response.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter, 60) * 1000
      : Math.min(2 ** attempt * 500 + Math.random() * 400, 8000);
    await sleepWithAbort(delayMs, signal);
  }
}

function wait(signal: AbortSignal, delay: number) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delay);
    signal.addEventListener("abort", abort, { once: true });
  });
}

function imageAssets(result: z.infer<typeof taskSchema>, config: ProviderRuntimeConfig) {
  const parts = result.response?.candidates.flatMap(candidate => candidate.content.parts) ?? [];
  const assets: ProviderMediaAsset[] = [];
  for (const part of parts) {
    if (part.inlineData) {
      assets.push({ type: "base64", data: part.inlineData.data, mimeType: part.inlineData.mimeType });
      continue;
    }
    if (!part.fileData) continue;
    const url = new URL(part.fileData.fileUri, config.baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("BananaPro 返回了无效图片地址");
    assets.push({ type: "url", url: url.href, mimeType: part.fileData.mimeType });
  }
  if (!assets.length) throw new Error("BananaPro 完成任务未返回图片");
  return assets;
}

const bananaPro: ProviderAdapter = {
  async testConnection(config, signal) {
    const result = z.object({ balance: z.number().nullable() }).parse(await fetchJson(config, "api/balance", {}, signal));
    return { message: result.balance === null ? "连接成功，当前密钥为无限额度" : `连接成功，余额 ${result.balance} 分` };
  },

  async listModels(config, signal) {
    const result = modelsSchema.parse(await fetchJson(config, "api/models", {}, signal));
    return result.models.filter(model => model.supportedFormats?.includes("gemini") ?? model.id.startsWith("gemini-")).map(model => ({
      upstreamModelId: model.id,
      displayName: model.displayName,
      mediaType: "image" as const,
      capabilities: {
        ratios: model.aspectRatios ?? [],
        sizes: model.imageSizes ?? [],
        maxReferenceImages: model.maxReferenceImages ?? 14,
      },
    }));
  },

  async runImage(config, model, input, signal) {
    if (!input.prompt.trim()) throw Object.assign(new Error("请输入图片生成提示词"), { status: 400 });
    if ((input.images?.length ?? 0) > 14) throw Object.assign(new Error("BananaPro 单次最多使用 14 张参考图"), { status: 400 });
    const operationSignal = requestSignal(signal, 10 * 60_000);
    const parts: Record<string, unknown>[] = [{ text: input.prompt }];
    for (const image of input.images ?? []) {
      if (!image.mimeType.startsWith("image/") || !image.data) throw Object.assign(new Error("参考图格式无效"), { status: 400 });
      parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
    }
    const submit = submitSchema.parse(await fetchJson(config, "api/gemini/v1beta/asyncGenerateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model.upstreamModelId,
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio: input.ratio ?? "1:1",
            imageSize: (input.size ?? "1K").toUpperCase(),
          },
        },
        responseFormat: "url",
      }),
    }, operationSignal, 60000));
    while (true) {
      operationSignal.throwIfAborted();
      const task = taskSchema.parse(await fetchJson(config, `api/gemini/v1beta/tasks/${encodeURIComponent(submit.task_id)}`, {}, operationSignal));
      const status = task.status.toLowerCase();
      if (status === "completed" || status === "succeeded" || status === "success") return imageAssets(task, config);
      if (status === "failed" || status === "failure") {
        const message = typeof task.error === "string" ? task.error : task.error?.message;
        throw new Error(message || "BananaPro 图片生成失败");
      }
      await wait(operationSignal, 3000);
    }
  },
};

export default bananaPro;
