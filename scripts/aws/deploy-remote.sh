#!/usr/bin/env bash
# EC2 인스턴스 위에서 실행된다 (scripts/deploy-aws.ps1 과 GitHub Actions 가 ssh로 호출).
# ~/doubleagent 에 빌드된 dist·server-dist(ws 까지 묶은 서버 번들)·scripts/aws 가 이미 풀린 상태라고 가정한다.
# 의존성 설치는 없고, systemd 서비스(doubleagent, 포트 8091) 재시작과 헬스체크만 한다.
# 재시작하면 메모리에 있던 온라인 방은 사라진다.
set -euo pipefail

cd ~/doubleagent

if [ ! -f dist/index.html ] || [ ! -f server-dist/server.cjs ]; then
  echo "dist 또는 server-dist 가 없습니다. CI 또는 로컬에서 npm run build 후 전송해야 합니다." >&2
  exit 1
fi

sudo systemctl restart doubleagent
sleep 2
curl -sf -o /dev/null http://localhost:8091/
curl -sf http://localhost:8091/health

echo "DEPLOY_OK"
