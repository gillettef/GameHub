#!/usr/bin/env bash
# EC2 인스턴스 위에서 실행된다 (scripts/deploy-aws.ps1 과 GitHub Actions 가 ssh로 호출).
# ~/doubleagent 에 빌드된 dist 와 scripts/aws/serve.mjs 가 이미 풀린 상태라고 가정한다.
# 정적 웹앱이라 의존성 설치는 없고, systemd 서비스(doubleagent, 포트 8091) 재시작과 헬스체크만 한다.
set -euo pipefail

cd ~/doubleagent

if [ ! -f dist/index.html ]; then
  echo "dist 가 없습니다. CI 또는 로컬에서 npm run build 후 전송해야 합니다." >&2
  exit 1
fi

sudo systemctl restart doubleagent
sleep 2
curl -sf -o /dev/null http://localhost:8091/

echo "DEPLOY_OK"
