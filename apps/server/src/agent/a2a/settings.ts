import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import conf from "@/utils/conf";
import { getAppOrigin } from "@/utils/mcp/control";

export type A2aSettings = {
  enabled: boolean;
  token: string;
  userId: string;
  providerId: string;
  modelId: string;
  thinkingLevel: "off" | "low" | "medium" | "high";
};

let controller = new AbortController();

export function getA2aSettings(): A2aSettings {
  const value = (conf.get("a2a") ?? {}) as Partial<Record<keyof A2aSettings, unknown>>;
  return {
    enabled: value?.enabled === true,
    token: typeof value?.token === "string" ? value.token : "",
    userId: typeof value?.userId === "string" ? value.userId : "",
    providerId: typeof value?.providerId === "string" ? value.providerId : "",
    modelId: typeof value?.modelId === "string" ? value.modelId : "",
    thinkingLevel: value?.thinkingLevel === "low" || value?.thinkingLevel === "medium" || value?.thinkingLevel === "high" ? value.thinkingLevel : "off",
  };
}

export function getA2aUrl(req: Request) {
  return `${req.protocol}://${req.get("host")}/a2a`;
}

export function authenticateA2a(req: Request) {
  const { enabled, token, userId } = getA2aSettings();
  if (!enabled || token.length < 32 || !userId) return;
  const local = process.env.minifeelDesktop === "1" || (process.env.NODE_ENV === "dev" && ["win32", "darwin"].includes(process.platform));
  if (local && !["localhost", "127.0.0.1", "[::1]"].includes(req.hostname)) return;
  if (req.get("origin")) {
    try { getAppOrigin(req); } catch { return; }
  }
  const actual = Buffer.from(req.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return;
  return userId;
}

export function getA2aSignal() {
  return controller.signal;
}

conf.onDidChange("a2a", (next, previous) => {
  if (JSON.stringify(next) === JSON.stringify(previous)) return;
  const previousController = controller;
  controller = new AbortController();
  previousController.abort(new Error("A2A 设置已修改，当前任务已取消"));
});
