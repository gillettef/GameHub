---
name: commit-push
description: LIGHTCONE 작업 단위가 끝났을 때 변경 사항을 한국어 커밋 메시지로 커밋하고 https://github.com/gillettef/Lightcone.git 의 dev 로 푸시한다. "커밋해 줘/푸시해 줘/commit-push" 요청 시, 또는 문서·규칙 수정 하나가 끝났을 때 사용.
---

# /commit-push — 한국어 커밋 후 푸시

CLAUDE.md 규칙: **작은 작업 단위가 끝날 때마다 반드시 commit & push**, **메시지는 한국어**.

## 0. 저장소 준비 확인
- 원격이 없으면 `git remote add origin https://github.com/gillettef/Lightcone.git`.
- `git config --get credential.https://github.com.username` 이 `gillettef` 인지 확인한다. 비어 있으면 `git config credential.https://github.com.username gillettef` 로 설정한다. 다른 GitHub 계정으로 푸시하지 않는다.
- `git branch --show-current` 가 `dev` 여야 한다. `main` 이면 커밋하지 말고 `git switch dev` 후 진행한다(변경 사항은 그대로 따라온다).

## 1. 상태 확인
```
git status --short
git diff --stat
```
- `node_modules/`, `dist/`, `.dev/`, `.env*`, 로그, `.claude/settings.local.json` 이 스테이징되지 않는지 확인한다.
- 이번 작업과 무관한 변경이 섞였다면 따로 커밋하거나 사용자에게 묻는다.
- 파일은 이름을 지정해서 추가한다(`git add -A` 보다 명시적 경로 선호).

## 2. 검사
- `package.json` 이 있으면 존재하는 스크립트(`npm test`, `npm run build`)를 커밋 전에 통과시킨다. 실패하면 커밋하지 말고 원인을 보고한다.
- 룰북을 고쳤다면 용어가 `docs/glossary.md` 와 일치하는지, 규칙 결정이 `docs/decisions.md` 에 기록됐는지 확인한다.

## 3. 커밋
- 메시지는 **한국어**, 제목 `<타입>: <요약>` (50자 이내).

  | 타입 | 용도 |
  |---|---|
  | 규칙 | rules/rulebook.md 변경 |
  | 결정 | docs/decisions.md 기록 |
  | 용어 | docs/glossary.md 변경 |
  | 구성물 | components/ 변경 |
  | 플레이테스트 | playtests/ 기록 |
  | 문서 | concept.md, CLAUDE.md 등 그 밖의 문서 |
  | 프로토타입 | 디지털 프로토타입 코드 |
  | 설정 | CI·배포·스크립트·.claude 설정 |

  예: `규칙: 잔상 이동 단계 문장 정리`
- 본문은 무엇을 왜 바꿨는지 2~5줄. 마지막 줄에 시스템이 안내한 `Co-Authored-By` 라인을 붙인다.
- 여러 작업을 한 커밋에 뭉치지 않는다.
- 여러 줄 메시지는 heredoc 또는 PowerShell here-string 으로 전달한다.

## 4. 푸시
```
git push origin dev
```
- 거부되면 `git pull --rebase origin dev` 후 충돌이 없을 때만 다시 푸시한다. 충돌은 사용자에게 알린다.
- `--force`, `--no-verify` 금지. `main` 으로 직접 푸시하지 않는다.
- 인증 실패 시 사용자에게 알리고 `! git push origin dev` 로 직접 실행하도록 안내한다.

## 4-1. 운영 반영 (사용자가 요청할 때만)
`dev` → `main` PR 을 만든다: `gh pr create --base main --head dev`. 병합되면 `deploy-aws.yml` 이 배포한다(프로토타입이 없으면 건너뜀).

## 5. 보고
커밋 해시와 제목 한 줄, 푸시 결과.
