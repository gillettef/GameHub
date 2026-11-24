#!/usr/bin/env bash
# EC2 인스턴스(Amazon Linux 2023)를 처음 만들었을 때 한 번 실행하는 초기 설치 스크립트.
# 이 저장소는 비공개라 EC2에서 바로 git clone 할 수 없다 — 소스 전송은
# 로컬에서 `git archive HEAD | ssh ... "tar -x -C ~/AstralTab"` 로 한다
# (scripts/deploy-aws.ps1 참고). 이 스크립트는 그 뒤에 실행한다.
set -euxo pipefail

# 램 0.5GB 라 전체 dnf update 는 하지 않는다(메모리 부족으로 죽을 수 있음).

curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs git gcc gcc-c++ make

node -v

bash ~/AstralTab/scripts/aws/swap.sh

# 클라이언트 빌드(client/dist/prod)는 EC2 에서 하지 않는다. 로컬/CI 에서 빌드해 전송한다(scripts/deploy-aws.ps1).
cd ~/AstralTab
npm install --workspace @rootbound/server --workspace @rootbound/shared --no-audit --no-fund

mkdir -p server/data/prod

echo "PROVISION_OK"
