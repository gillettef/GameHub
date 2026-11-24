#!/usr/bin/env bash
# EC2 에서 실행: 업로드된 ~/election 의 systemd election(포트 8096)를 설치·재시작하고 /health 로 확인한다
set -euo pipefail
APP="$HOME/election"

UNIT=/etc/systemd/system/election.service
TMP=$(mktemp)
sed "s#__APP__#$APP#g; s#__USER__#$USER#g" "$APP/scripts/aws/election.service" > "$TMP"
if [ ! -f "$UNIT" ] || ! cmp -s "$TMP" "$UNIT"; then
  sudo cp "$TMP" "$UNIT"
  sudo systemctl daemon-reload
  sudo systemctl enable election
fi
rm -f "$TMP"
sudo systemctl restart election

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:8096/health; then echo; echo "헬스체크 통과"; exit 0; fi
  sleep 2
done
echo "헬스체크 실패"
sudo journalctl -u election -n 50 --no-pager || true
exit 1
