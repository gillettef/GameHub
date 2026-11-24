#!/usr/bin/env bash
# EC2 에서 실행: 업로드된 ~/tesseract 의 systemd tesseract(포트 8092)를 재시작하고 헬스체크한다.
# GitHub Actions(deploy-aws.yml)와 수동 배포가 ssh 로 호출한다. systemd 유닛은 scripts/aws/units.sh 로 최초 1회 등록돼 있다.
# 재시작하면 메모리에 있던 게임 상태는 사라진다.
set -euo pipefail
APP="$HOME/tesseract"
cd "$APP"

if [ ! -f dist/index.html ] || [ ! -f server-dist/server.cjs ]; then
  echo "빌드 산출물이 없습니다. CI 또는 로컬에서 빌드 후 전송해야 합니다." >&2
  exit 1
fi

sudo systemctl restart tesseract

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -o /dev/null http://127.0.0.1:8092/ && curl -fsS -o /dev/null http://127.0.0.1:8092/health; then echo "헬스체크 통과"; echo "DEPLOY_OK"; exit 0; fi
  sleep 2
done
echo "헬스체크 실패"
sudo journalctl -u tesseract -n 50 --no-pager || true
exit 1
