---
name: prod-server
description: 운영 서버(AWS EC2 상시 서버, http://<Elastic IP>:3201, 유일한 서버)에 현재 워킹트리를 수동 배포한다. 평소에는 main에 push하면 GitHub Actions가 자동 배포하므로 필요 없고, push 없이 급히 반영하거나 CI가 막혔을 때만 쓴다. "배포해줘", "운영에 반영해줘" 요청 시 사용. 완전히 끄려면 /prod-server-stop.
---

# /prod-server — 운영 수동 배포 (AWS EC2)

서버는 **AWS EC2 단일 운영 서버 하나**뿐이다(test 환경은 2026-09-29 폐지). 평소 배포는 `main` push → GitHub Actions(`verify` 통과 후 `deploy`)가 자동으로 한다. 이 스킬은 push 없이 현재 워킹트리를 바로 올려야 할 때만 쓴다.

`scripts/deploy-aws.ps1` 이 로컬 워킹트리를 `git archive`로 패키징해 ssh 전송하고, 서버에서 `scripts/aws/deploy-remote.sh` 가 `npm install` → 클라이언트 빌드(`client/dist/prod`) → systemd(`astraltab-prod-server`) 재시작을 수행한다. "prod"라는 이름은 예전 그대로 둔 것이다.

## 실행 절차

1. Bash 툴로 실행한다 (완료까지 블로킹, 보통 30초~2분).

   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-aws.ps1
   ```

2. 마지막 줄 `DEPLOY_OK` 와 `=== 배포 완료 ===` 를 확인한다.
3. 접속 주소 `http://<.dev/aws-public-ip.txt 의 IP>:3201` 을 알려준다.

## 로그 확인

```
ssh -i .dev/astraltab-key.pem ec2-user@$(cat .dev/aws-public-ip.txt) "sudo journalctl -u astraltab-prod-server -n 100"
```

## 주의

- 검증 전 변경은 `main`에 push하지 않는다(push = 곧 운영 반영). 별도 브랜치에 둔다.
- 인스턴스를 새로 만드는 절차는 `scripts/aws/provision.sh` → `scripts/aws/units.sh` 참고.
- SSH 인바운드는 관리자 PC의 공인 IP로 제한돼 있다. 다른 네트워크에서 배포하면 타임아웃될 수 있다 — 보안 그룹에 현재 IP를 추가해야 한다.
