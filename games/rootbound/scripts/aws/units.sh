#!/usr/bin/env bash
# EC2 인스턴스에 systemd 서비스(server)를 등록한다(AI 는 서버 안에서 돈다). 서버는 단일(운영) 환경이며
# 서비스명·경로의 "prod" 는 예전 이름을 그대로 둔 것이다.
# scripts/aws/provision.sh 로 최초 설치를 마친 뒤 한 번 실행한다.
# 코드를 재배포할 때는 이 스크립트를 다시 실행할 필요 없이 scripts/deploy-aws.ps1 을 쓴다.
set -euxo pipefail

APP_DIR=/home/ec2-user/AstralTab
NPX_BIN=$(command -v npx)

sudo tee /etc/systemd/system/astraltab-prod-server.service > /dev/null <<UNIT
[Unit]
Description=AstralTab server
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=${APP_DIR}/server
Environment=APP_ENV=prod
Environment=PORT=3201
Environment=HOST=0.0.0.0
Environment=CLIENT_DIST=${APP_DIR}/client/dist/prod
Environment=DATA_DIR=${APP_DIR}/server/data/prod
ExecStart=${NPX_BIN} tsx src/index.ts
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now astraltab-prod-server
sleep 2
sudo systemctl --no-pager status astraltab-prod-server
