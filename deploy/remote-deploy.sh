#!/usr/bin/env bash
set -Eeuo pipefail

image=${1:-}
if [[ ! "$image" =~ ^ghcr[.]io/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+:[0-9a-f]{40}$ ]]; then
  echo "拒绝部署：镜像必须是带完整提交 SHA 的 GHCR 镜像" >&2
  exit 2
fi

root=${LINX_DEPLOY_ROOT:-/home/qiniu/linx-night}
project=${LINX_COMPOSE_PROJECT:-linx-night}
compose_file="$root/docker-compose.production.yml"
compose_env="$root/.env"
lock_file=${LINX_DEPLOY_LOCK:-/tmp/linx-night-deploy.lock}

[[ -r "$compose_file" ]] || { echo "缺少 Compose 文件：$compose_file" >&2; exit 1; }
[[ -r "$compose_env" ]] || { echo "缺少 Compose 环境文件：$compose_env" >&2; exit 1; }

exec 9>"$lock_file"
if ! flock -n 9; then
  echo "已有 Linx-Night 部署正在运行" >&2
  exit 3
fi

compose=(docker compose --project-name "$project" --env-file "$compose_env" -f "$compose_file")
previous=''
container_id=$("${compose[@]}" ps -q app 2>/dev/null || true)
if [[ -n "$container_id" ]]; then
  previous=$(docker inspect --format '{{.Config.Image}}' "$container_id" 2>/dev/null || true)
fi

export LINX_IMAGE="$image"
export LINX_BUILD_ID="${image##*:}"
echo "开始部署 Linx-Night：$LINX_BUILD_ID"

healthcheck() {
  curl --fail --silent --show-error --max-time 5 http://127.0.0.1:5000/health >/dev/null
  curl --fail --silent --show-error --max-time 5 http://127.0.0.1:9091/health >/dev/null
  curl --fail --silent --show-error --max-time 5 http://127.0.0.1:5010/ >/dev/null
}

rollback() {
  if [[ -z "$previous" ]]; then
    echo "没有可回滚的上一版本" >&2
    return 1
  fi
  echo "健康检查失败，回滚到上一版本"
  export LINX_IMAGE="$previous"
  export LINX_BUILD_ID="${previous##*:}"
  "${compose[@]}" up -d --no-deps --force-recreate --wait app
  healthcheck
}

if ! "${compose[@]}" pull app || ! "${compose[@]}" up -d --no-deps --force-recreate --wait app; then
  rollback
  exit 1
fi

if ! healthcheck; then
  rollback
  exit 1
fi

echo "部署成功：$LINX_BUILD_ID"
