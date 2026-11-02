#!/usr/bin/env bash
# EC2 에서 실행: 업로드된 ~/magicacademy 의 systemd magicacademy(포트 8080)를 재시작하고 헬스체크한다.
# GitHub Actions(deploy-aws.yml)와 수동 배포가 ssh 로 호출한다. systemd 유닛은 scripts/aws/units.sh 로 최초 1회 등록돼 있다.
# 재시작하면 메모리에 있던 게임 상태는 사라진다.
set -euo pipefail
APP="$HOME/magicacademy"
cd "$APP"

if [ ! -f server/dist/index.js ] || [ ! -f client/dist/index.html ]; then
  echo "빌드 산출물이 없습니다. CI 또는 로컬에서 빌드 후 전송해야 합니다." >&2
  exit 1
fi

# 서버 실행에 필요한 운영 의존성만 설치한다
(cd server && npm ci --omit=dev --no-audit --no-fund)

sudo systemctl restart magicacademy

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -o /dev/null http://127.0.0.1:8080/; then echo "헬스체크 통과"; echo "DEPLOY_OK"; exit 0; fi
  sleep 2
done
echo "헬스체크 실패"
sudo journalctl -u magicacademy -n 50 --no-pager || true
exit 1
