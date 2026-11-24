#!/usr/bin/env bash
# EC2 에서 실행: 업로드된 ~/smilepark 를 GameHub 허브(systemd gamehub, :80)가 직접 서빙하게 한다.
# smilepark 는 2026-11-24부터 허브 안에서 실행된다(hub/games.json "mode": "inproc", scripts/aws/hub-entry.mjs).
# 예전 단독 서비스(systemd smilepark, :8090)가 남아 있으면 끄고, 허브를 재시작해 새 hub-entry 를 불러오게 한다.
# 정적 파일만 바뀐 경우에도 재시작하는 이유: 허브가 모듈을 시작할 때 한 번만 불러오기 때문(진입점이 바뀌었을 수 있다).
set -euo pipefail
APP="$HOME/smilepark"
cd "$APP"

if [ ! -f dist/index.html ] || [ ! -f scripts/aws/hub-entry.mjs ]; then
  echo "빌드 산출물이 없습니다. CI 또는 로컬에서 빌드 후 전송해야 합니다." >&2
  exit 1
fi

if systemctl list-unit-files smilepark.service --no-legend 2>/dev/null | grep -q smilepark; then
  sudo systemctl disable --now smilepark || true
fi
sudo systemctl restart gamehub

for i in $(seq 1 15); do
  if curl -fsS -o /dev/null http://127.0.0.1/smilepark/ \
     && curl -fsS http://127.0.0.1/healthz/status \
        | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.exit(JSON.parse(s).games.find(g=>g.slug==="smilepark")?.mode==="inproc"?0:1))'; then
    echo "헬스체크 통과 (허브 안에서 실행)"; echo "DEPLOY_OK"; exit 0
  fi
  sleep 2
done
echo "헬스체크 실패"
curl -fsS http://127.0.0.1/healthz/status || true
sudo journalctl -u gamehub -n 50 --no-pager || true
exit 1
