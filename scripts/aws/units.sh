#!/usr/bin/env bash
# MagicAcademy(8080) systemd 서비스를 등록한다. scripts/aws/provision.sh 로 최초 설치를 마친 뒤 한 번 실행한다.
# 코드는 GitHub Actions(.github/workflows/deploy-aws.yml)가 올리고 서비스를 시작한다.
set -euxo pipefail
NODE_BIN=$(command -v node)

sudo tee /etc/systemd/system/magicacademy.service >/dev/null <<UNIT
[Unit]
Description=MagicAcademy game server
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/magicacademy/server
Environment=NODE_ENV=production
Environment=PORT=8080
ExecStart=${NODE_BIN} dist/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable magicacademy
echo "UNITS_OK (서비스는 GitHub Actions 배포로 코드를 올린 뒤 시작된다)"
