#!/usr/bin/env bash
# EC2 에서 실행: /tmp/neoterra.tgz 를 ~/neoterra 에 풀고 systemd neoterra(포트 8094)를 재시작한다
set -euo pipefail
APP="$HOME/neoterra"
mkdir -p "$APP"
rm -rf "$APP/dist" "$APP/server-dist"
tar xzf /tmp/neoterra.tgz -C "$APP"
rm -f /tmp/neoterra.tgz

UNIT=/etc/systemd/system/neoterra.service
TMP=$(mktemp)
sed "s#__APP__#$APP#g; s#__USER__#$USER#g" "$APP/scripts/aws/neoterra.service" > "$TMP"
if [ ! -f "$UNIT" ] || ! cmp -s "$TMP" "$UNIT"; then
  sudo cp "$TMP" "$UNIT"
  sudo systemctl daemon-reload
  sudo systemctl enable neoterra
fi
rm -f "$TMP"
sudo systemctl restart neoterra
sleep 2
systemctl --no-pager --lines=5 status neoterra || true
