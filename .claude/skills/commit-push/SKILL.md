---
name: commit-push
description: 단계별 작업이 끝났을 때 검증 후 한국어 메시지로 git commit 하고 origin에 push 한다. 작업 단계 하나를 마칠 때마다, 또는 사용자가 커밋/푸시를 요청할 때 사용한다.
---

# 단계 완료 커밋 & 푸시

CLAUDE.md 규칙: **단계별 작업이 끝나면 반드시 commit & push**, **메시지는 가급적 한국어**.

## 1. 검증

`package.json`이 있으면 존재하는 스크립트만 실행합니다.

```
npm run typecheck
npm test
npm run lint
```

- 하나라도 실패하면 커밋하지 않습니다. 고칠 수 있으면 고치고 다시 검증합니다. 고칠 수 없으면 실패 출력과 함께 사용자에게 알리고 멈춥니다.
- 엔진(`src/engine/`)을 바꿨다면 커밋 전에 `rules-auditor`, UI를 바꿨다면 `mobile-ui-reviewer` 검토를 고려합니다.

## 2. 변경 확인

```
git status
git diff --stat
```

- 비밀 값(.env, 키, 토큰), 빌드 산출물(`dist/`), `node_modules/`가 포함되지 않았는지 확인합니다.
- 이번 단계와 무관한 변경이 섞였다면 따로 커밋하거나 사용자에게 묻습니다.
- 파일은 이름을 지정해서 추가합니다. (`git add -A`보다 명시적 경로 선호)

## 3. 커밋 메시지 (한국어)

```
<유형>: <무엇을 했는지 한 줄 요약, 50자 이내>

- 주요 변경 1
- 주요 변경 2
- 관련 규칙: docs/rule.md §8 (해당 시)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

| 유형 | 용도 |
|---|---|
| 기능 | 새 기능, 규칙 구현 |
| 수정 | 버그 수정 |
| 규칙 | docs/rule.md 변경 |
| 테스트 | 테스트만 추가·수정 |
| 리팩터 | 동작 변화 없는 구조 개선 |
| 화면 | UI·스타일 |
| 설정 | 빌드·도구·의존성·.claude 설정 |
| 문서 | 규칙서 외 문서 |

예: `기능: 3라운드 오름차순 쌓기 규칙 구현`

여러 줄 메시지는 heredoc 또는 PowerShell here-string으로 전달합니다.

## 4. 푸시

```
git push origin HEAD
```

- 첫 푸시라면 `git push -u origin main`.
- 거부되면(원격이 앞섬) `git pull --rebase origin main` 후 충돌이 없을 때만 다시 푸시합니다. 충돌이 있거나 강제 푸시가 필요해 보이면 멈추고 사용자에게 묻습니다. `--force`는 사용자의 명시적 지시 없이 쓰지 않습니다.
- 인증 실패 시 사용자에게 알리고 `! git push` 로 직접 실행하도록 안내합니다.

## 5. 보고

커밋 해시, 메시지 첫 줄, 푸시 결과를 한 두 줄로 알립니다.
