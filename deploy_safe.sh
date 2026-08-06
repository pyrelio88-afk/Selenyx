#!/bin/bash
# R100 部署安全脚本：tsc gate + 备份 + 构建 + 冒烟检查
# 用法: bash deploy_safe.sh "commit message"
set -e

REPO_DIR="/home/gem/.aily/workdir/task_7669744666866224081/selenyx-next"
FRONTEND="$REPO_DIR/frontend"
MSG="${1:-R100 deploy}"

echo "=== 1/5 tsc 类型检查 (gate) ==="
cd "$FRONTEND"
npx tsc -b 2>&1
echo "tsc: OK"

echo "=== 2/5 vite build ==="
npx vite build 2>&1 | tail -5
echo "build: OK"

echo "=== 3/5 备份当前线上版本 ==="
cd "$REPO_DIR"
if [ -f index.html ]; then
  cp index.html index.html.bak
  echo "backed up to index.html.bak"
else
  echo "no existing index.html to backup (first deploy)"
fi

echo "=== 4/5 冒烟检查：静态产物 + 运行时白屏拦截 ==="
DIST_SIZE=$(wc -c < "$FRONTEND/dist/index.html")
if [ "$DIST_SIZE" -lt 1000 ]; then
  echo "SMOKE FAIL: dist/index.html only $DIST_SIZE bytes — aborting"
  exit 1
fi
if ! grep -q 'id="root"' "$FRONTEND/dist/index.html"; then
  echo "SMOKE FAIL: dist/index.html missing #root div — aborting"
  exit 1
fi
echo "static smoke: OK ($DIST_SIZE bytes, #root present)"

# ④b 运行时冒烟（R102）：vite preview + playwright headless，拦"构建成功但运行时崩溃"白屏
echo "== runtime smoke (playwright headless) =="
cd "$FRONTEND"
npx vite preview --port 4173 --strictPort >/dev/null 2>&1 &
PREVIEW_PID=$!
# 等 preview 起来（最多 8 秒）
for i in 1 2 3 4 5 6 7 8; do
  curl -s -o /dev/null "http://localhost:4173" && break
  sleep 1
done
node "$REPO_DIR/scripts/smoke.mjs"
SMOKE_RC=$?
kill $PREVIEW_PID 2>/dev/null
if [ "$SMOKE_RC" -ne 0 ]; then
  echo "RUNTIME SMOKE FAILED — abort deploy (rollback not needed, index.html 未覆盖)"
  exit 1
fi
cd "$REPO_DIR"
echo "smoke: OK (static + runtime)"

echo "=== 5/5 部署 ==="
cp "$FRONTEND/dist/index.html" index.html
git add index.html
git commit -m "$MSG" -q
git push miaoda master:sprint/default 2>&1 | tail -3
echo "pushed to miaoda sprint/default"

# 创建 release
RID=$(lark-cli apps +release-create --app-id app_17augt6juzf --branch sprint/default 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['release_id'])")
echo "release_id=$RID"
echo "waiting for publish..."
sleep 12
STATUS=$(lark-cli apps +release-get --app-id app_17augt6juzf --release-id "$RID" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['status'])")
echo "release status: $STATUS"

if [ "$STATUS" = "finished" ]; then
  echo "=== DEPLOY SUCCESS ==="
  echo "backup: index.html.bak (rollback: cp index.html.bak index.html && git push)"
else
  echo "=== WARNING: release not finished, check manually ==="
fi
