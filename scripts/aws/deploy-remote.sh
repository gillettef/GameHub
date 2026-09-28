#!/usr/bin/env bash
# EC2 인스턴스 위에서 실행된다 (scripts/deploy-aws.ps1 이 ssh로 호출).
# git archive 로 이미 ~/AstralTab 에 최신 소스가 풀린 상태라고 가정한다.
set -euo pipefail

ENV_SEL="${1:-all}"
cd ~/AstralTab

npm install

build_client() {
  (cd client && npx vite build --outDir "dist/$1" --emptyOutDir)
}

case "$ENV_SEL" in
  prod)
    build_client prod
    ai/.venv/bin/pip install -q -r ai/requirements.txt
    sudo systemctl restart astraltab-prod-ai astraltab-prod-server
    ;;
  test)
    build_client test
    ai/.venv/bin/pip install -q -r ai/requirements.txt
    sudo systemctl restart astraltab-test-ai astraltab-test-server
    ;;
  all)
    build_client prod
    build_client test
    ai/.venv/bin/pip install -q -r ai/requirements.txt
    sudo systemctl restart astraltab-prod-ai astraltab-test-ai astraltab-prod-server astraltab-test-server
    ;;
  *)
    echo "usage: deploy-remote.sh [prod|test|all]" >&2
    exit 1
    ;;
esac

echo "DEPLOY_OK ($ENV_SEL)"
