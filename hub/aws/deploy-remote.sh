#!/usr/bin/env bash
# 허브 산출물(~/gamehub/hub)이 올라온 뒤 서버에서 실행: 재시작 + 헬스체크.
set -euo pipefail
sudo systemctl restart gamehub
for i in $(seq 1 20); do
  if curl -fs http://127.0.0.1/healthz >/dev/null; then echo "DEPLOY_OK gamehub"; exit 0; fi
  sleep 1
done
echo "헬스체크 실패"; sudo journalctl -u gamehub -n 40 --no-pager; exit 1
