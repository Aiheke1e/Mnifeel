#!/bin/sh

set -eu

projectDirectory=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
environmentFile="$projectDirectory/.env.production"
composeFile="$projectDirectory/compose.production.yaml"
deployBranch=${DEPLOY_BRANCH:-dev}
backupDirectory=${MINIFEEL_BACKUP_DIR:-$projectDirectory/backup}
postgresVolume=minifeelPostgresData

compose() {
  docker compose --env-file "$environmentFile" -f "$composeFile" "$@"
}

waitForService() {
  service=$1
  attempt=0
  while [ "$attempt" -lt 60 ]; do
    containerId=$(compose ps -q "$service")
    if [ -n "$containerId" ]; then
      healthStatus=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$containerId")
      if [ "$healthStatus" = "healthy" ]; then
        return 0
      fi
      if [ "$healthStatus" = "unhealthy" ] || [ "$healthStatus" = "exited" ]; then
        return 1
      fi
    fi
    attempt=$((attempt + 1))
    sleep 2
  done
  return 1
}

if [ ! -f "$environmentFile" ]; then
  echo "缺少 $environmentFile，请先复制 productionEnvironment.example 并填写真实配置。" >&2
  exit 1
fi

cd "$projectDirectory"

if [ -n "$(git status --porcelain)" ]; then
  echo "部署目录存在未提交改动，已停止更新。" >&2
  exit 1
fi

docker info >/dev/null
compose config --quiet
mkdir -p "$backupDirectory"

if docker volume inspect "$postgresVolume" >/dev/null 2>&1; then
  echo "检测到现有 PostgreSQL 数据，正在启动数据库以创建备份"
  compose up -d postgres
  if ! waitForService postgres; then
    echo "PostgreSQL 未能进入健康状态，已停止更新。" >&2
    compose logs --tail=200 postgres >&2
    exit 1
  fi
  timestamp=$(date +%Y%m%d-%H%M%S)
  backupFile="$backupDirectory/database-$timestamp.dump"
  echo "正在备份 PostgreSQL：$backupFile"
  if ! compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backupFile"; then
    rm -f "$backupFile"
    echo "PostgreSQL 备份失败，已停止更新。" >&2
    exit 1
  fi
fi

echo "正在拉取 origin/$deployBranch"
git fetch origin "$deployBranch"
git checkout "$deployBranch"
git pull --ff-only origin "$deployBranch"

echo "正在构建 Minifeel"
compose build --pull minifeel

echo "正在启动生产服务"
compose up -d --remove-orphans

if waitForService minifeel; then
  revision=$(git rev-parse --short HEAD)
  echo "Minifeel 部署完成，Git 提交：$revision"
  compose ps
  exit 0
fi

echo "Minifeel 未能进入健康状态，最近日志如下：" >&2
compose logs --tail=200 minifeel >&2
exit 1
