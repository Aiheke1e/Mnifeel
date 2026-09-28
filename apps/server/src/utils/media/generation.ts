import { mkdir, readFile, realpath, stat, unlink } from "node:fs/promises";
import { join, relative } from "node:path";
import type { GeneratedMedia, MediaGenerationRequest, MediaModel, MediaReference } from "@minifeel/tools-scaffold/runtime";
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

function invalid(message: string): never {
  throw Object.assign(new Error(message), { status: 400 });
}

function imageOptions(value: unknown, pattern: RegExp) {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length <= 64 && item === item.trim() && pattern.test(item)))] : undefined;
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
  if (!request.prompt.trim()) invalid("请输入生成提示词");
  if (mediaType === "audio") invalid("当前没有启用音频生成模型");
  const directory = await realpath(cwd);
  const outputDirectory = request.outputDirectory ?? "assets/generated";
  await resolveWorkspacePath(directory, outputDirectory, true);
  const references = async (items: MediaReference[] | undefined, type: string) => items ? Promise.all(items.map(item => readReference(directory, item, type, signal))) : undefined;
  const images = await references(request.images, "image");
  signal?.throwIfAborted();
  const configured = await getRunnableModel(request.modelId, mediaType);
  let assets: ProviderMediaAsset[];
  if (mediaType === "image") {
    if (!configured.adapter.runImage) invalid("此供应商不支持图片生成");
    assets = await configured.adapter.runImage(configured.provider, configured.model, {
      prompt: request.prompt, images, ratio: request.ratio, size: request.size,
    }, signal);
  } else {
    if (!configured.adapter.createVideo || !configured.adapter.getVideo) invalid("此供应商不支持视频生成");
    const operationSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(30 * 60_000)]) : AbortSignal.timeout(30 * 60_000);
    const task = await configured.adapter.createVideo(configured.provider, configured.model, {
      prompt: request.prompt, images,
      videos: await references(request.videos, "video"),
      audios: await references(request.audios, "audio"),
      firstFrame: request.firstFrame ? await readReference(directory, request.firstFrame, "image", signal) : undefined,
      lastFrame: request.lastFrame ? await readReference(directory, request.lastFrame, "image", signal) : undefined,
      ratio: request.ratio, resolution: request.resolution, duration: request.duration,
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
