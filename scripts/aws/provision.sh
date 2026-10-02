#!/usr/bin/env bash
# 공용 EC2(t4g.nano, Amazon Linux 2023, 사용자 ec2-user)에서 MagicAcademy 용으로 최초 1회 실행한다.
# 다른 게임(Eleven·MagicAcademy·AstralTab)과 인스턴스를 공유하므로 스왑·Node 는 이미 있으면 건너뛴다.
# (램 0.5GB 라 스왑을 먼저 만들고, 전체 dnf update 는 하지 않는다)
set -euxo pipefail

# 램이 작아 npm install 이 죽지 않도록 스왑 2GB (이미 있으면 건너뜀)
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

if ! command -v node >/dev/null; then
  curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
  sudo dnf install -y nodejs gcc gcc-c++ make
fi

mkdir -p ~/magicacademy
node -v; free -m
echo "PROVISION_OK"
