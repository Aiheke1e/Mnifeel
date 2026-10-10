import { setTimeout as wait } from "node:timers/promises";
import { z } from "zod";
import type { ProviderAdapter, ProviderMediaInput, ProviderRuntimeConfig } from "@/utils/providers/types";

const requestInterval = 60_000;
let nextRequestAt = 0;
let requestQueue = Promise.resolve();

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

async function waitForVideoRequest(signal?: AbortSignal) {
  const turn = requestQueue.then(async () => {
    signal?.throwIfAborted();
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await wait(delay, undefined, { signal });
    signal?.throwIfAborted();
    // ACT: Agnes 同一密钥的视频创建和查询接口每分钟只允许调用一次；服务端单进程内串行即可覆盖当前并发上限。
    nextRequestAt = Date.now() + requestInterval;
  });
  requestQueue = turn.catch(() => undefined);
  await turn;
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
  if (!response.ok) {
    // ACT: 读取上游错误体，把「队列已满 / 限频 / 参数非法」等真实原因透出给管理员，而不是只报 HTTP 状态码。
    const detail = await response.text().then(text => {
      try {
        const body = JSON.parse(text) as { message?: unknown; error?: unknown; detail?: unknown };
        return [body.message, body.error, body.detail].find(value => typeof value === "string" && value.trim()) as string | undefined;
      } catch {
        return undefined;
      }
    }).catch(() => undefined);
    throw Object.assign(new Error(detail ? `Agnes 请求失败：${detail}` : `Agnes 请求失败（HTTP ${response.status}）`), { status: 502 });
  }
  return response.json();
}

function capabilities(modelId: string) {
  const flash = modelId.includes("flash");
  const durations = [4, 5, 6, 7, 8, 9, 10, 11, 12];
  const resolutions = flash ? ["720P"] : ["720P", "1080P", "1K", "2K"];
  const ratios = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
  return {
    // ACT: 支持文生视频（text）与图生视频（keyframe 首帧/尾帧、reference 参考图 ≤5）；本地图片以 base64 传入，普通与高级画布均可供给。
    modes: ["text", "startEndRequired", "endFrameOptional", "startFrameOptional", ["imageReference:5"]],
    durations,
    resolutions,
    durationResolutionMap: [{ duration: durations, resolution: resolutions }],
    ratios,
    // ACT: 官方文档明确 keyframe（首帧/尾帧）与 reference（图片参考 ≤5）互斥，不能同一次请求混用，故 combineFrameWithReferences 为 false。
    videoCapability: {
      version: 1,
      firstFrame: true,
      lastFrame: true,
      maxImageReferences: 5,
      combineFrameWithReferences: false,
      durations,
      ratios,
      resolutions,
    },
  };
}

// ACT: Agnes 的首帧/尾帧/参考图接受公网 HTTP(S) URL，也接受 base64 图片数据。
// 平台媒体链路 readReference 产出的是纯 base64，这里统一拼成 data URI 再交给 Agnes。
// 实测纯 base64 与 data URI 均能通过 Agnes 入队前参数校验（返回 503 队列满而非 400 参数错误），官方文档「只收公网 URL」并不完整。
function requireImageRef(input: ProviderMediaInput | undefined): string | undefined {
  if (!input) return undefined;
  const value = input.data.trim();
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value) && URL.canParse(value)) return value; // 公网 URL 原样透传
  if (/^data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,/i.test(value)) return value; // 已是 data URI 原样透传
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(value)) { // 纯 base64 → data URI
    return `data:${input.mimeType || "image/png"};base64,${value.replace(/\s+/g, "")}`;
  }
  throw Object.assign(new Error("Agnes 图片参考仅接受公网 HTTP(S) URL 或 base64 图片数据"), { status: 400 });
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
    if (input.videos?.length || input.audios?.length) {
      throw Object.assign(new Error("Agnes 当前仅支持首帧/尾帧与图片参考，暂不支持视频或音频参考"), { status: 400 });
    }
    const duration = input.duration ?? 5;
    const resolution = (input.resolution ?? "720P").toUpperCase();
    const ratio = input.ratio ?? "16:9";
    if (!Number.isInteger(duration) || duration < 4 || duration > 12) throw Object.assign(new Error("Agnes 视频时长须为 4 到 12 秒的整数"), { status: 400 });
    if (!capabilities(model.upstreamModelId).resolutions.includes(resolution)) throw Object.assign(new Error("Agnes 模型不支持所选分辨率"), { status: 400 });
    if (!capabilities(model.upstreamModelId).ratios.includes(ratio)) throw Object.assign(new Error("Agnes 模型不支持所选画幅"), { status: 400 });

    const firstFrame = requireImageRef(input.firstFrame);
    const lastFrame = requireImageRef(input.lastFrame);
    const images = (input.images ?? []).map(requireImageRef);
    if (images.length > 5) throw Object.assign(new Error("Agnes 单次最多使用 5 张参考图"), { status: 400 });

    const hasFrame = Boolean(firstFrame || lastFrame);
    if (hasFrame && images.length) throw Object.assign(new Error("Agnes 首帧/尾帧与图片参考不能在同一次请求中混用"), { status: 400 });

    let mode = "text";
    const media: Record<string, unknown> = {};
    if (hasFrame) {
      mode = "keyframe";
      if (firstFrame) media.first_frame = firstFrame;
      if (lastFrame) media.last_frame = lastFrame;
    } else if (images.length) {
      mode = "reference";
      media.images = images;
    }

    await waitForVideoRequest(signal);
    const result = createSchema.parse(await fetchJson(config, endpoint(config, "videos"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model.upstreamModelId,
        prompt: input.prompt,
        mode,
        seconds: String(duration),
        size: resolution,
        aspect_ratio: ratio,
        n: 1,
        ...media,
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
    await waitForVideoRequest(signal);
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
