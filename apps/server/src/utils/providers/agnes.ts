import { z } from "zod";
import type { ProviderAdapter, ProviderRuntimeConfig } from "@/utils/providers/types";

const modelsSchema = z.object({
  data: z.array(z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1).optional(),
    display_name: z.string().trim().min(1).optional(),
    displayName: z.string().trim().min(1).optional(),
  })).min(1).max(2000),
});

const createSchema = z.object({
  id: z.string().min(1).optional(),
  task_id: z.string().min(1).optional(),
  video_id: z.string().min(1),
  model: z.string().min(1),
  status: z.enum(["queued", "in_progress", "processing"]).or(z.string()),
  progress: z.number().int().min(0).max(100).optional(),
});

const resultSchema = z.object({
  status: z.string().min(1),
  progress: z.number().int().min(0).max(100).optional(),
  url: z.string().optional().nullable(),
  metadata: z.object({ url: z.string().optional().nullable() }).passthrough().optional().nullable(),
  error: z.union([z.string(), z.object({ message: z.string().optional() }).passthrough()]).optional().nullable(),
});

function endpoint(config: ProviderRuntimeConfig, path: string) {
  return new URL(path.replace(/^\/+/, ""), `${config.baseUrl.replace(/\/+$/, "")}/`).href;
}

function pollEndpoint(config: ProviderRuntimeConfig, videoId: string, modelId: string) {
  const base = new URL(config.baseUrl);
  base.pathname = `${base.pathname.replace(/\/v1\/?$/, "")}/agnesapi`.replace(/\/{2,}/g, "/");
  base.search = "";
  base.searchParams.set("video_id", videoId);
  base.searchParams.set("model_name", modelId);
  return base.href;
}

function requestSignal(signal: AbortSignal | undefined, timeout: number) {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
}

async function fetchJson(config: ProviderRuntimeConfig, url: string, init: RequestInit = {}, signal?: AbortSignal, timeout = 30000) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...init.headers,
    },
    signal: requestSignal(signal, timeout),
    redirect: "error",
  });
  if (!response.ok) throw Object.assign(new Error(`Agnes 请求失败（HTTP ${response.status}）`), { status: 502 });
  return response.json();
}

function capabilities(modelId: string) {
  const flash = modelId.includes("flash");
  const durations = [4, 5, 6, 7, 8, 9, 10, 11, 12];
  const resolutions = flash ? ["720P"] : ["720P", "1080P", "1K", "2K"];
  return {
    modes: ["text"],
    durations,
    resolutions,
    durationResolutionMap: [{ duration: durations, resolution: resolutions }],
    ratios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
  };
}

const agnes: ProviderAdapter = {
  async testConnection(config, signal) {
    const models = await this.listModels(config, signal);
    if (!models.length) throw new Error("Agnes 未返回视频模型");
    return { message: `连接成功，可用视频模型 ${models.length} 个` };
  },

  async listModels(config, signal) {
    const result = modelsSchema.parse(await fetchJson(config, endpoint(config, "models"), {}, signal));
    return result.data.filter(model => model.id.startsWith("agnes-video-")).map(model => ({
      upstreamModelId: model.id,
      displayName: model.display_name ?? model.displayName ?? model.name ?? model.id,
      mediaType: "video" as const,
      capabilities: capabilities(model.id),
    }));
  },

  async createVideo(config, model, input, signal) {
    if (input.firstFrame || input.lastFrame || input.images?.length || input.videos?.length || input.audios?.length) {
      throw Object.assign(new Error("Agnes 参考素材要求公网 URL，本地项目素材暂不直接外传；当前仅支持文生视频"), { status: 400 });
    }
    const duration = input.duration ?? 5;
    const resolution = (input.resolution ?? "720P").toUpperCase();
    const ratio = input.ratio ?? "16:9";
    if (!Number.isInteger(duration) || duration < 4 || duration > 12) throw Object.assign(new Error("Agnes 视频时长须为 4 到 12 秒的整数"), { status: 400 });
    if (!capabilities(model.upstreamModelId).resolutions.includes(resolution)) throw Object.assign(new Error("Agnes 模型不支持所选分辨率"), { status: 400 });
    if (!capabilities(model.upstreamModelId).ratios.includes(ratio)) throw Object.assign(new Error("Agnes 模型不支持所选画幅"), { status: 400 });
    const result = createSchema.parse(await fetchJson(config, endpoint(config, "videos"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model.upstreamModelId,
        prompt: input.prompt,
        mode: "text",
        seconds: String(duration),
        size: resolution,
        aspect_ratio: ratio,
        n: 1,
      }),
    }, signal, 60000));
    return {
      id: result.video_id,
      modelId: result.model,
      status: result.status === "queued" ? "queued" : "running",
      progress: result.progress ?? 0,
    };
  },

  async getVideo(config, task, signal) {
    const result = resultSchema.parse(await fetchJson(config, pollEndpoint(config, task.id, task.modelId), {}, signal));
    const status = result.status.toLowerCase();
    if (status === "completed" || status === "succeeded" || status === "success") {
      const url = result.url ?? result.metadata?.url;
      if (!url || !URL.canParse(url) || !["http:", "https:"].includes(new URL(url).protocol)) throw new Error("Agnes 完成任务未返回有效视频地址");
      return { status: "succeeded", progress: 100, asset: { type: "url", url } };
    }
    if (status === "failed" || status === "failure") {
      const message = typeof result.error === "string" ? result.error : result.error?.message;
      return { status: "failed", progress: result.progress ?? 0, error: message || "Agnes 视频生成失败" };
    }
    return { status: status === "queued" ? "queued" : "running", progress: result.progress ?? 0 };
  },
};

export default agnes;
