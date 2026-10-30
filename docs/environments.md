# 실행 환경과 브랜치 전략

같은 코드를 쓰고 실행 위치만 다르다. **DB가 없으므로** 환경별 데이터 보호 장치는 필요 없고, 운영 서버의 방 상태는 메모리에만 있다.

| 환경 | 위치 | 포트 | 실행 |
|---|---|---|---|
| 로컬 | 각자 PC | Vite 5190, 서버 8094 | `/dev`, `/dev-stop` |
| 운영 | AWS EC2 공용 서버(t4g.nano, 서울) | 8094 | `main` 병합 시 `deploy-aws.yml` 자동 배포 (준비 전) |

> 현재 상태(2026-10-30): 첫 구현 완료, 로컬 개발 중. CI(`ci.yml`)가 dev·main 푸시마다 타입체크·테스트·빌드를 돌린다. `deploy-aws.yml`·`scripts/aws/` 는 준비만 됐고, 저장소 시크릿(EC2_HOST·EC2_USER·EC2_SSH_KEY)과 보안 그룹 8094 개방(사용자 확인 후) 전에는 배포하지 않는다.

## 브랜치 전략

| 브랜치 | 대응 환경 | 규칙 |
|---|---|---|
| `dev` | 로컬·검수 | 일상 작업을 커밋·푸시한다(`/commit-push`). CI만 돈다 |
| `main` | 운영(EC2) | 직접 커밋·푸시하지 않는다. `dev`에서 검수가 끝난 내용만 PR로 병합하고 버전 태그(`v0.1.0` 등)를 붙인다. 병합되면 배포된다 |

- 긴급 수정도 `dev`에서 고친 뒤 `main`으로 병합한다. 부득이 `main`에서 고쳤다면 즉시 `dev`에 역병합한다.
- `.claude/settings.json` 이 `main` 직접 푸시와 강제 푸시를 막는다.
- GitHub에서 `main` 보호 규칙(직접 푸시 금지, PR 필수, CI 통과 필수)을 설정한다.

## GitHub 계정

이 저장소는 **`gillettef` 계정만** 쓴다. 로컬 git 설정으로 Git Credential Manager의 계정 선택을 고정했다.

```
git config credential.https://github.com.username gillettef
git config user.name gillettef
git config user.email 108650157+gillettef@users.noreply.github.com
```

커밋 작성자는 GitHub가 주는 noreply 주소로 둔다. 개인 이메일이 커밋에 남지 않고, 항상 gillettef 계정으로 표시된다.

새로 클론한 경우에도 위 명령을 한 번 실행한다(`.git/config` 는 저장소에 올라가지 않는다).

## 운영 배포가 준비되면 할 일

1. 보안 그룹에 TCP 8094 인바운드 추가(사용자 확인 후).
2. EC2에 systemd `neoterra` 서비스, 경로 `~/neoterra`.
3. `.github/workflows/deploy-aws.yml`: `main` push 시 `npm test` → `npm run build` 통과 후 배포(DoubleAgent 구성을 본뜬다).
4. 서버 재시작 시 진행 중인 방이 사라지므로 배포 시각을 공지하거나 빈 시간에 병합한다.
