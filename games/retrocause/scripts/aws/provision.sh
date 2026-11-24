#!/usr/bin/env bash
# 공용 EC2(t4g.nano, Amazon Linux 2023, 사용자 ec2-user)에서 Retrocause 용으로 최초 1회 실행한다.
# 다른 게임과 인스턴스를 공유하므로 스왑·Node 는 이미 있으면 건너뛴다.
set -euxo pipefail

if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

if ! command -v node >/dev/null; then
  curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
  sudo dnf install -y nodejs
fi

mkdir -p ~/retrocause
node -v; free -m
echo "PROVISION_OK"
