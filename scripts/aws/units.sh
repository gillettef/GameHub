#!/usr/bin/env bash
# Tesseract(8092) systemd 서비스를 등록한다. provision.sh 후 한 번 실행한다.
# 코드는 GitHub Actions(.github/workflows/deploy-aws.yml)가 올리고 서비스를 시작한다.
set -euxo pipefail
NODE_BIN=$(command -v node)

sudo tee /etc/systemd/system/tesseract.service >/dev/null <<UNIT
[Unit]
Description=Tesseract web server (static + online WebSocket)
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/tesseract
Environment=PORT=8092
ExecStart=${NODE_BIN} scripts/aws/serve.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable tesseract
echo "UNITS_OK (서비스는 GitHub Actions 배포로 코드를 올린 뒤 시작된다)"
