#!/usr/bin/env bash
# EC2 인스턴스에 systemd 서비스 4개(prod/test x server/ai)를 등록한다.
# scripts/aws/provision.sh 로 최초 설치를 마친 뒤 한 번 실행한다.
# 코드를 재배포할 때는 이 스크립트를 다시 실행할 필요 없이 scripts/deploy-aws.ps1 을 쓴다.
set -euxo pipefail

APP_DIR=/home/ec2-user/AstralTab
NPX_BIN=$(command -v npx)

sudo tee /etc/systemd/system/astraltab-prod-ai.service > /dev/null <<UNIT
[Unit]
Description=AstralTab AI (prod)
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=${APP_DIR}/ai
ExecStart=${APP_DIR}/ai/.venv/bin/python -m uvicorn astral_ai.main:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

sudo tee /etc/systemd/system/astraltab-test-ai.service > /dev/null <<UNIT
[Unit]
Description=AstralTab AI (test)
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=${APP_DIR}/ai
ExecStart=${APP_DIR}/ai/.venv/bin/python -m uvicorn astral_ai.main:app --host 127.0.0.1 --port 8002
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

sudo tee /etc/systemd/system/astraltab-prod-server.service > /dev/null <<UNIT
[Unit]
Description=AstralTab server (prod)
After=network.target astraltab-prod-ai.service

[Service]
Type=simple
User=ec2-user
WorkingDirectory=${APP_DIR}/server
Environment=APP_ENV=prod
Environment=PORT=3201
Environment=HOST=0.0.0.0
Environment=CLIENT_DIST=${APP_DIR}/client/dist/prod
Environment=DATA_DIR=${APP_DIR}/server/data/prod
Environment=AI_BASE_URL=http://127.0.0.1:8001
ExecStart=${NPX_BIN} tsx src/index.ts
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

sudo tee /etc/systemd/system/astraltab-test-server.service > /dev/null <<UNIT
[Unit]
Description=AstralTab server (test)
After=network.target astraltab-test-ai.service

[Service]
Type=simple
User=ec2-user
WorkingDirectory=${APP_DIR}/server
Environment=APP_ENV=test
Environment=PORT=3301
Environment=HOST=0.0.0.0
Environment=CLIENT_DIST=${APP_DIR}/client/dist/test
Environment=DATA_DIR=${APP_DIR}/server/data/test
Environment=AI_BASE_URL=http://127.0.0.1:8002
ExecStart=${NPX_BIN} tsx src/index.ts
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now astraltab-prod-ai astraltab-test-ai
sleep 2
sudo systemctl enable --now astraltab-prod-server astraltab-test-server
sleep 2
sudo systemctl --no-pager status astraltab-prod-ai astraltab-test-ai astraltab-prod-server astraltab-test-server
