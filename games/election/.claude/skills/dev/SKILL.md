---
name: dev
description: 현재 세션 백그라운드에서 개발 서버(또는 빌드 미리보기)를 --host로 띄워 PC와 같은 Wi-Fi의 폰에서 바로 테스트할 수 있게 한다. "서버 띄워", "폰에서 해 보게", "dev 실행" 요청이나 /dev 에 사용. 인자 `preview`면 빌드 결과를 허브와 같은 방식(/election/)으로 띄운다.
---

# 개발 서버 실행 (로컬 + 네트워크)

포트는 고정한다(`--strictPort`). 그래야 `dev-stop`이 확실히 끌 수 있다. 명령은 `games/election` 에서 실행한다(설치는 모노레포 루트에서 `npm install` 한 번).

| 모드 | 인자 | 포트 | 명령 |
|---|---|---|---|
| 개발(HMR) | 없음 / `dev` | 38617 | `npx vite --host --port 38617 --strictPort` |
| 미리보기(빌드 결과, 허브 방식) | `preview` | 38627 | `npm run build` 후 `PORT=38627 npm start` → `http://localhost:38627/election/` |

개발 서버는 온라인 방 서버(`server/app.ts`, `/ws`)를 같은 포트에 함께 띄운다(`@gamehub/config/vite`). 따로 띄울 서버가 없다.

## 절차

1. **이미 떠 있는지 확인.** `netstat -ano | grep -E ":(38617|38627) " | grep LISTENING` — 떠 있으면 새로 띄우지 않고 URL만 알려 준다.
2. **(preview만) 빌드.** 포그라운드에서 `npm run build`. 실패하면 멈추고 오류를 보고한다.
3. **백그라운드로 실행.** Bash 도구에서 `run_in_background: true`로 위 표의 명령을 실행한다. 반환된 task ID를 기억해 둔다(`dev-stop`이 쓴다).
4. **URL 확인.** 출력에서 준비 줄(`Network`, 또는 `http://localhost:38627/election/`)이 나올 때까지만 읽고 `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:<포트>/` 로 확인한다. Vite 출력의 ANSI 색 코드 때문에 `grep -q "Network"`처럼 콜론 없이 찾는다.
5. **사용자에게 보고.** PC `http://localhost:<포트>/`, 폰은 출력의 `Network:` URL(같은 Wi-Fi). 끌 때는 `/dev-stop`.

## 알아 둘 점 (필요할 때만 말한다)

- **폰에서 접속이 안 되면:** Windows 방화벽이 Node.js의 개인 네트워크 수신을 막고 있을 가능성이 크다. 공용·게스트 Wi-Fi(단말 간 격리)에서는 접속되지 않는다.
- 서버는 이 Claude Code 세션에 묶여 있다. 세션을 끝내면 함께 꺼질 수 있다.
