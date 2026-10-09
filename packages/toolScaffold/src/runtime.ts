import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Rule } from "@form-create/element-ui";
import type { FfmpegFactory } from "@minifeel/ffmpeg/types";
import { z } from "zod";

export type { ToolDefinition } from "@earendil-works/pi-coding-agent";
export type { FfmpegFactory, FfmpegCommand, FfprobeData } from "@minifeel/ffmpeg/types";

export const toolNameSchema = z.string().max(96).regex(/^[a-z][a-zA-Z0-9]*$/);
export const toolMetadataSchema = z.object({
  name: toolNameSchema,
  version: z.string().trim().min(1).max(100).default(""),
  displayName: z.string().trim().min(1).max(100),
  description: z.string().max(2000),
  prompt: z.string().max(20000).default(""),
  readme: z.string().max(200000).default(""),
  components: z.array(z.string().max(96).regex(/^[a-z][a-zA-Z0-9_]*$/)).max(100)
    .refine(names => new Set(names).size === names.length, "工具组件名称不能重复").default([]),
  author: z.string().max(100),
  github: z.string().refine(value => !value || (URL.canParse(value) && new URL(value).origin === "https://github.com" && !new URL(value).username && !new URL(value).password)),
  configRules: z.array(z.record(z.string(), z.json())).max(100),
});

export interface ToolMetadata {
  name: string;
  version?: string;
  displayName: string;
  description: string;
  prompt?: string;
  readme?: string;
  components?: string[];
  author: string;
  github: string;
  configRules: Rule[];
}

export interface NodeToolInfo {
  nodeId: string;
  name: `node:${string}`;
  nodeLabel?: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface NodeToolCall {
  nodeId: string;
  name: `node:${string}`;
  args: Record<string, unknown>;
}

export interface NodeToolsContext {
  tools: NodeToolInfo[];
  call(request: NodeToolCall, signal?: AbortSignal): Promise<unknown>;
}

export interface CanvasToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface CanvasInfo {
  id: string;
  tools: NodeToolInfo[];
}

export interface CanvasContext extends CanvasInfo {
  getNodeLabel?(nodeId: string): string | undefined;
  call(request: CanvasToolCall, signal?: AbortSignal): Promise<unknown>;
}

export interface MediaModel {
  providerId: string;
  providerLabel: string;
  modelId: string;
  label: string;
  type: "image" | "video" | "audio";
  mode?: unknown;
  imageSizes?: string[];
  imageRatios?: string[];
  durationResolutionMap?: { duration: number[]; resolution: string[] }[];
  audio?: boolean | "optional";
  voices?: { title: string; voice: string }[];
  videoCapability?: VideoCapability;
}

/** 版本化视频能力描述：只有显式声明并通过校验的模型才被视为已验证能力。 */
export interface VideoCapability {
  version: 1;
  firstFrame: boolean;
  lastFrame: boolean;
  maxImageReferences: number;
  combineFrameWithReferences: boolean;
  durations: number[];
  ratios: string[];
  resolutions: string[];
}

/** 普通创作对一次视频请求的最低要求。 */
export interface GuidedVideoRequirement {
  requiredImageReferences: number;
  ratio: string;
  duration?: number;
  minResolutionHeight: number;
}

export interface GuidedVideoGateResult {
  passed: boolean;
  reasons: string[];
}

/** 视频能力描述的当前版本；版本不符或含未知字段时不作为已验证能力。 */
export const videoCapabilityVersion = 1;

export const videoCapabilitySchema = z.strictObject({
  version: z.literal(videoCapabilityVersion),
  firstFrame: z.boolean(),
  lastFrame: z.boolean(),
  maxImageReferences: z.number().int().min(0).max(64),
  combineFrameWithReferences: z.boolean(),
  durations: z.array(z.number().finite().positive().max(3600)).min(1).max(64),
  ratios: z.array(z.string().regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/)).min(1).max(32),
  resolutions: z.array(z.string().trim().min(1).max(64)).min(1).max(32),
});

/** 解析视频能力描述；缺失或不合格时返回 undefined，旧模型因此默认不满足普通创作准入。 */
export function parseVideoCapability(value: unknown): VideoCapability | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const parsed = videoCapabilitySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function readVideoCapability(capabilities: Record<string, unknown>) {
  return parseVideoCapability(capabilities.videoCapability);
}

/**
 * 把 720p、1080p 这类纵向标记和 1K、2K 这类横向标记换算成纵向像素数。
 * 无法识别时返回 undefined，调用方应视为未验证的分辨率。
 */
export function resolutionHeight(value: string, ratioWidth = 9, ratioHeight = 16) {
  const match = /^(\d+(?:\.\d+)?)\s*(p|k)$/i.exec(value.trim());
  if (!match || !ratioWidth || !ratioHeight) return undefined;
  const size = Number.parseFloat(match[1]!);
  if (!Number.isFinite(size) || size <= 0) return undefined;
  // ACT: K 表示横向像素，按画幅换算纵向像素；P 直接表示纵向像素。
  return match[2]!.toLowerCase() === "p" ? size : (size * 1024 * ratioHeight) / ratioWidth;
}

/** 唯一的能力匹配规则：普通工作台用它判断一个模型能否在同一次请求里使用首帧和多张图片参考。 */
export function checkGuidedVideoCapability(
  capability: VideoCapability | undefined,
  requirement: GuidedVideoRequirement,
): GuidedVideoGateResult {
  if (!capability) return { passed: false, reasons: ["模型尚未声明可组合的视频能力"] };
  const reasons: string[] = [];
  if (!capability.firstFrame) reasons.push("分镜图不能作为首帧");
  if (capability.maxImageReferences < requirement.requiredImageReferences) {
    reasons.push(`最多只能附加 ${capability.maxImageReferences} 张图片参考，当前镜头需要 ${requirement.requiredImageReferences} 张`);
  }
  if (requirement.requiredImageReferences > 0 && !capability.combineFrameWithReferences) reasons.push("首帧与图片参考不能同时使用");
  if (!capability.ratios.includes(requirement.ratio)) reasons.push(`不支持画幅 ${requirement.ratio}`);
  if (requirement.duration === undefined) {
    if (!capability.durations.length) reasons.push("未声明支持的时长");
  } else if (!capability.durations.includes(requirement.duration)) {
    reasons.push(`不支持时长 ${requirement.duration} 秒`);
  }
  const [width = 9, height = 16] = requirement.ratio.split(":").map(Number);
  const heights = capability.resolutions.flatMap(resolution => {
    const value = resolutionHeight(resolution, width, height);
    return value === undefined ? [] : [value];
  });
  if (!heights.length) reasons.push("分辨率格式无法识别");
  else if (Math.max(...heights) < requirement.minResolutionHeight) reasons.push(`最高分辨率不足 ${requirement.minResolutionHeight}p`);
  return { passed: !reasons.length, reasons };
}

export interface MediaReference {
  path: string;
  mimeType: string;
}

export interface MediaGenerationRequest {
  providerId: string;
  modelId: string;
  prompt: string;
  outputDirectory?: string;
  images?: MediaReference[];
  videos?: MediaReference[];
  audios?: MediaReference[];
  firstFrame?: MediaReference;
  lastFrame?: MediaReference;
  ratio?: string;
  size?: string;
  resolution?: string;
  duration?: number;
  generateAudio?: boolean;
  voice?: string;
  speed?: number;
  volume?: number;
  format?: string;
  sampleRate?: number;
  mode?: "singleImage" | "startEndRequired" | "endFrameOptional" | "startFrameOptional" | "text"
    | (`${"image" | "video" | "audio"}Reference:${number}`)[];
}

export interface GeneratedMedia {
  path: string;
  mimeType: string;
  mediaType: "image" | "video" | "audio";
}

export interface MediaContext {
  listModels(): Promise<MediaModel[]>;
  generateImage(request: MediaGenerationRequest, signal?: AbortSignal): Promise<GeneratedMedia[]>;
  generateVideo(request: MediaGenerationRequest, signal?: AbortSignal): Promise<GeneratedMedia[]>;
  generateAudio(request: MediaGenerationRequest, signal?: AbortSignal): Promise<GeneratedMedia[]>;
}

export interface QuestionField {
  field: string;
  title: string;
  type: "input" | "textarea" | "radio" | "checkbox" | "select" | "inputNumber" | "switch";
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

export interface QuestionRequest {
  title: string;
  question: string;
  options?: string[];
  fields?: QuestionField[];
}

export interface QuestionAnswer {
  answer: string;
  values?: Record<string, string | number | boolean | string[]>;
  skipped?: boolean;
}

export type ToolCall = {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  status: "running" | "success" | "error" | "interrupted";
  result?: string;
  question?: QuestionRequest & { callId: string };
};

export interface QuestionContext {
  ask(toolCallId: string, request: QuestionRequest, signal?: AbortSignal): Promise<QuestionAnswer>;
}

export type SkillScope = "workspace" | "global";
export type SkillLocation = { name: string; scope?: SkillScope; path?: string };
export type SkillDocument = { name: string; scope: SkillScope; path: string; content: string };

export interface SkillContext {
  list(scope?: SkillScope): { name: string; description: string; scope: SkillScope; filePath: string; disableModelInvocation: boolean }[];
  read(request: SkillLocation, signal?: AbortSignal): Promise<SkillDocument>;
  create(request: SkillLocation & { content: string }, signal?: AbortSignal): Promise<Omit<SkillDocument, "content">>;
  update(request: SkillLocation & { content: string }, signal?: AbortSignal): Promise<Omit<SkillDocument, "content">>;
}

export interface ToolContext {
  ffmpeg(signal?: AbortSignal): Promise<FfmpegFactory>;
  media?: MediaContext;
  canvas?: CanvasContext;
  question?: QuestionContext;
  skills?: SkillContext;
  cwd: string;
  config: Record<string, unknown>;
  resolvePath(path: string, readOnly?: boolean): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  sdk: Pick<typeof import("@earendil-works/pi-coding-agent"),
    "defineTool" | "createReadToolDefinition" | "createWriteToolDefinition" |
    "createEditToolDefinition" | "createLsToolDefinition" | "detectSupportedImageMimeTypeFromFile">;
}

export interface ToolPlugin {
  validateConfig(config: Record<string, unknown>): Record<string, unknown>;
  createTools(context: ToolContext): ToolDefinition[] | Promise<ToolDefinition[]>;
}
