#!/usr/bin/env bash
# EC2 에서 실행: 업로드된 ~/hearsay 를 GameHub 허브(systemd gamehub, :80)가 직접 서빙하게 한다.
# hearsay 는 2026-11-24부터 허브 안에서 실행된다(hub/games.json "mode": "inproc", scripts/aws/hub-entry.mjs).
# 예전 단독 서비스(systemd hearsay, :8103)가 남아 있으면 끄고, 허브를 재시작해 새 hub-entry 를 불러오게 한다.
# 재시작하는 이유: 허브가 게임 모듈(서버 코드·규칙 엔진)을 시작할 때 한 번만 불러오기 때문. 재시작하면 진행 중인 방은 사라진다
# (허브 안의 다른 inproc 게임 방도 함께 사라진다 — docs/phase2-design.md 2a 배포 변화).
set -euo pipefail
APP="$HOME/hearsay"
cd "$APP"

if [ ! -f dist/index.html ] || [ ! -f dist/server/rooms.mjs ] || [ ! -f scripts/aws/hub-entry.mjs ]; then
  echo "빌드 산출물이 없습니다. CI 또는 로컬에서 빌드 후 전송해야 합니다." >&2
  exit 1
fi

if systemctl list-unit-files hearsay.service --no-legend 2>/dev/null | grep -q hearsay; then
  sudo systemctl disable --now hearsay || true
fi
sudo systemctl restart gamehub

for i in $(seq 1 15); do
  if curl -fsS -o /dev/null http://127.0.0.1/hearsay/ \
     && curl -fsS http://127.0.0.1/healthz/status \
        | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.exit(JSON.parse(s).games.find(g=>g.slug==="hearsay")?.mode==="inproc"?0:1))'; then
    echo "헬스체크 통과 (허브 안에서 실행)"; echo "DEPLOY_OK"; exit 0
  fi
  sleep 2
done
echo "헬스체크 실패"
curl -fsS http://127.0.0.1/healthz/status || true
sudo journalctl -u gamehub -n 50 --no-pager || true
exit 1
