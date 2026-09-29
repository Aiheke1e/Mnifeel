# Minifeel 生产部署文档

本文档用于将 Minifeel Web 版本部署到 Linux 服务器。推荐使用 Docker Compose，将 Web 前端、Server、生成任务 Worker、内置节点、工具、技能、MCP 和 FFmpeg 打包为一个应用服务，并使用独立的 PostgreSQL 服务。

当前 `dev` 分支已经移除桌面客户端和更新服务，生产环境只部署 Web 版本。

## 1. 部署结构

```text
浏览器
  │ HTTPS 443
  ▼
Caddy 或 Nginx
  │ HTTP 127.0.0.1:3000
  ▼
Minifeel 应用
  ├─ Web 静态页面
  ├─ Express API
  ├─ 生成任务 Worker
  ├─ Nodes / Tools / Skills / Providers
  ├─ MCP
  └─ FFmpeg
  │
  ▼
PostgreSQL

持久化数据：
  ├─ PostgreSQL 数据卷
  └─ /app/data（项目文件、素材、设置和插件）
```

Minifeel 的前端构建结果由 Express 直接提供，不需要单独启动前端服务，也不需要单独部署静态网站。

## 2. 服务器准备

建议使用 Ubuntu 24.04 LTS 或当前受支持的 Debian 系统。服务器至少需要：

- Docker Engine；
- Docker Compose 插件；
- Git；
- 一个解析到服务器公网 IP 的域名；
- 开放 TCP `22`、`80`、`443`；
- 能访问模型供应商和软件包下载地址的出站网络。

建议从 2 核 CPU、4 GB 内存起步。图片和视频文件增长较快，磁盘容量应按实际生成量准备，并为数据库及项目数据预留备份空间。

应用端口 `3000` 只绑定到服务器回环地址，由反向代理访问，不直接暴露到公网。PostgreSQL 端口只在 Docker 内部网络开放。

## 3. 必须保存的数据和密钥

以下内容必须持久化并纳入备份：

| 内容 | 用途 | 丢失影响 |
| --- | --- | --- |
| PostgreSQL 数据卷 | 用户、项目、任务、积分和模型配置 | 业务数据丢失 |
| `/app/data` | 项目文件、生成素材、设置、节点和插件 | 项目文件及素材丢失 |
| `MINIFEEL_SECRET_KEY` | 加密模型供应商 API Key | 已保存的 API Key 无法解密 |
| 生产环境变量文件 | 数据库密码和启动配置 | 服务无法按原配置恢复 |

`MINIFEEL_SECRET_KEY` 上线后不得随意更换。环境变量文件权限应设置为仅部署用户可读：

```sh
chmod 600 .env.production
```

## 4. 生产环境变量

在服务器部署目录创建 `.env.production`：

```dotenv
POSTGRES_DB=minifeel
POSTGRES_USER=minifeel
POSTGRES_PASSWORD=替换为数据库强密码

MINIFEEL_SECRET_KEY=替换为32字节随机密钥的Base64文本
MINIFEEL_ADMIN_PHONE=+8613800000000
MINIFEEL_ADMIN_PASSWORD=替换为首次管理员强密码

# 可选：需要导入旧版项目时，填写旧工作区在容器内的绝对路径并挂载对应目录
MINIFEEL_LEGACY_WORKSPACE_DIR=

MINIFEEL_SESSION_DAYS=30
MINIFEEL_GENERATION_CONCURRENCY=4
MINIFEEL_GENERATION_STALE_SECONDS=120
```

生成主密钥：

```sh
openssl rand -base64 32
```

`MINIFEEL_ADMIN_PHONE` 和 `MINIFEEL_ADMIN_PASSWORD` 只在数据库内还没有管理员时用于创建首个管理员，后续重启不会覆盖现有管理员密码。

生产环境不要启用以下开发开关：

```dotenv
MINIFEEL_AUTH_MOCK_CODE=true
MINIFEEL_AUTH_MOCK_GOOGLE=true
MINIFEEL_ALLOW_INSECURE_PROVIDER_URLS=true
```

当前短信发送能力尚未接入时，可以直接使用初始化的管理员手机号和密码登录；不要为了登录而在公网生产环境开启模拟验证码。

## 5. Docker Compose 配置

仓库当前的 `compose.yaml` 尚未包含 PostgreSQL 和生产环境变量，不能直接作为完整生产配置使用。正式部署时应准备 `compose.production.yaml`，结构如下：

```yaml
services:
  postgres:
    image: postgres:17
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgresData:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 10

  minifeel:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    init: true
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3000
      MINIFEEL_DATA_DIR: /app/data
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      MINIFEEL_SECRET_KEY: ${MINIFEEL_SECRET_KEY}
      MINIFEEL_ADMIN_PHONE: ${MINIFEEL_ADMIN_PHONE}
      MINIFEEL_ADMIN_PASSWORD: ${MINIFEEL_ADMIN_PASSWORD}
      MINIFEEL_SESSION_DAYS: ${MINIFEEL_SESSION_DAYS:-30}
      MINIFEEL_GENERATION_CONCURRENCY: ${MINIFEEL_GENERATION_CONCURRENCY:-4}
      MINIFEEL_GENERATION_STALE_SECONDS: ${MINIFEEL_GENERATION_STALE_SECONDS:-120}
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - minifeelData:/app/data

volumes:
  postgresData:
  minifeelData:
```

如果数据库密码包含 `@`、`:`、`/`、`#`、`%` 等 URL 特殊字符，不能直接拼接进 `DATABASE_URL`。部署时应对用户名和密码进行 URL 编码，或单独提供已经正确编码的 `DATABASE_URL`。

## 6. 首次部署

将代码放到固定目录，例如 `/opt/minifeel`：

```sh
sudo mkdir -p /opt/minifeel
sudo chown "$USER":"$USER" /opt/minifeel
git clone <仓库地址> /opt/minifeel
cd /opt/minifeel
```

放入 `.env.production` 和 `compose.production.yaml` 后执行：

```sh
docker compose --env-file .env.production -f compose.production.yaml up -d --build
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs -f minifeel
```

应用启动时会自动检查数据库、执行未完成的迁移、初始化管理员及内置插件。日志出现下面内容表示应用已经开始监听：

```text
[服务启动成功]: http://localhost:3000
```

在服务器本机验证接口：

```sh
curl --fail http://127.0.0.1:3000/api/auth/options
```

接口应返回包含 `code`、`data` 和 `message` 的 JSON。

## 7. 域名和 HTTPS

生产环境必须通过 HTTPS 访问。服务在 `NODE_ENV=production` 时使用 Secure Cookie，直接通过公网 HTTP 访问会导致登录会话无法正常工作。

以 Caddy 为例：

```caddyfile
minifeel.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

将 `minifeel.example.com` 替换为实际域名。确认 DNS 已解析到服务器后，Caddy 会自动申请和续期 HTTPS 证书。

反向代理需支持普通 HTTP、流式响应和长连接，不要对生成事件流启用响应缓冲。上传大小建议设置为至少 100 MB，与应用当前请求上限一致。

## 8. 上线验证

首次部署完成后检查：

1. 域名可通过 HTTPS 打开；
2. 使用初始化管理员账号登录成功；
3. 创建项目后 `/app/data/workspaces` 出现对应目录；
4. 管理后台可以保存模型供应商配置；
5. 供应商连接测试成功；
6. 文本、图片或视频任务可以创建并更新状态；
7. 容器重启后用户、项目和素材仍然存在；
8. PostgreSQL 和 Minifeel 容器没有持续报错。

常用排查命令：

```sh
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs --tail=200 minifeel
docker compose --env-file .env.production -f compose.production.yaml logs --tail=200 postgres
docker compose --env-file .env.production -f compose.production.yaml exec minifeel ffmpeg -version
```

## 9. 更新发布

更新前先备份数据库和 `/app/data`，再拉取指定版本并重建应用：

```sh
cd /opt/minifeel
git fetch --all --tags
git checkout <经过验证的版本标签或提交>
docker compose --env-file .env.production -f compose.production.yaml build minifeel
docker compose --env-file .env.production -f compose.production.yaml up -d
docker compose --env-file .env.production -f compose.production.yaml logs --tail=200 minifeel
```

不要直接部署未经验证的分支最新提交。正式发布应记录本次 Git 提交、镜像标识、部署时间和数据库备份位置。

数据库迁移由应用启动自动执行。迁移后如果需要回滚代码，应先确认旧版本是否兼容新数据库结构；不能只回滚容器而忽略数据库变化。

## 10. 备份与恢复

备份目录应位于 Docker 数据卷之外，并同步到另一台机器或对象存储。

备份 PostgreSQL：

```sh
mkdir -p /opt/minifeelBackup
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > /opt/minifeelBackup/database.dump
```

备份应用数据：

```sh
docker compose --env-file .env.production -f compose.production.yaml stop minifeel
docker run --rm \
  -v minifeel_minifeelData:/source:ro \
  -v /opt/minifeelBackup:/backup \
  alpine tar -czf /backup/minifeelData.tar.gz -C /source .
docker compose --env-file .env.production -f compose.production.yaml start minifeel
```

Compose 数据卷的实际名称可能因项目目录或 `--project-name` 不同而变化。执行备份前使用下面命令确认真实卷名：

```sh
docker volume ls
```

恢复前应停止应用，确认目标数据库和数据卷，先保留当前数据副本，再执行覆盖恢复。恢复 PostgreSQL 时使用与备份格式对应的 `pg_restore`。

## 11. SSH 部署所需信息

需要协助远程部署时，准备以下信息即可：

- 服务器公网 IP；
- SSH 端口，默认是 `22`；
- SSH 用户名；
- 临时密码或临时 SSH 私钥；
- 该用户是否具有 `sudo` 权限；
- 操作系统及版本；
- 域名及 DNS 是否已经指向服务器；
- Git 仓库地址，以及私有仓库所需的临时访问凭证；
- 首个管理员手机号；
- 期望的部署目录；
- 是否需要在同一台服务器安装 PostgreSQL和 Caddy/Nginx；
- 云厂商安全组是否已开放 `22`、`80`、`443`。

数据库密码、管理员初始密码和 `MINIFEEL_SECRET_KEY` 可以在部署时直接在服务器生成，无需提前通过聊天发送。部署完成后应撤销临时 SSH 凭证，并妥善保存生产环境变量和备份恢复信息。

## 12. 当前发布前检查

正式上线前还需要完成以下仓库工作：

- 将上面的生产 Compose 配置落为实际部署文件；
- 修正文档中仍描述旧版无数据库、无登录架构的内容；
- 确认生产短信或其他正式账号登录方案；
- 在干净环境完成一次镜像构建和首次启动验证；
- 验证备份文件可以实际恢复；
- 确认域名、HTTPS、上传大小和流式响应配置；
- 为发布版本创建明确的 Git 标签或记录提交号。
