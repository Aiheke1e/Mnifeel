import conf from "conf";
import { resolve } from "node:path";
import type { A2aSettings } from "@/agent/a2a/settings";

const config = new conf<{ settings: Record<string, unknown>; toolConfigs: Record<string, Record<string, unknown>>; nodeConfigs: Record<string, Record<string, unknown>>; a2a: A2aSettings }>({
  cwd: process.env.MINIFEEL_DATA_DIR ?? resolve(import.meta.dirname, "../../../../../data"),
  configName: "settings",
  configFileMode: 0o600,
  watch: true,
});

export function removeLegacySettings(settings: Record<string, unknown>) {
  let changed = false;
  // ACT: 只清理已废弃字段，保留其他设置和插件配置。
  for (const [record, key] of [
    [settings, "developerConfirmed"],
    [settings, "privacy"],
    [settings.general, "systemPrompt"],
    [settings.stores, "minifeel.developer"],
  ] as const) {
    if (record && typeof record === "object" && !Array.isArray(record) && Object.hasOwn(record, key)) {
      Reflect.deleteProperty(record, key);
      changed = true;
    }
  }
  return changed;
}

const settings = config.get("settings", {});
if (removeLegacySettings(settings)) config.set("settings", settings);

export default config;
