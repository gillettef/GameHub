---
name: commit-push
description: Neoterra 작업 단위가 끝났을 때 변경 사항을 한국어 커밋 메시지로 커밋하고 https://github.com/gillettef/Neoterra.git 의 dev 로 푸시한다. "커밋해 줘/푸시해 줘/commit-push" 요청 시, 또는 기능·수정 하나가 끝났을 때 사용.
---

# /commit-push — 한국어 커밋 후 푸시

## 0. 저장소 준비 확인
- `git rev-parse --is-inside-work-tree` 가 실패하면 저장소가 없다. 사용자에게 `git init` 과 GitHub 저장소(`gillettef/Neoterra`) 생성 여부를 먼저 묻는다. 묻지 않고 원격 저장소를 만들지 않는다.
- 원격이 없으면 `git remote add origin https://github.com/gillettef/Neoterra.git`.
- `git config --get credential.https://github.com.username` 이 `gillettef` 인지 확인한다. 비어 있으면 `git config credential.https://github.com.username gillettef` 로 설정한다. 다른 GitHub 계정으로 푸시하지 않는다.
- `git branch --show-current` 가 `dev` 여야 한다. `main` 이면 커밋하지 말고 `git switch dev` 후 진행한다(변경 사항은 그대로 따라온다).

## 1. 상태 확인
```
git status --short
git diff --stat
```
`node_modules/`, `dist/`, `server-dist/`, `.dev/`, `.env*`, 로그, `.claude/settings.local.json` 이 스테이징되지 않는지 확인한다.

## 2. 검사
스크립트가 있으면 커밋 전에 통과해야 한다.
```
npm run typecheck
npm test
```
실패하면 커밋하지 말고 원인을 보고한다.

## 3. 커밋
- 메시지는 **한국어**, 제목 `<타입>: <요약>`.

  | 타입 | 용도 |
  |---|---|
  | 기능 | 새 기능 |
  | 수정 | 버그 수정 |
  | 규칙 | Rules.md·데이터 수치 변경 |
  | 리팩터 | 동작 변화 없는 구조 개선 |
  | 테스트 | 테스트 추가·수정 |
  | 문서 | CLAUDE.md, notes 등 |
  | 설정 | 빌드·툴링·의존성·스크립트·.claude |
  | 스타일 | UI 스타일 |

- 본문은 무엇을 왜 바꿨는지 2~5줄. 마지막 줄에 시스템이 안내한 `Co-Authored-By` 라인을 붙인다.
- 기능 여러 개를 한 커밋에 뭉치지 않는다.

## 4. 푸시
```
git push origin dev
```
- 첫 푸시는 `git push -u origin dev`.
- 거부되면 `git pull --rebase origin dev` 후 다시. 충돌은 사용자에게 알린다.
- `--force`, `--no-verify` 금지. `main` 으로 직접 푸시하지 않는다.

## 4-1. 운영 반영 (사용자가 요청할 때만)
`dev` → `main` PR을 만든다: `gh pr create --base main --head dev`. 병합 후 버전 태그(`v0.1.0` 등)를 붙인다.

## 5. 보고
커밋 해시와 제목 한 줄.
