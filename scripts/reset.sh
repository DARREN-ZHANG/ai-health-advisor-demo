#!/usr/bin/env bash
# reset.sh — 重置 demo runtime state
# 用法: ./scripts/reset.sh [API_BASE_URL]
#
# 清除所有 God-Mode override、injected events、session memory，
# 将 runtime 恢复到基础 sandbox 数据状态。

set -euo pipefail

API_BASE="${1:-http://localhost:3001}"
RESET_URL="${API_BASE}/god-mode/reset"

echo ">>> 重置 runtime state: ${RESET_URL}"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${RESET_URL}" \
  -H "Content-Type: application/json" \
  -d '{"scope":"all"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
  echo ">>> 重置成功"
  echo "${BODY}" | head -c 200
  echo
else
  echo ">>> 重置失败 (HTTP ${HTTP_CODE})"
  echo "${BODY}"
  exit 1
fi
