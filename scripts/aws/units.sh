#!/usr/bin/env bash
# Proxymind(8105) systemd 서비스를 등록한다. provision.sh 후 한 번 실행한다.
# 코드는 GitHub Actions(.github/workflows/deploy-aws.yml)가 올리고 서비스를 시작한다.
set -euxo pipefail
NODE_BIN=$(command -v node)

sudo tee /etc/systemd/system/proxymind.service >/dev/null <<UNIT
[Unit]
Description=Proxymind static web server
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/proxymind
Environment=PORT=8105
ExecStart=${NODE_BIN} scripts/aws/serve.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable proxymind
echo "UNITS_OK (서비스는 GitHub Actions 배포로 코드를 올린 뒤 시작된다)"
