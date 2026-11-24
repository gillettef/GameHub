---
name: prod-server
description: 운영 서버(AWS EC2, GameHub 허브 http://<Elastic IP>/rootbound/ 안에서 실행)에 현재 워킹트리를 수동 배포한다. 평소에는 GameHub 저장소에서 dev → main PR 병합 시 Deploy 워크플로가 자동 배포하므로 필요 없고, 급히 반영하거나 CI가 막혔을 때만 쓴다. "배포해줘", "운영에 반영해줘" 요청 시 사용.
---

# /prod-server — 운영 수동 배포 (AWS EC2, 허브 안 실행)

2026-11-25부터 rootbound 는 GameHub 허브(systemd `gamehub`, :80) 안에서 실행된다(`~/rootbound/scripts/aws/hub-entry.mjs`). 평소 배포는 GameHub 저장소의 `dev` → `main` PR 병합 → Deploy 워크플로(`deploy-rootbound.yml`)다. 이 스킬은 그 경로를 못 쓸 때만 쓴다.

`scripts/deploy-aws.ps1` 이 클라이언트(vite)와 서버(esbuild 단일 번들 `server/dist/app.mjs`)를 로컬에서 빌드해 `server/dist`·`client/dist/prod`·`scripts/aws` 만 `~/rootbound` 로 보내고, 서버에서 `scripts/aws/deploy-remote.sh` 가 허브를 재시작하고 헬스체크한다.

**허브 재시작은 허브 안 다른 게임 14개의 진행 중인 방도 없앤다**(rootbound 방은 스냅샷으로 복원). 실행 전에 사용자에게 이 점을 확인받는다.

## 실행 절차

1. Bash 툴로 실행한다 (완료까지 블로킹, 보통 30초~2분).

   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-aws.ps1
   ```

2. 마지막 줄 `DEPLOY_OK` 와 `=== 배포 완료 ===` 를 확인한다.
3. 접속 주소 `http://<.dev/aws-public-ip.txt 의 IP>/rootbound/` 를 알려준다.

## 로그 확인

```
ssh -i .dev/astraltab-key.pem ec2-user@$(cat .dev/aws-public-ip.txt) "sudo journalctl -u gamehub -n 100 | grep rootbound"
```

## 주의

- 운영 배포는 GameHub 저장소에서만 한다. 검증 전 변경은 `main` 에 병합하지 않는다.
- SSH 인바운드는 관리자 PC의 공인 IP로 제한돼 있다. 다른 네트워크에서 배포하면 타임아웃될 수 있다 — 보안 그룹에 현재 IP를 추가해야 한다.
