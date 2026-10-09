import { mkdir, readFile, realpath, stat, unlink } from "node:fs/promises";
import { join, relative } from "node:path";
import { imageGenerationSchema, videoGenerationSchema } from "@minifeel/tool-media-generation/runtime";
import type { GeneratedMedia, MediaGenerationRequest, MediaModel, MediaReference } from "@minifeel/tools-scaffold/runtime";
import { z } from "zod";
import { getRunnableModel, listPublicModels } from "@/utils/providers";
import type { ProviderMediaAsset, ProviderMediaInput, ProviderVideoTask } from "@/utils/providers/types";
import { lockWorkspaceFiles, resolveWorkspacePath, writeWorkspaceFile } from "@/utils/workspace/files";

const maxMediaSize = 100 * 1024 * 1024;
const mediaExtensions: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "image/avif": "avif", "image/bmp": "bmp", "image/tiff": "tiff",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/ogg": "ogv",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg", "audio/webm": "webm",
  "audio/flac": "flac", "audio/aac": "aac", "audio/mp4": "m4a", "audio/opus": "opus", "audio/pcm": "pcm",
};

const videoModesSchema = z.array(videoGenerationSchema.shape.mode.unwrap()).min(1).max(32);

function invalid(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function imageOptions(value: unknown, pattern: RegExp) {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length <= 64 && item === item.trim() && pattern.test(item)))] : undefined;
}

function numberOptions(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is number => typeof item === "number" && Number.isFinite(item) && item > 0))]
    : [];
}

function durationResolutionOptions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    const duration = numberOptions(entry.duration);
    const resolution = imageOptions(entry.resolution, /^[^\u0000-\u001f\u007f]+$/) ?? [];
    return duration.length && resolution.length ? [{ duration, resolution }] : [];
  });
}

function sameMode(left: MediaGenerationRequest["mode"], right: MediaGenerationRequest["mode"]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function videoModeMatches(mode: NonNullable<MediaGenerationRequest["mode"]>, request: MediaGenerationRequest) {
  const imageCount = request.images?.length ?? 0;
  const videoCount = request.videos?.length ?? 0;
  const audioCount = request.audios?.length ?? 0;
  const hasFirstFrame = request.firstFrame !== undefined;
  const hasLastFrame = request.lastFrame !== undefined;
  const hasLooseReferences = imageCount + videoCount + audioCount > 0;
  if (Array.isArray(mode)) {
    if (!hasLooseReferences || hasFirstFrame || hasLastFrame) return false;
    return ([
      ["image", imageCount],
      ["video", videoCount],
      ["audio", audioCount],
    ] as const).every(([type, count]) => count <= Number(mode.find(item => item.startsWith(`${type}Reference:`))?.split(":")[1] ?? 0));
  }
  if (hasLooseReferences && mode !== "singleImage") return false;
  if ((videoCount || audioCount) && mode === "singleImage") return false;
  if (mode === "text") return !hasLooseReferences && !hasFirstFrame && !hasLastFrame;
  if (mode === "singleImage") return imageCount === 1 && !hasFirstFrame && !hasLastFrame;
  if (hasLooseReferences) return false;
  if (mode === "startEndRequired") return hasFirstFrame && hasLastFrame;
  if (mode === "endFrameOptional") return hasFirstFrame;
  return mode === "startFrameOptional" && hasLastFrame;
}

export function validateMediaGenerationRequest(
  mediaType: "image" | "video",
  value: unknown,
  capabilities: Record<string, unknown>,
  expectedModelId: string,
): MediaGenerationRequest {
  const parsed = (mediaType === "image" ? imageGenerationSchema : videoGenerationSchema).safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? `（${issue.path.join(".")}）` : "";
    invalid(`媒体生成参数无效${path}：${issue?.message ?? "请检查请求内容"}`);
  }
  const request = parsed.data as MediaGenerationRequest;
  if (request.providerId !== "managed") invalid("所选媒体模型与供应商不匹配");
  if (request.modelId !== expectedModelId) invalid("媒体请求中的模型与任务模型不匹配");

  const ratios = imageOptions(capabilities.ratios, /^[1-9]\d{0,3}:[1-9]\d{0,3}$/) ?? [];
  if (request.ratio && ratios.length && !ratios.includes(request.ratio)) invalid(`当前模型不支持画幅 ${request.ratio}`);
  if (mediaType === "image") {
    const sizes = imageOptions(capabilities.sizes, /^[^\u0000-\u001f\u007f]+$/) ?? [];
    if (request.size && sizes.length && !sizes.includes(request.size)) invalid(`当前模型不支持图片尺寸 ${request.size}`);
    const maxReferenceImages = capabilities.maxReferenceImages;
    if (maxReferenceImages !== undefined && (!Number.isInteger(maxReferenceImages) || Number(maxReferenceImages) < 0)) {
      invalid("图片模型的参考图能力配置无效", 409);
    }
    if ((request.images?.length ?? 0) > Number(maxReferenceImages ?? 64)) {
      invalid(`当前模型最多支持 ${maxReferenceImages} 张参考图`);
    }
    return request;
  }

  const modes = videoModesSchema.safeParse(capabilities.modes);
  if (!modes.success) invalid("视频模型的生成模式配置无效", 409);
  if (request.mode !== undefined && !modes.data.some(mode => sameMode(mode, request.mode))) {
    invalid("当前模型不支持所选视频生成模式");
  }
  const matchingModes = request.mode === undefined ? modes.data : [request.mode];
  if (!matchingModes.some(mode => videoModeMatches(mode, request))) {
    invalid("当前视频模型不支持这些参考素材的组合");
  }
  if (request.generateAudio === true && capabilities.audio !== true && capabilities.audio !== "optional") {
    invalid("当前视频模型不支持生成音频");
  }

  const durations = numberOptions(capabilities.durations);
  if (request.duration !== undefined && durations.length && !durations.includes(request.duration)) {
    invalid(`当前模型不支持视频时长 ${request.duration}`);
  }
  const resolutions = imageOptions(capabilities.resolutions, /^[^\u0000-\u001f\u007f]+$/) ?? [];
  if (request.resolution && resolutions.length && !resolutions.includes(request.resolution)) {
    invalid(`当前模型不支持视频分辨率 ${request.resolution}`);
  }
  const mappings = durationResolutionOptions(capabilities.durationResolutionMap);
  if (mappings.length && request.duration !== undefined) {
    const durationMappings = mappings.filter(item => item.duration.includes(request.duration!));
    if (!durationMappings.length) invalid(`当前模型不支持视频时长 ${request.duration}`);
    if (request.resolution && !durationMappings.some(item => item.resolution.includes(request.resolution!))) {
      invalid(`当前视频时长不支持分辨率 ${request.resolution}`);
    }
  } else if (mappings.length && request.resolution && !mappings.some(item => item.resolution.includes(request.resolution!))) {
    invalid(`当前模型不支持视频分辨率 ${request.resolution}`);
  }
  return request;
}

export async function listMediaModels(): Promise<MediaModel[]> {
  const models = await listPublicModels(["image", "video"]);
  return models.flatMap(model => {
    if (model.mediaType !== "image" && model.mediaType !== "video") return [];
    const capabilities = model.capabilities ?? {};
    return [{
      providerId: "managed",
      providerLabel: "平台模型",
      modelId: model.id,
      label: model.displayName,
      type: model.mediaType,
      mode: capabilities.modes,
      durationResolutionMap: Array.isArray(capabilities.durationResolutionMap) ? capabilities.durationResolutionMap as MediaModel["durationResolutionMap"] : undefined,
      audio: typeof capabilities.audio === "boolean" || capabilities.audio === "optional" ? capabilities.audio : undefined,
      ...(model.mediaType === "image" ? {
        imageSizes: imageOptions(capabilities.sizes, /^[^\u0000-\u001f\u007f]+$/),
        imageRatios: imageOptions(capabilities.ratios, /^[1-9]\d{0,3}:[1-9]\d{0,3}$/),
      } : {}),
    }];
  });
}

function detectMimeType(bytes: Uint8Array, fallback: string) {
  const header = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, 16));
  const text = header.toString("ascii");
  const mimeType = fallback.split(";")[0].trim().toLowerCase();
  if (header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (header[0] === 255 && header[1] === 216 && header[2] === 255) return "image/jpeg";
  if (/^GIF8[79]a/.test(text)) return "image/gif";
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") return "image/webp";
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WAVE") return "audio/wav";
  if (text.startsWith("fLaC")) return "audio/flac";
  if (text.startsWith("OggS")) return mimeType.startsWith("video/") ? "video/ogg" : mimeType === "audio/opus" ? "audio/opus" : "audio/ogg";
  if (header[0] === 0xff && (header[1]! & 0xf6) === 0xf0) return "audio/aac";
  if (text.startsWith("ID3") || (header[0] === 0xff && (header[1]! & 0xe0) === 0xe0 && (header[1]! & 0x06) !== 0)) return "audio/mpeg";
  if (text.slice(4, 8) === "ftyp") {
    if (/avif|avis/.test(text.slice(8))) return "image/avif";
    if (/^M4[AB] $/.test(text.slice(8, 12)) || mimeType.startsWith("audio/")) return "audio/mp4";
    return text.slice(8, 12) === "qt  " ? "video/quicktime" : "video/mp4";
  }
  if (header.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))) return mimeType.startsWith("audio/") ? "audio/webm" : "video/webm";
  return ({ "image/jpg": "image/jpeg", "audio/mp3": "audio/mpeg", "audio/x-wav": "audio/wav", "audio/wave": "audio/wav", "audio/x-flac": "audio/flac" } as Record<string, string>)[mimeType] ?? mimeType;
}

export async function readReference(cwd: string, reference: MediaReference, mediaType: string, signal?: AbortSignal): Promise<ProviderMediaInput> {
  signal?.throwIfAborted();
  const { path } = await resolveWorkspacePath(cwd, reference.path);
  const info = await stat(path);
  if (!info.isFile() || info.size > maxMediaSize) invalid("参考媒体须为不超过 100 MB 的文件");
  const bytes = await readFile(path, { signal });
  if (!bytes.length || bytes.length > maxMediaSize) invalid("参考媒体为空或超过 100 MB");
  const mimeType = detectMimeType(bytes, reference.mimeType);
  if (!mimeType.startsWith(`${mediaType}/`)) invalid(`参考媒体类型须为 ${mediaType}`);
  return { data: bytes.toString("base64"), mimeType };
}

async function downloadAsset(url: string, signal?: AbortSignal) {
  let current = new URL(url);
  if (!["http:", "https:"].includes(current.protocol)) invalid("生成结果必须使用 HTTP 或 HTTPS 地址");
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 3; redirects++) {
    response = await fetch(current, { signal, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || redirects === 3) invalid("生成结果重定向次数超过限制");
    current = new URL(location, current);
    if (!["http:", "https:"].includes(current.protocol)) invalid("生成结果重定向到无效地址");
  }
  if (!response) invalid("生成结果为空");
  if (!response.ok) throw new Error(`下载生成结果失败（HTTP ${response.status}）`);
  if (Number(response.headers.get("content-length")) > maxMediaSize) {
    await response.body?.cancel();
    invalid("生成文件不能超过 100 MB");
  }
  const reader = response.body?.getReader();
  if (!reader) invalid("生成结果为空");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxMediaSize) invalid("生成文件不能超过 100 MB");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return { bytes: Buffer.concat(chunks, size), mimeType: response.headers.get("content-type") ?? "" };
}

async function assetBytes(asset: ProviderMediaAsset, mediaType: "image" | "video", signal?: AbortSignal) {
  let bytes: Uint8Array;
  let mimeType = asset.mimeType ?? "";
  if (asset.type === "url") {
    const result = await downloadAsset(asset.url, signal);
    bytes = result.bytes;
    mimeType = result.mimeType || mimeType;
  } else {
    const data = /^data:([^;,]+);base64,([\s\S]+)$/.exec(asset.data);
    const content = (data?.[2] ?? asset.data).replace(/\s/g, "");
    if (content.length > Math.ceil(maxMediaSize / 3) * 4 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(content) || content.length % 4 === 1) invalid("生成结果的 base64 内容无效或超过 100 MB");
    bytes = Buffer.from(content, "base64");
    mimeType = data?.[1] ?? mimeType;
  }
  if (!bytes.byteLength || bytes.byteLength > maxMediaSize) invalid("生成文件为空或超过 100 MB");
  mimeType = detectMimeType(bytes, mimeType);
  if (!mimeType.startsWith(`${mediaType}/`) || !mediaExtensions[mimeType]) invalid("生成结果不是支持的图片、视频或音频格式");
  return { bytes, mimeType };
}

export async function generateMedia(
  cwd: string,
  mediaType: "image" | "video" | "audio",
  request: MediaGenerationRequest,
  signal?: AbortSignal,
  events?: {
    setProviderTaskId?(providerTaskId: string): Promise<void>;
    updateProgress?(progress: number): Promise<void>;
  },
): Promise<GeneratedMedia[]> {
  signal?.throwIfAborted();
  if (mediaType === "audio") invalid("当前没有启用音频生成模型");
  const configured = await getRunnableModel(request.modelId, mediaType);
  const input = validateMediaGenerationRequest(mediaType, request, configured.model.capabilities ?? {}, request.modelId);
  const directory = await realpath(cwd);
  const outputDirectory = input.outputDirectory ?? "assets/generated";
  await resolveWorkspacePath(directory, outputDirectory, true);
  const references = async (items: MediaReference[] | undefined, type: string) => items ? Promise.all(items.map(item => readReference(directory, item, type, signal))) : undefined;
  const images = await references(input.images, "image");
  signal?.throwIfAborted();
  let assets: ProviderMediaAsset[];
  if (mediaType === "image") {
    if (!configured.adapter.runImage) invalid("此供应商不支持图片生成");
    assets = await configured.adapter.runImage(configured.provider, configured.model, {
      prompt: input.prompt, images, ratio: input.ratio, size: input.size,
    }, signal);
  } else {
    if (!configured.adapter.createVideo || !configured.adapter.getVideo) invalid("此供应商不支持视频生成");
    const operationSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(30 * 60_000)]) : AbortSignal.timeout(30 * 60_000);
    const task = await configured.adapter.createVideo(configured.provider, configured.model, {
      prompt: input.prompt, images,
      videos: await references(input.videos, "video"),
      audios: await references(input.audios, "audio"),
      firstFrame: input.firstFrame ? await readReference(directory, input.firstFrame, "image", signal) : undefined,
      lastFrame: input.lastFrame ? await readReference(directory, input.lastFrame, "image", signal) : undefined,
      ratio: input.ratio, resolution: input.resolution, duration: input.duration,
    }, operationSignal);
    await events?.setProviderTaskId?.(task.id);
    try {
      const asset = await waitForVideo(configured.adapter.getVideo.bind(configured.adapter), configured.provider, task, operationSignal, events?.updateProgress);
      assets = [asset];
    } catch (error) {
      if (operationSignal.aborted && configured.adapter.cancelVideo) {
        await configured.adapter.cancelVideo(configured.provider, task).catch(() => {});
      }
      throw error;
    }
  }
  if (!Array.isArray(assets) || !assets.length) invalid("供应商未返回生成结果");
  if (mediaType === "image" && assets.length !== 1) invalid("图片模型单次只能返回一个结果");
  const written: string[] = [];
  const result: GeneratedMedia[] = [];
  try {
    for (const asset of assets) {
      signal?.throwIfAborted();
      const { bytes, mimeType } = await assetBytes(asset, mediaType, signal);
      signal?.throwIfAborted();
      const output = await resolveWorkspacePath(directory, outputDirectory, true);
      const release = lockWorkspaceFiles([output.path]);
      try {
        await mkdir(output.path, { recursive: true });
        const file = join(outputDirectory, `${mediaType}${crypto.randomUUID()}.${mediaExtensions[mimeType]}`);
        const { path } = await resolveWorkspacePath(directory, file);
        signal?.throwIfAborted();
        await writeWorkspaceFile(path, bytes, true);
        written.push(path);
        result.push({ path: relative(directory, path).replace(/\\/g, "/"), mimeType, mediaType });
      } finally { release(); }
    }
    signal?.throwIfAborted();
    return result;
  } catch (err) {
    // ACT: 只回滚本次创建的文件，保留目录中已有的节点资源。
    await Promise.all(written.map(path => unlink(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; })));
    throw err;
  }
}

async function waitForVideo(
  getVideo: NonNullable<Awaited<ReturnType<typeof getRunnableModel>>["adapter"]["getVideo"]>,
  provider: Awaited<ReturnType<typeof getRunnableModel>>["provider"],
  task: ProviderVideoTask,
  signal: AbortSignal,
  updateProgress?: (progress: number) => Promise<void>,
) {
  while (true) {
    signal.throwIfAborted();
    const result = await getVideo(provider, task, signal);
    if (result.status === "succeeded") {
      if (!result.asset) throw new Error("视频任务完成但没有返回文件");
      return result.asset;
    }
    if (result.status === "failed") throw new Error(result.error || "视频生成失败");
    if (typeof result.progress === "number") await updateProgress?.(result.progress);
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(done, 3000);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
}
