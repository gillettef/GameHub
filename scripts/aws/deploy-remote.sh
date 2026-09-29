#!/usr/bin/env bash
# EC2 인스턴스 위에서 실행된다 (scripts/deploy-aws.ps1 과 GitHub Actions 가 ssh로 호출).
# git archive 로 이미 ~/AstralTab 에 최신 소스가 풀린 상태라고 가정한다.
# 서버는 단일(운영) 환경이다. systemd 서비스명·디렉터리의 "prod" 는 예전 이름을 그대로 둔 것이다.
set -euo pipefail

cd ~/AstralTab

npm install
(cd client && npx vite build --outDir dist/prod --emptyOutDir)
ai/.venv/bin/pip install -q -r ai/requirements.txt
sudo systemctl restart astraltab-prod-ai astraltab-prod-server

echo "DEPLOY_OK"
