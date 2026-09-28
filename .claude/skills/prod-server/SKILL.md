---
name: prod-server
description: 친구들이 웹으로 접속하는 운영 서버(AWS EC2 상시 서버, http://<Elastic IP>:3201)에 최신 코드를 배포한다. "운영 서버 켜줘", "친구들 접속 서버 실행", "배포해줘", "운영에 반영해줘" 요청 시 사용. 서버 자체는 systemd로 항상 떠 있으므로 이 스킬은 사실상 재배포다. 완전히 끄려면 /prod-server-stop.
---

# /prod-server — 운영(prod) 배포 (AWS EC2)

2026-09-28부터 prod는 로컬 PC가 아니라 **AWS EC2 상시 서버**(서울 리전, systemd `astraltab-prod-server`/`astraltab-prod-ai`)에서 24시간 돌아간다. 로컬에서 서버를 "켜고 끌" 필요가 없고, 코드를 바꾼 뒤 반영(재배포)만 하면 된다.

GitHub 저장소가 비공개라 EC2가 직접 clone/pull 하지 않는다. `scripts/deploy-aws.ps1` 이 로컬 워킹트리를 `git archive`로 패키징해 ssh 전송한 뒤, 서버에서 `scripts/aws/deploy-remote.sh` 가 `npm install` → 클라이언트 빌드(`client/dist/prod`) → `pip install` → systemd 재시작을 수행한다.

## 실행 절차

1. Bash 툴로 실행한다 (완료까지 블로킹, 보통 30초~2분).

   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-aws.ps1 -Env prod
   ```

2. 마지막 줄 `DEPLOY_OK (prod)` 와 `=== 배포 완료 ===` 를 확인한다. 실패하면 ssh/빌드 오류 메시지가 그대로 출력된다.
3. 사용자에게 접속 주소 `http://<.dev/aws-public-ip.txt 의 IP>:3201` 을 알려준다. 도메인이 없으므로 IP:포트 그대로 공유한다.

## 로그 확인

```
ssh -i .dev/astraltab-key.pem ec2-user@$(cat .dev/aws-public-ip.txt) "sudo journalctl -u astraltab-prod-server -n 100"
ssh -i .dev/astraltab-key.pem ec2-user@$(cat .dev/aws-public-ip.txt) "sudo journalctl -u astraltab-prod-ai -n 100"
```

## 주의

- 검증하지 않은 변경은 먼저 `/test-server`(같은 인스턴스의 3301)로 배포해 확인한 뒤 prod에 올린다. 사용자가 명시적으로 prod까지 요청하지 않았다면 test까지만 배포한다.
- 인스턴스 자체를 새로 만드는 절차(최초 1회만 필요)는 `scripts/aws/provision.sh` → `scripts/aws/units.sh` 참고. 평소 배포에는 필요 없다.
- SSH 인바운드는 관리자 PC의 공인 IP로 제한돼 있다. 다른 네트워크(카페, 이동통신 등)에서 배포하면 ssh가 타임아웃될 수 있다 — 보안 그룹(`sg-*`, 콘솔 또는 `aws ec2 authorize-security-group-ingress`)에 현재 IP를 추가해야 한다.
