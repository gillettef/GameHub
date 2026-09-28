---
name: test-server
description: 운영에 올리기 전 검증용 테스트 서버(AWS EC2 상시 서버, http://<Elastic IP>:3301)에 최신 코드를 배포한다. 운영(3201)과 같은 인스턴스에서 포트만 분리돼 동시에 존재한다. "테스트 서버 켜줘", "스테이징 실행", "친구랑 테스트할 서버", "테스트에 반영해줘" 요청 시 사용. 완전히 끄려면 /test-server-stop.
---

# /test-server — 테스트(test) 배포 (AWS EC2)

2026-09-28부터 test도 prod와 같은 **AWS EC2 상시 서버**(systemd `astraltab-test-server`/`astraltab-test-ai`, 3301/8002)에서 24시간 돌아간다. 데이터 디렉터리(`server/data/test`)·클라이언트 빌드(`client/dist/test`)·포트가 prod와 분리돼 있어 운영에 영향을 주지 않는다.

## 실행 절차

1. Bash 툴로 실행한다.

   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-aws.ps1 -Env test
   ```

2. `DEPLOY_OK (test)` 와 `=== 배포 완료 ===` 를 확인한다.
3. 사용자에게 `http://<.dev/aws-public-ip.txt 의 IP>:3301` 을 알려준다.

## 로그 확인

```
ssh -i .dev/astraltab-key.pem ec2-user@$(cat .dev/aws-public-ip.txt) "sudo journalctl -u astraltab-test-server -n 100"
ssh -i .dev/astraltab-key.pem ec2-user@$(cat .dev/aws-public-ip.txt) "sudo journalctl -u astraltab-test-ai -n 100"
```

## 주의

- 이 프로젝트의 기본 방침은 "수정은 test까지만" 이다 — 사용자가 명시적으로 요청하지 않는 한 `/prod-server` 로 넘어가지 않는다.
- 인스턴스를 새로 만드는 절차는 `/prod-server` 스킬 문서 참고 (같은 인스턴스라 공용).
