import { createFfmpeg } from "./runtime";

export { createFfmpeg };
export { executeRemoteFfmpeg } from "./remote";
export type { BrowserFfmpegRequest } from "./browserTypes";
export type * from "./types";

const toolNames = ["ffmpeg", "ffprobe"] as const;

function executableName(name: string) {
  return process.platform === "win32" ? `${name}.exe` : name;
}

async function readVersion(path: string, name: string, signal?: AbortSignal) {
  const child = Bun.spawn([path, "-version"], {
    stdin: "ignore", stdout: "pipe", stderr: "ignore", windowsHide: true, timeout: 15000, signal,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "FFREPORT")),
  });
  const [output, code] = await Promise.all([child.stdout.text(), child.exited]);
  signal?.throwIfAborted();
  const version = output.split(/\r?\n/, 1)[0];
  if (code !== 0 || !version?.startsWith(`${name} version `)) throw new Error(`${name} 无法运行，请检查服务器安装是否完整`);
  return version;
}

export async function getToolStatus() {
  const entries = await Promise.all(toolNames.map(async (name) => {
    const path = Bun.which(executableName(name));
    try {
      return [name, { path, origin: path ? "system" as const : null, version: path ? await readVersion(path, name) : null, error: path ? null : "未在 PATH 中找到程序" }] as const;
    } catch (error) {
      return [name, { path, origin: path ? "system" as const : null, version: null, error: error instanceof Error ? error.message : String(error) }] as const;
    }
  }));
  return Object.fromEntries(entries) as Record<typeof toolNames[number], typeof entries[number][1]>;
}
