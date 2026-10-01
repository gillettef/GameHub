#!/usr/bin/env bash
# EC2 인스턴스 위에서 실행된다 (scripts/deploy-aws.ps1 과 GitHub Actions 가 ssh로 호출).
# git archive 로 ~/AstralTab 에 최신 소스가, 빌드된 client/dist/prod 가 이미 풀린 상태라고 가정한다.
# 클라이언트 빌드(vite)는 메모리가 작은 EC2(t3.micro, 1GB)에서 하지 않고 CI·로컬에서 미리 해 온다.
# 서버는 단일(운영) 환경이다. systemd 서비스명·디렉터리의 "prod" 는 예전 이름을 그대로 둔 것이다.
set -euo pipefail

cd ~/AstralTab

if [ ! -f client/dist/prod/index.html ]; then
  echo "client/dist/prod 가 없습니다. CI 또는 로컬에서 vite build 후 전송해야 합니다." >&2
  exit 1
fi

# 서버 실행에 필요한 것(server·shared 와 tsx)만 설치한다. client(React·Vite) 의존성은 받지 않는다.
npm install --workspace @astraltab/server --workspace @astraltab/shared --no-audit --no-fund
ai/.venv/bin/pip install -q -r ai/requirements.txt
sudo systemctl restart astraltab-prod-ai astraltab-prod-server

echo "DEPLOY_OK"
