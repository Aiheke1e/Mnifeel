# Minifeel 自托管部署

Minifeel 生产环境由两个服务组成：一个 Bun 应用服务和一个 PostgreSQL 数据库。Bun 服务同时提供 Web 页面、API、任务 Worker 和本机 MCP；项目文件与生成素材保存在应用服务的数据目录。

## 环境准备

安装仓库 `package.json` 指定版本的 Bun 和可用的 PostgreSQL。文本与图片生成只需要对应模型 API；视频合成、音频处理等本地媒体能力还需要服务器预装 `ffmpeg` 与 `ffprobe`，并将其加入 `PATH`。

复制环境变量示例并填写实际值：

```sh
cp environment.example .env
```

生产环境至少需要配置：

- `DATABASE_URL`：PostgreSQL 连接地址。
- `MINIFEEL_DATA_DIR`：持久化数据目录，生产环境建议使用绝对路径。
- `MINIFEEL_SECRET_KEY`：32 字节随机密钥的 Base64 文本，用于加密供应商密钥；部署后必须安全备份，不能随意更换。
- `MINIFEEL_ADMIN_PHONE`、`MINIFEEL_ADMIN_PASSWORD`：仅在数据库中没有管理员时创建首个管理员。
- `PORT`：应用监听端口，默认 `3000`。

开发阶段可启用模拟验证码和模拟 Google 登录。正式上线前应关闭 `MINIFEEL_AUTH_MOCK_CODE` 与 `MINIFEEL_AUTH_MOCK_GOOGLE`，并接入真实认证服务。

## 数据库初始化

创建空数据库和专用数据库账号，将连接地址写入 `DATABASE_URL`，然后执行迁移：

```sh
bun install --frozen-lockfile
bun run db:migrate
```

迁移可以重复执行。应用启动时也会检查数据库并补齐尚未执行的迁移。首次启动会根据管理员环境变量创建管理员；数据库中已有管理员时不会覆盖原账号或密码。

## 本地开发

```sh
bun install
bun run db:migrate
bun run dev:plugins
bun run dev
```

Web 开发服务默认监听 `5173`，应用服务默认监听 `3000`。Vite 会把 `/api`、`/a2a` 和 `/mcp` 请求转发到应用服务。

## 生产构建与启动

```sh
bun install --frozen-lockfile
bun run db:migrate
bun run build
bun run start:server
```

`bun run build` 会生成 `build/web`、`build/server`、`build/tools` 与 MCP 产物。`bun run start:server` 启动唯一的应用进程并直接提供 Web 静态资源，因此无需再部署独立前端服务、桌面程序、更新服务或插件市场服务。

公网部署时，应由现有网关或托管平台提供 HTTPS，并把请求完整转发到应用端口。会话 Cookie 在生产环境使用 `Secure`，浏览器和应用服务需要使用同一站点域名。

## 管理员初始化

使用 `MINIFEEL_ADMIN_PHONE` 和 `MINIFEEL_ADMIN_PASSWORD` 登录统一登录页。首次部署后在管理后台依次完成：

1. 配置 DeepSeek、Agnes 和 BananaPro 的接口地址与密钥。
2. 测试供应商连接并同步模型。
3. 启用面向用户的模型并设置积分价格。
4. 按需给普通用户增加积分或加入白名单。

普通用户只能选择管理员启用的模型，无法读取或修改 API 地址、密钥和计价配置。

## 旧项目导入

将旧项目父目录以绝对路径配置到 `MINIFEEL_LEGACY_WORKSPACE_DIR`，重启应用服务后，普通用户可以从首页进入“导入旧项目”。页面只显示该目录下第一层文件夹。

导入会把所选目录复制为当前账号的新项目。源目录保持不变；符号链接和其他特殊文件不会复制。单个项目最多导入 10,000 个普通文件，总大小不能超过 10 GB。复制完成前项目不会出现在项目列表，失败或连接中断会清理本次临时副本。

迁移完成后可以删除 `MINIFEEL_LEGACY_WORKSPACE_DIR` 并重启应用，关闭旧项目入口的数据来源。

## 数据备份与恢复

完整备份必须同时包含 PostgreSQL 和 `MINIFEEL_DATA_DIR`。为避免数据库记录与文件时间点不一致，先停止 Bun 应用服务，再执行：

```sh
pg_dump --format=custom --file=minifeel.dump "$DATABASE_URL"
```

随后复制整个 `MINIFEEL_DATA_DIR`。其中包括项目文件、生成素材、设置和本地扩展。恢复时先还原 PostgreSQL，再还原到原数据目录，确认 `MINIFEEL_SECRET_KEY` 与备份时一致，最后启动应用服务。

```sh
pg_restore --clean --if-exists --dbname="$DATABASE_URL" minifeel.dump
bun run start:server
```

## 更新与检查

更新代码前先完成备份。拉取目标版本后重新安装锁定依赖、执行迁移和生产构建，再重启应用服务：

```sh
git pull
bun install --frozen-lockfile
bun run db:migrate
bun run build
bun run start:server
```

启动日志应显示数据库连接成功和应用地址。FFmpeg 缺失不会阻止服务启动，但相关本地媒体操作会返回明确错误。部署完成后分别使用管理员和普通用户账号检查登录、项目访问、积分、模型列表和任务状态。
