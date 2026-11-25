#!/usr/bin/env bash
# EC2 에서 실행(배포 워크플로가 ssh 의 표준 입력으로 보낸다): bash -s -- <slug>
# 업로드된 ~/<slug> 를 GameHub 허브(systemd gamehub, :80)가 불러오도록 허브를 재시작하고 확인한다.
# 허브는 게임 모듈을 시작할 때 한 번만 불러온다. 재시작하면 모든 게임의 진행 중인 방이 사라진다.
set -euo pipefail
SLUG="${1:?slug 가 필요합니다}"
APP="$HOME/$SLUG"

for f in dist/index.html server-dist/app.cjs scripts/aws/hub-entry.mjs; do
  if [ ! -f "$APP/$f" ]; then
    echo "빌드 산출물이 없습니다: $APP/$f" >&2
    exit 1
  fi
done

sudo systemctl restart gamehub

for _ in $(seq 1 15); do
  if curl -fsS -o /dev/null "http://127.0.0.1/$SLUG/" && curl -fsS -o /dev/null "http://127.0.0.1/$SLUG/health" \
     && curl -fsS http://127.0.0.1/healthz/status \
        | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.exit(JSON.parse(s).games.find(g=>g.slug===process.argv[1])?.mode==="inproc"?0:1))' "$SLUG"; then
    echo "헬스체크 통과 (허브 안에서 실행)"
    echo "DEPLOY_OK"
    exit 0
  fi
  sleep 2
done
echo "헬스체크 실패"
curl -fsS http://127.0.0.1/healthz/status || true
sudo journalctl -u gamehub -n 50 --no-pager || true
exit 1
