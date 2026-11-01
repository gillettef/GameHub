---
name: dev
description: 현재 세션 백그라운드에서 개발 서버(또는 빌드 미리보기)를 --host로 띄워 PC와 같은 Wi-Fi의 폰에서 바로 테스트할 수 있게 한다. "서버 띄워", "폰에서 해 보게", "dev 실행" 요청이나 /dev 에 사용. 인자 `preview`면 프로덕션 빌드 + 미리보기(PWA·서비스 워커 확인용).
---

# 개발 서버 실행 (로컬 + 네트워크)

포트는 고정한다(`--strictPort`). 그래야 `dev-stop`이 확실히 끌 수 있다.

| 모드 | 인자 | 포트 | 명령 |
|---|---|---|---|
| 개발(HMR) | 없음 / `dev` | 38617 | `npx vite --host --port 38617 --strictPort` |
| 미리보기(빌드 결과) | `preview` | 38627 | `npm run build` 후 `npx vite preview --host --port 38627 --strictPort` |
| 온라인 대결 서버(Worker) | 두 모드 모두 함께 | 38637 | `npx wrangler dev` (포트·IP는 `wrangler.jsonc`의 `dev`에 고정) |

Vite(개발·미리보기 둘 다)는 `/api`를 38637의 Worker로 프록시한다(`vite.config.ts`). Worker가 없으면 AI 대결은 되지만 온라인 대결은 "다시 접속하는 중…"에서 멈춘다.

## 절차

1. **이미 떠 있는지 확인.** 해당 포트에서 LISTEN 중인 프로세스를 찾는다.
   ```bash
   netstat -ano | grep -E ":(38617|38637) " | grep LISTENING
   ```
   - 떠 있으면 새로 띄우지 않는다. 아래 4단계처럼 URL만 다시 알려 준다(이 세션이 띄운 것인지 아닌지도 말한다).
2. **(preview만) 빌드.** 포그라운드에서 `npm run build`. 실패하면 멈추고 오류를 보고한다.
3. **백그라운드로 실행.** Bash 도구에서 `run_in_background: true`로 위 표의 Vite 명령과 `npx wrangler dev`를 각각 실행한다(작업 디렉터리는 프로젝트 루트). 반환된 task ID 두 개를 기억해 둔다. `dev-stop`이 이 ID를 쓴다.
   - `wrangler.jsonc`의 `assets.directory`가 `./dist`라서 `dist/`가 없으면 wrangler가 시작하지 못할 수 있다. 없으면 먼저 `npm run build`.
   - wrangler 준비 줄은 `Ready on`이다.
4. **URL 확인.** 출력 파일에서 Vite의 준비 줄(`Local:`, `Network:`)이 나올 때까지만 읽는다. 대기는 Monitor 등을 쓰고 sleep 반복은 하지 않는다. 그런 다음 확인용 요청을 보낸다.
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:38617/
   ```
   - Vite 출력에는 ANSI 색 코드가 섞여 있어 `grep "Network:"`가 맞지 않는다. 기다릴 때는 `grep -q "Network"`처럼 콜론 없이 찾는다.
   - Vite는 IPv6 `localhost`로 열릴 수 있으니 `127.0.0.1` 대신 `localhost`를 쓴다.
   - `--strictPort` 때문에 포트가 사용 중이면 바로 실패한다. 이때는 그 포트를 쓰는 프로세스를 사용자에게 알린다. 사용자에게 묻지 않고 끄지 않는다.
5. **사용자에게 보고.** 다음을 짧게 알려 준다.
   - PC: `http://localhost:<포트>/`
   - 폰: 출력의 `Network:` URL(여러 개면 Wi-Fi 대역 `192.168.x.x`나 `10.x.x.x`를 앞에). PC와 같은 Wi-Fi여야 한다.
   - 끌 때는 `/dev-stop`.

## 알아 둘 점 (필요할 때만 말한다)

- **폰에서 접속이 안 되면:** Windows 방화벽이 Node.js의 개인 네트워크 수신을 막고 있을 가능성이 크다. 처음 실행할 때 뜨는 방화벽 창에서 "개인 네트워크"를 허용하도록 안내한다. 공용 네트워크로 설정된 Wi-Fi나 게스트 Wi-Fi(단말 간 격리)에서는 접속되지 않는다.
- **서비스 워커와 PWA:** `localhost`나 HTTPS에서만 등록된다. 폰에서 `http://192.168…`로 열면 게임은 되지만 오프라인과 설치는 확인할 수 없다. 이 둘은 PC의 `preview` 모드에서 확인한다. 개발 모드에서는 원래 서비스 워커를 등록하지 않는다(`src/main.ts`).
- 서버는 이 Claude Code 세션에 묶여 있다. 세션을 끝내면 함께 꺼질 수 있다.
