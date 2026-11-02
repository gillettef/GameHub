# 실행 환경과 브랜치 전략

같은 코드를 쓰고 실행 위치만 다르다. **DB가 없으므로** 환경별 데이터 보호 장치는 필요 없고, 운영 서버의 방 상태는 메모리에만 있다.

| 환경 | 위치 | 포트 | 실행 |
|---|---|---|---|
| 로컬 | 각자 PC | Vite 38617, 미리보기 38627, 서버 38637 | `/dev`, `/dev-stop` |
| 운영 | AWS EC2 공용 서버(t4g.nano, 서울) | 8096 | `main` 병합 시 `deploy-aws.yml` 자동 배포 |

> 현재 상태(2026-11-02): Cloudflare Workers 에서 Node 서버로 옮기고 Neoterra 와 같은 배포 파이프라인을 붙였다. **첫 운영 배포 전**이다. 배포 전에 할 일은 아래 "첫 배포 준비".

`deploy-aws.yml` 은 Neoterra·DoubleAgent 와 같은 방식이다. SSH(22)는 관리자 IP 에만 열려 있으므로 배포하는 동안만 러너 IP 를 보안 그룹에 임시로 열고, `ec2-user` 로 올린 뒤 서버 안에서 `/health` 를 확인한다. 저장소 시크릿 7개(AWS_ACCESS_KEY_ID·AWS_SECRET_ACCESS_KEY는 IAM `astraltab-ci`, EC2_SSH_PRIVATE_KEY는 CI 전용 `smilepark-ci` 키, AWS_REGION, AWS_SECURITY_GROUP_ID, EC2_HOST, EC2_HOST_KEY)는 저장소 밖 `aws_config.md` 값과 같다.

## 첫 배포 준비

1. ~~GitHub 저장소 시크릿 7개 등록~~ — 완료(2026-11-02, `aws_config.md` 값)
2. ~~보안 그룹 `sg-009e7c5a6dd31ef68` 에 TCP **8096** 인바운드(0.0.0.0/0) 추가~~ — 완료(2026-11-02, 설명 `Election`), `aws_config.md` 포트 목록 갱신
3. `main` 보호 규칙(직접 푸시 금지, PR 필수, CI 통과 필수).
4. `dev` → `main` PR 병합 → Actions 의 `Deploy AWS` 성공 확인 → `http://54.116.67.196:8096` 접속 → `v0.1.0` 태그.

## 브랜치 전략

| 브랜치 | 대응 환경 | 규칙 |
|---|---|---|
| `dev` | 로컬·검수 | 일상 작업을 커밋·푸시한다. CI만 돈다 |
| `main` | 운영(EC2) | 직접 커밋·푸시하지 않는다. `dev`에서 검수가 끝난 내용만 PR로 병합하고 버전 태그(`v0.1.0` 등)를 붙인다. 병합되면 배포된다 |

- 긴급 수정도 `dev`에서 고친 뒤 `main`으로 병합한다. 부득이 `main`에서 고쳤다면 즉시 `dev`에 역병합한다.
- `.claude/settings.json` 이 `main` 직접 푸시와 강제 푸시를 막는다.

## GitHub 계정

이 저장소는 **`gillettef` 계정만** 쓴다. 로컬 git 설정으로 Git Credential Manager의 계정 선택을 고정했다.

```
git config credential.https://github.com.username gillettef
git config user.name gillettef
git config user.email 108650157+gillettef@users.noreply.github.com
```

새로 클론한 경우에도 위 명령을 한 번 실행한다(`.git/config` 는 저장소에 올라가지 않는다).

## 배포 시 주의

- 서버 재시작 시 진행 중인 온라인 방이 사라지므로 배포 시각을 공지하거나 빈 시간에 병합한다.
- 병합 후 `main` 에 버전 태그(`v0.1.1` 등)를 붙인다.
- 수동 재배포는 Actions 탭의 `Deploy AWS` → Run workflow(`main`).
- 운영은 HTTP 라 서비스 워커(PWA·오프라인)는 등록되지 않는다.
