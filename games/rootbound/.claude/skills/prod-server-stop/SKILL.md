---
name: prod-server-stop
description: 운영 rootbound 를 내리는 방법 안내. 2026-11-25부터 rootbound 는 GameHub 허브(systemd gamehub) 안에서 실행되므로 rootbound 만 따로 끌 수 없다. "운영 서버 꺼줘", "prod 내려줘" 요청 시 사용.
---

# /prod-server-stop — 운영 rootbound 내리기

rootbound 는 GameHub 허브 프로세스(systemd `gamehub`, :80) 안에서 다른 게임 14개와 함께 돈다. 예전처럼 `astraltab-prod-server` 하나만 끄는 방법은 없다.

## 선택지 (사용자에게 먼저 확인한다)

1. **허브 전체 중지** — 모든 게임이 내려간다. 사용자가 명시적으로 원할 때만:

   ```
   ssh -i .dev/astraltab-key.pem ec2-user@$(cat .dev/aws-public-ip.txt) "sudo systemctl stop gamehub"
   ```

   다시 켜기: 같은 명령에서 `stop` → `start`.

2. **rootbound 만 막기** — GameHub 저장소에서 `hub/games.json` 의 rootbound 를 빼거나 바꾸는 변경을 `dev` → `main` 으로 배포한다(허브 재시작이 따른다).

## 주의

- 접속 중이던 친구들에게 서버가 내려갔음을 알려야 한다고 사용자에게 말한다.
- 코드를 반영하는 게 목적이면 이 스킬 대신 배포(`/prod-server` 또는 GameHub Deploy 워크플로)를 쓴다.
