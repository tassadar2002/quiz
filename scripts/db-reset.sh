#!/usr/bin/env bash
set -euo pipefail
docker compose down -v
docker compose up -d
echo "等待 Postgres 就绪..."
until docker exec $(docker compose ps -q postgres) pg_isready -U quiz >/dev/null 2>&1; do
  sleep 1
done
echo "Postgres 已重置"
