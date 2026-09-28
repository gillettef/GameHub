---
name: prod-server-stop
description: AWS EC2에서 상시 운영 중인 운영 서버(Node 3201, Python AI 8001)를 systemd로 중지한다. "운영 서버 꺼줘", "배포 서버 종료", "prod 내려줘" 요청 시 사용. 평소 배포에는 필요 없다 — 코드 반영은 /prod-server(재배포) 로 한다.
---

# /prod-server-stop — 운영 서버 중지 (AWS EC2)

2026-09-28부터 prod는 AWS EC2에서 systemd로 상시 실행되며(Restart=always, 재부팅 시 자동 시작), 로컬 PC에서 켜고 끄는 프로세스가 아니다. 이 스킬은 유지보수 등으로 **친구들 접속을 일시적으로 막고 싶을 때만** 쓴다.

## 실행 절차

```
ssh -i .dev/astraltab-key.pem ec2-user@$(cat .dev/aws-public-ip.txt) "sudo systemctl stop astraltab-prod-server astraltab-prod-ai"
```

다시 켜려면:

```
ssh -i .dev/astraltab-key.pem ec2-user@$(cat .dev/aws-public-ip.txt) "sudo systemctl start astraltab-prod-server astraltab-prod-ai"
```

## 주의

- 접속 중이던 친구들에게 서버가 내려갔음을 알려야 한다고 사용자에게 말한다.
- 코드를 반영하는 게 목적이면 이 스킬 대신 `/prod-server`(`scripts/deploy-aws.ps1 -Env prod`)를 쓴다 — 재배포 과정에서 서비스가 자동으로 재시작된다.
