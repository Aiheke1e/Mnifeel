import logger from "morgan";
import express from "express";
import cors from "cors";
import { resolve } from "node:path";
import type { Request, Response, NextFunction } from "express";
import buildRoute from "@/core";
import { error } from "@/lib/responseFormat";
import { requireAdmin, requireAuth, resolveAuth } from "@/lib/middleware";
import desktopRequest from "@/lib/desktop";
import initializePlugins from "@/utils/plugins/initialize";
import { redactError, redactErrorMessage } from "@/utils/providers/redact";

const autoInstallProviders = ["tfRouter.ts"];

export async function createApp({
  webRoot,
  dataDirectory,
  toolsRoot,
  nodesRoot,
  providersRoot,
  skillsRoot,
  agentsRoot,
  pluginRevision,
}: {
  webRoot: string;
  dataDirectory?: string;
  toolsRoot?: string;
  nodesRoot?: string;
  providersRoot?: string;
  skillsRoot?: string;
  agentsRoot?: string;
  pluginRevision?: string;
}) {
  // conf 由下方的路由动态加载，必须先确定整个进程共用的数据目录。
  if (dataDirectory) process.env.MINIFEEL_DATA_DIR = resolve(dataDirectory);
  const [{ checkDatabase }, { default: migrateDatabase }, { validateSecretKey }] = await Promise.all([
    import("@/utils/database"),
    import("@/utils/database/migrate"),
    import("@/utils/secrets"),
  ]);
  validateSecretKey();
  await checkDatabase();
  await migrateDatabase();
  const { initializeAdmin } = await import("@/utils/auth");
  await initializeAdmin();
  if (dataDirectory && toolsRoot)
    await initializePlugins(resolve(dataDirectory, "tools"), toolsRoot, /^[a-z][a-zA-Z0-9]*\.tool\.js$/, pluginRevision);
  if (dataDirectory && nodesRoot) await initializePlugins(resolve(dataDirectory, "nodes"), nodesRoot, /^[a-z][a-zA-Z0-9]*\.umd\.js$/, pluginRevision);
  // ACT: 供应方和技能可由用户编辑，只补首次安装，不随应用版本覆盖。
  if (dataDirectory && providersRoot)
    await initializePlugins(resolve(dataDirectory, "providers"), resolve(providersRoot, "media"), autoInstallProviders);
  if (dataDirectory && skillsRoot) await initializePlugins(resolve(dataDirectory, "skills"), skillsRoot);
  if (dataDirectory && agentsRoot) await initializePlugins(resolve(dataDirectory, "agents"), agentsRoot);
  const app = express();

  if (process.env.NODE_ENV === "dev") {
    await buildRoute();
    app.use(logger("dev"));
  }
  app.use(cors());
  app.use("/a2a", express.json({ limit: "2mb" }));
  app.use(["/api/workspaces/files/write", "/api/assets/save"], express.raw({ type: "application/octet-stream", limit: "100mb" }));
  app.use(express.json({ limit: "100mb" }));
  app.use(express.urlencoded({ extended: true, limit: "100mb" }));
  app.use("/api/desktop", desktopRequest);
  app.use("/api", resolveAuth);
  app.use("/api", (request, response, next) => {
    const publicRoutes = new Set([
      "GET /hello",
      "GET /auth/options",
      "POST /auth/requestCode",
      "POST /auth/phone",
      "POST /auth/password",
      "POST /auth/google",
      "PUT /auth/passwordReset",
    ]);
    if (publicRoutes.has(`${request.method} ${request.path}`)) return next();
    requireAuth(request, response, next);
  });
  app.use("/api/admin", requireAdmin);
  app.use("/api/providers", requireAdmin);
  app.use(["/api/assets", "/api/workspaces/list", "/api/workspaces/selectDirectory"], requireAdmin);

  const router = await import("@/router");
  router.default(app);
  const [{ createMcpRouter }, { getMcpTools }, { authorizeMcp }, { skillResources }] = await Promise.all([
    import("@minifeel/mcp"),
    import("@/utils/mcp/tools"),
    import("@/utils/mcp/control"),
    import("@/utils/mcp/resources"),
  ]);
  app.use("/mcp", resolveAuth, requireAuth, createMcpRouter({ getTools: getMcpTools, authorize: authorizeMcp, resources: skillResources }));
  const { createA2aRouter } = await import("@/agent/a2a");
  app.use("/a2a", resolveAuth, requireAuth, createA2aRouter());
  app.use(express.static(webRoot));

  // 错误处理
  app.use((err: Error & { status?: number }, request: Request, response: Response, next: NextFunction) => {
    if (response.headersSent) return next(err);
    console.error(redactError(err));
    const code = (err as NodeJS.ErrnoException).code;
    const status = err.status || ({ ENOENT: 404, ENOTDIR: 404, EEXIST: 409, ENOTEMPTY: 409, EACCES: 403, EPERM: 403 }[code ?? ""] ?? 500);
    const message =
      {
        ENOENT: "找不到这个文件或文件夹，可能已被移动、删除，或者位置选错了。",
        ENOTDIR: "你选中的是文件，但这里需要选择文件夹。请重新选择。",
        EEXIST: "这个名称已经被占用了，请换一个名称。原来的内容不会被覆盖。",
        ENOTEMPTY: "这个文件夹里还有内容，不能直接删除。请先清空或移走里面的文件。",
        EACCES: "没有权限访问这个文件或文件夹。请检查权限，或换一个位置重试。",
        EPERM: "系统不允许这次操作。文件可能正在被其他程序使用，请关闭后重试。",
        EISDIR: "你选中的是文件夹，但这里需要的是文件。请重新选择具体文件。",
      }[code ?? ""] ?? redactErrorMessage(err, "请求失败");
    response.status(status).json(error(message, code ? { code } : null, status));
  });

  return app;
}
