import { resolve } from "node:path";
import { createApp } from "./app";

const startTime = Date.now();
const realPort = 3000;
// 源码位于 apps/server/src，生产构建位于 build/server，均从文件位置定位根目录。
const fromSource = import.meta.path.endsWith(".ts");
const appDirectory = resolve(import.meta.dirname, fromSource ? "../../.." : "../..");
const dataDirectory = process.env.MINIFEEL_DATA_DIR ?? resolve(appDirectory, "data");
const app = await createApp({
  webRoot: resolve(appDirectory, "build/web"),
  dataDirectory,
  toolsRoot: resolve(appDirectory, "build/tools"),
  nodesRoot: resolve(appDirectory, "build/nodes"),
  // ACT: 暂不安装内置团队，随团队打包一同恢复。
  // agentsRoot: resolve(appDirectory, "build/agents"),
  providersRoot: resolve(appDirectory, fromSource ? "packages/providers/src" : "build/providers"),
  skillsRoot: resolve(appDirectory, fromSource ? "packages/skills" : "build/skills"),
});
const { initializeMcpRuntime } = await import("./utils/mcp/runtime");
const server = app.listen(Number(process.env.PORT) || realPort, async () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : realPort;
  await initializeMcpRuntime(app, `http://127.0.0.1:${port}`, resolve(appDirectory, fromSource ? "packages/mcp/src/stdio.ts" : "build/mcp/stdio.js"));
  console.log(`[服务启动成功]: http://localhost:${port}`);
  console.log(`[启动耗时]: ${(Date.now() - startTime).toFixed(2)}ms`);
});

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await new Promise<void>((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose()));
  const { stopGenerationWorker } = await import("./utils/generation/worker");
  await stopGenerationWorker();
  const { closeDatabase } = await import("./utils/database");
  await closeDatabase();
}

function handleCloseError(error: unknown) {
  console.error("服务关闭失败：", error);
  process.exitCode = 1;
}

process.once("SIGINT", () => void close().catch(handleCloseError));
process.once("SIGTERM", () => void close().catch(handleCloseError));
