#!/usr/bin/env bash
# GameHub 허브(80) systemd 서비스를 등록한다. 공용 EC2 에서 최초 1회 실행한다.
# 80 은 특권 포트라 root 대신 CAP_NET_BIND_SERVICE 만 준다.
set -euxo pipefail
NODE_BIN=$(command -v node)

sudo tee /etc/systemd/system/gamehub.service >/dev/null <<UNIT
[Unit]
Description=GameHub hub (lobby + reverse proxy, :80)
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/gamehub/hub
Environment=PORT=80
ExecStart=${NODE_BIN} server.mjs
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable gamehub
echo UNITS_OK
