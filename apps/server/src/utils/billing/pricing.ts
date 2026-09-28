import { z } from "zod";
import type { MediaType } from "@/utils/database/types";

const maxUsage = 1_000_000_000;
const maxPrice = 1_000_000_000;
const textPricingSchema = z.object({
  inputPerMillionTokens: z.number().int().min(0).max(maxPrice),
  outputPerMillionTokens: z.number().int().min(0).max(maxPrice),
}).strict();
const imagePricingSchema = z.object({
  perImage: z.number().int().min(0).max(maxPrice),
}).strict();
const videoPricingSchema = z.union([
  z.object({ perTask: z.number().int().min(0).max(maxPrice) }).strict(),
  z.object({ perSecond: z.number().int().min(0).max(maxPrice) }).strict(),
]);

export type GenerationUsage = {
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  durationSeconds?: number;
};

export type Pricing =
  | z.infer<typeof textPricingSchema>
  | z.infer<typeof imagePricingSchema>
  | z.infer<typeof videoPricingSchema>;

function invalid(message: string): never {
  throw Object.assign(new Error(message), { status: 400 });
}

function positiveInteger(value: unknown, name: string, fallback?: number) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > maxUsage) invalid(`${name}必须是正整数`);
  return Number(value);
}

function nonnegativeInteger(value: unknown, name: string) {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > maxUsage) invalid(`${name}必须是非负整数`);
  return Number(value);
}

function safeCredits(value: bigint) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) invalid("预计积分超过系统上限");
  return Number(value);
}

function ceilRate(units: number, rate: number, scale = 1) {
  if (!rate || !units) return 0;
  return safeCredits((BigInt(units) * BigInt(rate) + BigInt(scale - 1)) / BigInt(scale));
}

function readMaxOutputTokens(input: Record<string, unknown>, capabilities: Record<string, unknown>) {
  const configured = capabilities.maxOutputTokens;
  const limit = Number.isInteger(configured) && Number(configured) > 0 && Number(configured) <= maxUsage
    ? Number(configured)
    : 8192;
  const requested = input.maxTokens;
  if (requested === undefined) return limit;
  const value = positiveInteger(requested, "最大输出 token");
  if (value > limit) invalid(`最大输出 token 不能超过 ${limit}`);
  return value;
}

export function parsePricing(mediaType: MediaType, value: unknown): Pricing {
  const parsed = ({
    text: textPricingSchema,
    image: imagePricingSchema,
    video: videoPricingSchema,
  } as const)[mediaType].safeParse(value);
  if (!parsed.success) invalid(`请为${({ text: "文本", image: "图片", video: "视频" })[mediaType]}模型设置完整的整数积分价格`);
  return parsed.data;
}

export function estimateUsage(mediaType: MediaType, input: Record<string, unknown>, capabilities: Record<string, unknown>) {
  if (mediaType === "text") {
    const inputTokens = new TextEncoder().encode(JSON.stringify(input)).byteLength;
    if (inputTokens > maxUsage) invalid("文本输入超过计费上限");
    return { inputTokens, outputTokens: readMaxOutputTokens(input, capabilities) } satisfies GenerationUsage;
  }
  if (mediaType === "image") {
    return { imageCount: positiveInteger(input.count, "图片数量", 1) } satisfies GenerationUsage;
  }
  return { durationSeconds: positiveInteger(input.duration, "视频时长", 1) } satisfies GenerationUsage;
}

export function calculateCredits(mediaType: MediaType, pricingValue: unknown, usage: GenerationUsage) {
  const pricing = parsePricing(mediaType, pricingValue);
  if (mediaType === "text" && "inputPerMillionTokens" in pricing) {
    const inputTokens = nonnegativeInteger(usage.inputTokens, "输入 token");
    const outputTokens = nonnegativeInteger(usage.outputTokens, "输出 token");
    return ceilRate(inputTokens, pricing.inputPerMillionTokens, 1_000_000)
      + ceilRate(outputTokens, pricing.outputPerMillionTokens, 1_000_000);
  }
  if (mediaType === "image" && "perImage" in pricing) {
    return ceilRate(positiveInteger(usage.imageCount, "图片数量"), pricing.perImage);
  }
  if (mediaType === "video" && "perTask" in pricing) return pricing.perTask;
  if (mediaType === "video" && "perSecond" in pricing) {
    return ceilRate(positiveInteger(usage.durationSeconds, "视频时长"), pricing.perSecond);
  }
  return invalid("模型价格与任务类型不匹配");
}
