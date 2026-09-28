---
name: test-server-stop
description: AWS EC2에서 상시 실행 중인 테스트 서버(Node 3301, Python AI 8002)를 systemd로 중지한다. "테스트 서버 꺼줘", "스테이징 종료", "test 내려줘" 요청 시 사용. 평소 배포에는 필요 없다 — 코드 반영은 /test-server(재배포) 로 한다.
---

# /test-server-stop — 테스트 서버 중지 (AWS EC2)

2026-09-28부터 test도 AWS EC2에서 systemd로 상시 실행된다. 이 스킬은 유지보수 등으로 일시적으로 막고 싶을 때만 쓴다. 운영 서버(prod)는 건드리지 않는다.

## 실행 절차

```
ssh -i .dev/astraltab-key.pem ec2-user@$(cat .dev/aws-public-ip.txt) "sudo systemctl stop astraltab-test-server astraltab-test-ai"
```

다시 켜려면:

```
ssh -i .dev/astraltab-key.pem ec2-user@$(cat .dev/aws-public-ip.txt) "sudo systemctl start astraltab-test-server astraltab-test-ai"
```

## 주의

- 코드를 반영하는 게 목적이면 이 스킬 대신 `/test-server`(`scripts/deploy-aws.ps1 -Env test`)를 쓴다.
