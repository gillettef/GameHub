---
name: dev-stop
description: /dev로 백그라운드에서 켠 개발 서버(프론트엔드 5173, 백엔드 8787)를 종료한다. 사용자가 개발 서버를 꺼 달라고 할 때 사용한다.
---

# 개발 서버 종료

대상은 이 프로젝트의 개발 서버 포트뿐이다: 프론트엔드 **5173**, 백엔드 **8787** (`/dev` 스킬 참고). 다른 포트나 다른 node 프로세스는 건드리지 않는다.

## 1. 이 세션에서 켠 백그라운드 작업 끄기

이 세션에서 `/dev`로 켠 백그라운드 작업 ID가 있으면 TaskStop 도구(지연 로드 도구라 먼저 ToolSearch로 불러온다)로 끈다.

## 2. 포트로 남은 프로세스 끄기

다른 세션에서 켰거나 1단계 뒤에도 포트가 열려 있으면, 포트를 듣는 프로세스를 찾아 자식 프로세스까지 끈다. (Windows, Git Bash)

```bash
for port in 5173 8787; do
  for pid in $(netstat -ano | grep -E ":$port .*LISTENING" | awk '{print $NF}' | sort -u); do
    tasklist //FI "PID eq $pid" //FO CSV //NH
    taskkill //PID "$pid" //T //F
  done
done
```

- 끄기 전에 `tasklist`로 프로세스 이름을 확인한다. `node.exe`가 아니면 이 프로젝트 서버가 아닐 수 있으므로 끄지 말고 사용자에게 알린다.

## 3. 확인과 보고

```bash
netstat -ano | grep -E ':(5173|8787) .*LISTENING' || echo "모두 종료됨"
```

- 한국어 Windows에서는 `taskkill` 메시지가 깨져 보일 수 있다. 성공 여부는 위 `netstat` 결과로 판단한다.
- 강제 종료한 서버의 백그라운드 작업은 exit code 1로 끝났다는 알림이 오는데, 정상이다.
- 끈 서버(포트, PID)와 이미 꺼져 있던 서버를 한두 줄로 알린다.
