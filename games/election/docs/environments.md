# 실행 환경과 브랜치 전략

같은 코드를 쓰고 실행 위치만 다르다. **DB가 없으므로** 환경별 데이터 보호 장치는 필요 없고, 운영 서버의 방 상태는 메모리에만 있다.

| 환경 | 위치 | 주소 | 실행 |
|---|---|---|---|
| 로컬 | 각자 PC | 개발 38617, 미리보기 38627(`/election/`) | `/dev`, `/dev-stop` |
| 운영 | AWS EC2 공용 서버(t4g.nano, 서울), 허브 `gamehub`(:80) 안 inproc | `http://54.116.67.196/election/` | `main` 병합 시 `deploy.yml` → `deploy-election.yml` |

- 2026-11-02 첫 운영(단독 서버 :8096), 2026-11-24 GameHub 허브로 합침, 2026-11-25 공통 구조(workspaces·React·`@gamehub/net`)로 옮김. 옛 단독 서버·systemd `election`·포트 8096·`deploy-aws.yml` 은 쓰지 않는다.
- 배포는 공통 `deploy-workspace-game.yml`: 러너에서 `npm ci` → `npm run check` → `dist`·`server-dist`·`scripts/aws` 를 올리고 허브를 재시작·확인한다. SSH(22)는 배포하는 동안만 러너 IP 를 임시로 연다. 시크릿 값의 정본은 저장소 밖 `aws_config.md`.
- 운영은 HTTP 라 서비스 워커·PWA 설치는 쓰지 않는다.

## 브랜치 전략

| 브랜치 | 대응 환경 | 규칙 |
|---|---|---|
| `dev` | 로컬·검수 | 일상 작업을 커밋·푸시한다. CI(`ci-workspace.yml`)만 돈다 |
| `main` | 운영(EC2) | 직접 커밋·푸시하지 않는다. 사용자가 요청할 때만 `dev` → `main` PR. 병합되면 배포된다 |

- 긴급 수정도 `dev`에서 고친 뒤 `main`으로 병합한다.
- 배포하면 허브가 재시작되어 모든 게임의 진행 중인 온라인 방이 사라지므로 빈 시간에 병합한다.
- GitHub 계정은 **`gillettef`만** 쓴다(`git config credential.https://github.com.username gillettef`).
