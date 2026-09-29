# Minifeel Web 开发与部署

Minifeel 当前以 Web 前端、Bun 业务服务和 PostgreSQL 运行。账号、项目、积分、模型配置与审计数据存入 PostgreSQL；设置、内置插件和工作区文件存入服务端数据目录。除管理员配置的文本、图片和视频模型 API 外，业务运行不依赖 Minifeel 托管服务。

## 本地开发

先安装根目录 `package.json` 指定的 Bun 版本和 PostgreSQL，再复制 `environment.example` 为 `.env` 并填写数据库连接、会话密钥和初始管理员信息。

```sh
bun install
bun run db:migrate
bun run dev:plugins
bun run dev
```

Web 开发服务默认监听 `5173`，业务服务默认监听 `3000`。Vite 会把 `/api`、`/a2a` 和 `/mcp` 转发到业务服务。

常用命令：

| 命令 | 用途 |
| --- | --- |
| `bun run dev` | 同时启动 Web 与业务服务。 |
| `bun run dev:web` | 只启动 Web 开发服务。 |
| `bun run dev:server` | 只启动业务服务。 |
| `bun run dev:plugins` | 构建本地节点和工具，并同步到开发数据目录。 |
| `bun run db:migrate` | 执行数据库迁移。 |
| `bun run typecheck` | 检查所有工作区类型。 |
| `bun run build` | 构建工具、Web、业务服务和 MCP。 |
| `bun run start:server` | 启动构建后的独立服务。 |

## 生产部署

生产环境部署两个基础服务：Minifeel 应用服务和 PostgreSQL。应用服务同时提供 API 与构建后的 Web 静态资源，不需要单独的桌面壳、更新服务或插件市场服务。

```sh
bun install --frozen-lockfile
bun run db:migrate
bun run build
bun run start:server
```

通过 `PORT` 修改监听端口，通过 `MINIFEEL_DATA_DIR` 指定数据目录。数据库连接和会话密钥从环境变量读取，具体字段见 `environment.example`。生产环境应持久化 PostgreSQL 数据目录和 `MINIFEEL_DATA_DIR`。

FFmpeg 不会在运行时下载。需要视频合成或音频处理时，请在服务器预先安装 `ffmpeg` 与 `ffprobe`，并确保两者位于应用进程的 `PATH` 中。启动日志会报告缺失情况，相关操作也会返回明确错误。

## 模型配置

模型 API 只由管理员在管理后台配置。普通用户可以选择管理员启用的模型，无法查看或修改 API Key。当前运行时支持：

- 文本模型：OpenAI 兼容接口。
- 图片模型：管理员配置的图片生成接口。
- 视频模型：管理员配置的三模视频接口。

模型凭证经服务端加密保存，浏览器接口只返回脱敏状态。首次部署后应登录管理员账号，完成供应商地址、密钥、模型和计费规则配置。

## 本地插件

内置节点、工具、技能和 Agent 随应用构建并在数据目录初始化。运行时不会访问远程插件市场，也不会从 URL 安装插件。管理员需要调试本地扩展时，可使用现有本地文件安装接口；普通用户只读取和执行已启用的能力。

```sh
bun run build:nodes
bun run build:tools
bun run build:mcp
```

节点和工具开发约定分别见 `packages/nodeScaffold/readme.md` 与 `packages/toolScaffold/readme.md`。

## 路由与验证

服务端路由文件新增、移动或删除后，必须重新生成路由表：

```sh
bun run --cwd apps/server routes
```

提交前按改动范围执行类型检查和构建。涉及配置、认证、积分或文件操作时，再用临时数据目录和测试账号完成实际 HTTP 验证。仓库不新增测试文件或测试框架。

```sh
bun run --cwd apps/server typecheck
bun run --cwd apps/web typecheck
bun run --cwd apps/server build
bun run --cwd apps/web build
```
