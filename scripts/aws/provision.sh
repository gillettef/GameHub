#!/usr/bin/env bash
# EC2 인스턴스(Amazon Linux 2023)를 처음 만들었을 때 한 번 실행하는 초기 설치 스크립트.
# 이 저장소는 비공개라 EC2에서 바로 git clone 할 수 없다 — 소스 전송은
# 로컬에서 `git archive HEAD | ssh ... "tar -x -C ~/AstralTab"` 로 한다
# (scripts/deploy-aws.ps1 참고). 이 스크립트는 그 뒤에 실행한다.
set -euxo pipefail

sudo dnf update -y

curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs git gcc gcc-c++ make python3.11 python3.11-pip

node -v
python3.11 -V

cd ~/AstralTab
npm install

cd client
npx vite build --outDir dist/prod --emptyOutDir
cd ..

python3.11 -m venv ai/.venv
ai/.venv/bin/pip install -q --upgrade pip
ai/.venv/bin/pip install -q -r ai/requirements.txt

mkdir -p server/data/prod

echo "PROVISION_OK"
