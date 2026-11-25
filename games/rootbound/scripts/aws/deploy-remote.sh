#!/usr/bin/env bash
# EC2 에서 실행: 업로드된 ~/rootbound 를 GameHub 허브(systemd gamehub, :80)가 직접 서빙하게 한다.
# rootbound 는 2026-11-25부터 허브 안에서 실행된다(hub/games.json "mode": "inproc", scripts/aws/hub-entry.mjs).
# 서버는 esbuild 단일 번들(server/dist/app.mjs)이라 npm install·tsx 가 필요 없다. AI 도 그 안에서 돈다.
#
# 예전 단독 운영(~/AstralTab, systemd astraltab-prod-server :3201 / astraltab-prod-ai :8001)에서 옮기는 일도 여기서 한다:
#   1) 예전 서비스를 끈다(방 스냅샷을 더 쓰지 않게 먼저) 2) 방 스냅샷·통계(server/data/prod)를 ~/rootbound 로 복사한다
#   3) 허브를 재시작해 새 hub-entry 를 불러오게 한다 4) 헬스체크가 통과하면 예전 유닛과 ~/AstralTab 를 지운다.
# 재시작하면 허브 안 다른 게임의 진행 중인 방은 사라진다(rootbound 방은 스냅샷으로 복원된다, docs/phase2-design.md 2a).
set -euo pipefail
APP="$HOME/rootbound"
OLD="$HOME/AstralTab"
cd "$APP"

if [ ! -f server/dist/app.mjs ] || [ ! -f client/dist/prod/index.html ] || [ ! -f scripts/aws/hub-entry.mjs ]; then
  echo "빌드 산출물이 없습니다. CI 또는 로컬에서 빌드 후 전송해야 합니다." >&2
  exit 1
fi

has_unit() { systemctl list-unit-files "$1.service" --no-legend 2>/dev/null | grep -q "$1"; }

for u in astraltab-prod-server astraltab-prod-ai; do
  if has_unit "$u"; then sudo systemctl disable --now "$u" || true; fi
done

# 처음 옮길 때만: 예전 위치의 방 스냅샷·통계를 가져온다(이미 있으면 덮어쓰지 않는다)
if [ -d "$OLD/server/data/prod" ] && [ ! -d "$APP/server/data/prod" ]; then
  mkdir -p "$APP/server/data"
  cp -a "$OLD/server/data/prod" "$APP/server/data/prod"
  echo "예전 방 스냅샷·통계를 옮김: $OLD/server/data/prod → $APP/server/data/prod"
fi
mkdir -p "$APP/server/data/prod"

sudo systemctl restart gamehub

for i in $(seq 1 15); do
  if curl -fsS -o /dev/null http://127.0.0.1/rootbound/api/health \
     && curl -fsS http://127.0.0.1/healthz/status \
        | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.exit(JSON.parse(s).games.find(g=>g.slug==="rootbound")?.mode==="inproc"?0:1))'; then
    echo "헬스체크 통과 (허브 안에서 실행)"
    # 옮기기가 끝났으니 예전 단독 운영 흔적을 지운다(데이터는 위에서 복사했다)
    for u in astraltab-prod-server astraltab-prod-ai; do
      if [ -f "/etc/systemd/system/$u.service" ]; then sudo rm -f "/etc/systemd/system/$u.service"; fi
    done
    sudo systemctl daemon-reload
    if [ -d "$OLD" ] && [ -d "$APP/server/data/prod" ]; then rm -rf "$OLD"; echo "예전 디렉터리 $OLD 정리"; fi
    echo "DEPLOY_OK"; exit 0
  fi
  sleep 2
done
echo "헬스체크 실패"
curl -fsS http://127.0.0.1/healthz/status || true
sudo journalctl -u gamehub -n 50 --no-pager || true
exit 1
