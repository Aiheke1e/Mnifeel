import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { z } from "zod";
import type postgres from "postgres";
import { writeAudit } from "@/utils/audit";
import { getDatabase } from "@/utils/database";
import type { MediaType, ProviderType } from "@/utils/database/types";
import { decryptSecret, encryptSecret } from "@/utils/secrets";
import { redactErrorMessage, redactSecrets } from "@/utils/providers/redact";
import type { ProviderAdapter, ProviderModelDefinition, ProviderRuntimeConfig } from "@/utils/providers/types";
import deepSeek from "@/utils/providers/deepSeek";
import agnes from "@/utils/providers/agnes";
import bananaPro from "@/utils/providers/bananaPro";
import { parsePricing } from "@/utils/billing/pricing";

export * from "@/utils/providers/redact";
export type * from "@/utils/providers/types";

type ConnectionStatus = "pending" | "passed" | "failed";
type ProviderRow = {
  id: string;
  type: ProviderType;
  displayName: string;
  baseUrl: string;
  enabled: boolean;
  apiKeyCiphertext: string | null;
  apiKeyIv: string | null;
  apiKeyTag: string | null;
  connectionStatus: ConnectionStatus;
  lastTestedAt: Date | null;
  lastTestMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ModelRow = {
  id: string;
  providerId: string;
  providerType: ProviderType;
  providerDisplayName: string;
  upstreamModelId: string;
  displayName: string;
  mediaType: MediaType;
  enabled: boolean;
  isDefault: boolean;
  capabilities: Record<string, unknown>;
  pricing: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
};

const providerAdapters = new Map<ProviderType, ProviderAdapter>([
  ["deepSeek", deepSeek],
  ["agnes", agnes],
  ["bananaPro", bananaPro],
]);
const providerModelSchema = z.object({
  upstreamModelId: z.string().trim().min(1).max(300),
  displayName: z.string().trim().min(1).max(160),
  mediaType: z.enum(["text", "image", "video"]),
  capabilities: z.record(z.string(), z.json()).optional(),
});

function invalid(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function normalizeBaseUrl(value: string) {
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { return invalid("供应商基础地址无效"); }
  const localHttp = process.env.NODE_ENV === "dev" && process.env.MINIFEEL_ALLOW_INSECURE_PROVIDER_URLS === "true"
    && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash) {
    invalid("供应商基础地址必须是无凭据、查询参数和片段的 HTTPS 地址");
  }
  return url.href.replace(/\/+$/, "");
}

function safeProviderMessage(value: unknown, fallback: string, apiKey?: string) {
  const message = redactErrorMessage(value, fallback);
  return (apiKey ? message.replaceAll(apiKey, "[REDACTED]") : message).slice(0, 1000);
}

function publicProvider(row: ProviderRow) {
  const { apiKeyCiphertext, apiKeyIv, apiKeyTag, ...provider } = row;
  return { ...provider, hasApiKey: Boolean(apiKeyCiphertext && apiKeyIv && apiKeyTag) };
}

function requireAdapter(type: ProviderType) {
  return providerAdapters.get(type) ?? invalid(`供应商 ${type} 的适配器尚未安装`, 501);
}

function runtimeProvider(row: ProviderRow): ProviderRuntimeConfig {
  if (!row.apiKeyCiphertext || !row.apiKeyIv || !row.apiKeyTag) invalid("请先保存供应商 API Key");
  return {
    id: row.id,
    type: row.type,
    displayName: row.displayName,
    baseUrl: row.baseUrl,
    apiKey: decryptSecret({ ciphertext: row.apiKeyCiphertext, iv: row.apiKeyIv, tag: row.apiKeyTag }),
  };
}

async function readProvider(providerId: string) {
  const rows = await getDatabase()<ProviderRow[]>`
    select * from "providerConfigs" where "id" = ${providerId} limit 1
  `;
  return rows[0] ?? invalid("供应商不存在", 404);
}

export function registerProviderAdapter(type: ProviderType, adapter: ProviderAdapter) {
  providerAdapters.set(type, adapter);
}

export async function listAdminProviders() {
  const rows = await getDatabase()<ProviderRow[]>`
    select * from "providerConfigs" order by "createdAt", "type"
  `;
  return rows.map(publicProvider);
}

export async function saveProvider(adminUserId: string, input: {
  type: ProviderType;
  displayName: string;
  baseUrl: string;
  enabled: boolean;
  apiKey?: string;
}) {
  const displayName = input.displayName.trim();
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const apiKey = input.apiKey?.trim();
  if (!displayName) invalid("供应商名称不能为空");
  if (input.apiKey !== undefined && !apiKey) invalid("新密钥不能为空");
  const result = await getDatabase().begin(async transaction => {
    const rows = await transaction<ProviderRow[]>`
      select * from "providerConfigs" where "type" = ${input.type} limit 1 for update
    `;
    const current = rows[0];
    const apiKeyUpdated = apiKey !== undefined;
    const connectionChanged = !current || current.baseUrl !== baseUrl || apiKeyUpdated;
    const encrypted = apiKey ? encryptSecret(apiKey) : undefined;
    const providerId = current?.id ?? randomUUID();
    const saved = current
      ? await transaction<ProviderRow[]>`
          update "providerConfigs" set
            "displayName" = ${displayName},
            "baseUrl" = ${baseUrl},
            "enabled" = ${input.enabled},
            "apiKeyCiphertext" = ${encrypted?.ciphertext ?? current.apiKeyCiphertext},
            "apiKeyIv" = ${encrypted?.iv ?? current.apiKeyIv},
            "apiKeyTag" = ${encrypted?.tag ?? current.apiKeyTag},
            "connectionStatus" = ${connectionChanged ? "pending" : current.connectionStatus},
            "lastTestedAt" = ${connectionChanged ? null : current.lastTestedAt},
            "lastTestMessage" = ${connectionChanged ? null : current.lastTestMessage},
            "updatedAt" = now()
          where "id" = ${providerId}
          returning *
        `
      : await transaction<ProviderRow[]>`
          insert into "providerConfigs" (
            "id", "type", "displayName", "baseUrl", "enabled",
            "apiKeyCiphertext", "apiKeyIv", "apiKeyTag"
          ) values (
            ${providerId}, ${input.type}, ${displayName}, ${baseUrl}, ${input.enabled},
            ${encrypted?.ciphertext ?? null}, ${encrypted?.iv ?? null}, ${encrypted?.tag ?? null}
          ) returning *
        `;
    await writeAudit({
      adminUserId,
      action: current ? "providerUpdated" : "providerCreated",
      targetType: "provider",
      targetId: providerId,
      details: { type: input.type, displayName, baseUrl, enabled: input.enabled, apiKeyUpdated },
      database: transaction,
    });
    return saved[0]!;
  });
  return publicProvider(result);
}

export async function testProvider(adminUserId: string, providerId: string, signal?: AbortSignal) {
  const provider = await readProvider(providerId);
  let config: ProviderRuntimeConfig | undefined;
  try {
    config = runtimeProvider(provider);
    const result = await requireAdapter(provider.type).testConnection(config, signal);
    const message = safeProviderMessage(result?.message ?? "连接测试成功", "连接测试成功", config.apiKey);
    await getDatabase().begin(async transaction => {
      await transaction`
        update "providerConfigs" set "connectionStatus" = 'passed', "lastTestedAt" = now(),
          "lastTestMessage" = ${message}, "updatedAt" = now() where "id" = ${providerId}
      `;
      await writeAudit({
        adminUserId, action: "providerTested", targetType: "provider", targetId: providerId,
        details: { type: provider.type, status: "passed", message }, database: transaction,
      });
    });
    return { status: "passed" as const, message };
  } catch (reason) {
    const message = safeProviderMessage(reason, "连接测试失败", config?.apiKey);
    await getDatabase().begin(async transaction => {
      await transaction`
        update "providerConfigs" set "connectionStatus" = 'failed', "lastTestedAt" = now(),
          "lastTestMessage" = ${message}, "updatedAt" = now() where "id" = ${providerId}
      `;
      await writeAudit({
        adminUserId, action: "providerTested", targetType: "provider", targetId: providerId,
        details: { type: provider.type, status: "failed", message }, database: transaction,
      });
    });
    throw Object.assign(new Error(message), { status: (reason as { status?: number })?.status ?? 502 });
  }
}

export async function syncProviderModels(adminUserId: string, providerId: string, signal?: AbortSignal) {
  const provider = await readProvider(providerId);
  if (provider.connectionStatus !== "passed") invalid("供应商连接测试通过后才能同步模型", 409);
  const config = runtimeProvider(provider);
  let definitions: z.infer<typeof providerModelSchema>[];
  try {
    definitions = z.array(providerModelSchema).min(1).max(2000).parse(
      await requireAdapter(provider.type).listModels(config, signal),
    );
  } catch (reason) {
    const message = safeProviderMessage(reason, "同步模型失败", config.apiKey);
    await writeAudit({
      adminUserId, action: "providerModelsSyncFailed", targetType: "provider", targetId: providerId,
      details: { type: provider.type, message },
    });
    throw Object.assign(new Error(message), { status: (reason as { status?: number })?.status ?? 502 });
  }
  await getDatabase().begin(async transaction => {
    for (const model of definitions) {
      const capabilities = redactSecrets(model.capabilities ?? {}) as Record<string, unknown>;
      await transaction`
        insert into "modelConfigs" (
          "id", "providerId", "upstreamModelId", "displayName", "mediaType", "capabilities"
        ) values (
          ${randomUUID()}, ${providerId}, ${model.upstreamModelId}, ${model.displayName},
          ${model.mediaType}, ${transaction.json(capabilities as postgres.JSONValue)}
        )
        on conflict ("providerId", "upstreamModelId") do update set
          "displayName" = excluded."displayName",
          "enabled" = case when "modelConfigs"."mediaType" = excluded."mediaType" then "modelConfigs"."enabled" else false end,
          "isDefault" = case when "modelConfigs"."mediaType" = excluded."mediaType" then "modelConfigs"."isDefault" else false end,
          "mediaType" = excluded."mediaType",
          "capabilities" = excluded."capabilities",
          "updatedAt" = now()
      `;
    }
    await writeAudit({
      adminUserId, action: "providerModelsSynced", targetType: "provider", targetId: providerId,
      details: { type: provider.type, count: definitions.length }, database: transaction,
    });
  });
  return { count: definitions.length };
}

export async function debugProviderModel(adminUserId: string, input: {
  providerId: string;
  modelId: string;
  prompt: string;
  referenceImage?: { data: string; mimeType: string };
}, signal?: AbortSignal) {
  let provider: ProviderRow | undefined;
  let model: ModelRow | undefined;
  let config: ProviderRuntimeConfig | undefined;
  try {
    provider = await readProvider(input.providerId);
    if (provider.connectionStatus !== "passed") invalid("供应商连接测试通过后才能调试模型", 409);
    const rows = await getDatabase()<ModelRow[]>`
      select m.*, p."type" as "providerType", p."displayName" as "providerDisplayName"
      from "modelConfigs" m join "providerConfigs" p on p."id" = m."providerId"
      where m."id" = ${input.modelId} and m."providerId" = ${input.providerId}
      limit 1
    `;
    model = rows[0] ?? invalid("该供应商下不存在这个模型", 404);
    if (input.referenceImage && provider.type !== "bananaPro") invalid("只有 BananaPro 图片调试支持参考图");
    config = runtimeProvider(provider);
    const adapter = requireAdapter(provider.type);
    const definition = {
      upstreamModelId: model.upstreamModelId,
      displayName: model.displayName,
      mediaType: model.mediaType,
      capabilities: model.capabilities,
    } satisfies ProviderModelDefinition;
    let result;
    if (provider.type === "deepSeek") {
      if (model.mediaType !== "text" || !adapter.runText) invalid("所选模型不支持文本调试");
      result = { type: "text" as const, ...await adapter.runText(config, definition, {
        messages: [{ role: "user", content: input.prompt }],
      }, signal) };
    } else if (provider.type === "bananaPro") {
      if (model.mediaType !== "image" || !adapter.runImage) invalid("所选模型不支持图片调试");
      const assets = await adapter.runImage(config, definition, {
        prompt: input.prompt,
        images: input.referenceImage ? [input.referenceImage] : undefined,
      }, signal);
      if (!assets.length) invalid("供应商未返回图片", 502);
      const asset = assets[0]!;
      if (asset.type === "base64" && !["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType)) {
        invalid("供应商返回了不支持的图片格式", 502);
      }
      result = { type: "image" as const, asset };
    } else {
      if (model.mediaType !== "video" || !adapter.createVideo || !adapter.getVideo) invalid("所选模型不支持视频调试");
      const task = await adapter.createVideo(config, definition, { prompt: input.prompt }, signal);
      while (!result) {
        signal?.throwIfAborted();
        const video = await adapter.getVideo(config, task, signal);
        if (video.status === "succeeded") {
          if (!video.asset) invalid("视频任务完成但没有返回文件", 502);
          result = { type: "video" as const, asset: video.asset };
        } else if (video.status === "failed") {
          invalid(video.error || "视频生成失败", 502);
        } else {
          await wait(3000, undefined, { signal });
        }
      }
    }
    await writeAudit({
      adminUserId, action: "providerModelDebugged", targetType: "model", targetId: input.modelId,
      details: { providerType: provider.type, mediaType: model.mediaType },
    });
    return result;
  } catch (reason) {
    const message = safeProviderMessage(reason, "模型调试失败", config?.apiKey);
    await writeAudit({
      adminUserId, action: "providerModelDebugFailed", targetType: "model", targetId: input.modelId,
      details: { providerType: provider?.type, mediaType: model?.mediaType, message },
    });
    throw Object.assign(new Error(message), { status: (reason as { status?: number })?.status ?? 502 });
  }
}

export async function listAdminModels() {
  return getDatabase()<ModelRow[]>`
    select m.*, p."type" as "providerType", p."displayName" as "providerDisplayName"
    from "modelConfigs" m join "providerConfigs" p on p."id" = m."providerId"
    order by m."mediaType", p."displayName", m."displayName"
  `;
}

export async function saveModel(adminUserId: string, input: {
  modelId: string;
  displayName: string;
  mediaType: MediaType;
  enabled: boolean;
  isDefault: boolean;
  capabilities: Record<string, unknown>;
  pricing: Record<string, number>;
}) {
  if (input.isDefault && !input.enabled) invalid("默认模型必须同时启用");
  const displayName = input.displayName.trim();
  if (!displayName) invalid("模型名称不能为空");
  const capabilities = redactSecrets(input.capabilities) as Record<string, unknown>;
  const pricing = parsePricing(input.mediaType, input.pricing) as Record<string, number>;
  return getDatabase().begin(async transaction => {
    const rows = await transaction<(ModelRow & { connectionStatus: ConnectionStatus })[]>`
      select m.*, p."type" as "providerType", p."displayName" as "providerDisplayName",
        p."connectionStatus"
      from "modelConfigs" m join "providerConfigs" p on p."id" = m."providerId"
      where m."id" = ${input.modelId} limit 1 for update of m
    `;
    const current = rows[0] ?? invalid("模型不存在", 404);
    if (input.enabled && current.connectionStatus !== "passed") invalid("供应商连接测试通过后才能启用模型", 409);
    if (input.enabled && input.isDefault) {
      await transaction`
        update "modelConfigs" set "isDefault" = false, "updatedAt" = now()
        where "mediaType" = ${input.mediaType} and "id" <> ${input.modelId} and "isDefault"
      `;
    }
    const saved = await transaction<ModelRow[]>`
      update "modelConfigs" set
        "displayName" = ${displayName},
        "mediaType" = ${input.mediaType},
        "enabled" = ${input.enabled},
        "isDefault" = ${input.isDefault},
        "capabilities" = ${transaction.json(capabilities as postgres.JSONValue)},
        "pricing" = ${transaction.json(pricing as postgres.JSONValue)},
        "updatedAt" = now()
      where "id" = ${input.modelId}
      returning *
    `;
    await writeAudit({
      adminUserId, action: "modelUpdated", targetType: "model", targetId: input.modelId,
      details: {
        displayName, mediaType: input.mediaType, enabled: input.enabled, isDefault: input.isDefault,
        capabilities, pricing,
      } as postgres.JSONValue,
      database: transaction,
    });
    return { ...saved[0]!, providerType: current.providerType, providerDisplayName: current.providerDisplayName };
  });
}

export async function listPublicModels(mediaTypes?: MediaType[]) {
  const database = getDatabase();
  const rows = mediaTypes?.length
    ? await database<ModelRow[]>`
        select m.*, p."type" as "providerType", p."displayName" as "providerDisplayName"
        from "modelConfigs" m join "providerConfigs" p on p."id" = m."providerId"
        where m."enabled" and p."enabled" and p."connectionStatus" = 'passed'
          and m."mediaType" in ${database(mediaTypes)}
        order by m."mediaType", m."isDefault" desc, m."displayName"
      `
    : await database<ModelRow[]>`
        select m.*, p."type" as "providerType", p."displayName" as "providerDisplayName"
        from "modelConfigs" m join "providerConfigs" p on p."id" = m."providerId"
        where m."enabled" and p."enabled" and p."connectionStatus" = 'passed'
        order by m."mediaType", m."isDefault" desc, m."displayName"
      `;
  return rows.map(model => ({
    id: model.id,
    displayName: model.displayName,
    mediaType: model.mediaType,
    capabilities: model.capabilities,
    isDefault: model.isDefault,
    pricing: model.pricing,
  }));
}

export async function findRunnableTextModel(providerType: string, upstreamModelId: string) {
  const rows = await getDatabase()<Pick<ModelRow, "upstreamModelId" | "displayName" | "capabilities">[]>`
    select m."upstreamModelId", m."displayName", m."capabilities"
    from "modelConfigs" m join "providerConfigs" p on p."id" = m."providerId"
    where m."mediaType" = 'text' and m."enabled" and p."enabled" and p."connectionStatus" = 'passed'
      and p."type" = ${providerType} and m."upstreamModelId" = ${upstreamModelId}
    limit 1
  `;
  return rows[0];
}

export async function getRunnableModel(modelId: string, mediaType?: MediaType) {
  const rows = await getDatabase()<(ModelRow & Omit<ProviderRow, "id" | "displayName" | "enabled"> & { providerEnabled: boolean })[]>`
    select m.*, p."id" as "providerId", p."type", p."displayName" as "providerDisplayName",
      p."baseUrl", p."enabled" as "providerEnabled", p."apiKeyCiphertext", p."apiKeyIv", p."apiKeyTag",
      p."connectionStatus", p."lastTestedAt", p."lastTestMessage"
    from "modelConfigs" m join "providerConfigs" p on p."id" = m."providerId"
    where m."id" = ${modelId} limit 1
  `;
  const row = rows[0] as (ModelRow & ProviderRow & { providerEnabled: boolean }) | undefined;
  if (!row || !row.enabled || !row.providerEnabled || row.connectionStatus !== "passed") {
    invalid("所选模型尚未启用或供应商未通过连接测试", 409);
  }
  if (mediaType && row.mediaType !== mediaType) invalid("所选模型类型不匹配");
  return {
    provider: runtimeProvider({ ...row, id: row.providerId, displayName: row.providerDisplayName, enabled: row.providerEnabled }),
    adapter: requireAdapter(row.type),
    model: {
      upstreamModelId: row.upstreamModelId,
      displayName: row.displayName,
      mediaType: row.mediaType,
      capabilities: row.capabilities,
    } satisfies ProviderModelDefinition,
    pricing: row.pricing,
  };
}
