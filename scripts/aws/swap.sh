#!/usr/bin/env bash
# t3.micro(메모리 1GB)에서 npm install·pip install 이 메모리 부족으로 죽지 않도록 스왑 2GB 를 만든다.
# 이미 있으면 아무것도 하지 않는다. 재부팅 후에도 유지되도록 /etc/fstab 에 등록한다.
set -euo pipefail

if swapon --show | grep -q /swapfile; then
  echo "SWAP_ALREADY_ON"
  exit 0
fi

sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
free -m
echo "SWAP_OK"
