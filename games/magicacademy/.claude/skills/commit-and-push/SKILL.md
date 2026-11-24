---
name: commit-and-push
description: 마법학교 프로젝트의 작업 종료 시 git commit & push 규칙(CLAUDE.md 규칙 1·2)을 수행한다. 코드/문서 변경 작업을 마쳤을 때, 또는 사용자가 "커밋해줘", "푸시해줘", "commit and push"라고 요청할 때 사용한다.
---

# commit-and-push

`CLAUDE.md`의 필수 작업 규칙에 따라, 이 저장소에서는 작업을 마칠 때마다 커밋 후 원격 저장소(`https://github.com/gillettef/MagicAcademy.git`, 브랜치 `dev`)로 push까지 완료한다. 커밋 전에 현재 브랜치가 `dev`인지 확인하고(`main`이면 `git switch dev`), `main`(운영 배포)으로는 직접 푸시하지 않는다. 운영 반영은 사용자가 요청할 때만 `gh pr create --base main --head dev`로 PR을 만들어 병합한다. 이 스킬은 그 과정을 안전하고 일관되게 수행하기 위한 절차다.

## 절차

1. **상태 확인**
   - `git status`로 변경/미추적 파일을 확인한다.
   - `git diff` (staged/unstaged 모두)로 실제 변경 내용을 확인한다.
   - 변경 사항이 전혀 없으면 아무것도 하지 않고 그 사실을 사용자에게 알린다 (빈 커밋 금지).

2. **위험 파일 점검**
   - `.env`, credentials, API 키 등 비밀정보로 보이는 파일이 포함되어 있지 않은지 확인한다. 의심스러우면 내용을 확인 후 제외한다.
   - 의도치 않은 대용량 바이너리나 빌드 산출물이 포함되지 않았는지 확인한다.

3. **스테이징**
   - 관련 파일만 이름으로 지정해서 `git add`한다 (`git add -A`/`git add .` 남용 금지).

4. **커밋 메시지 작성 (한국어 우선 — CLAUDE.md 규칙 2)**
   - 무엇을 바꿨는지보다 **왜** 바꿨는지 중심으로 1~2문장 작성.
   - `git log`를 참고해 기존 커밋 메시지 스타일을 따른다.
   - Heredoc으로 메시지를 전달해 포맷을 보존한다.
   - 이 세션의 커밋 attribution 규칙(시스템 리마인더에 지정된 `Co-Authored-By` 등)이 있으면 그대로 말미에 포함한다.

5. **커밋 & 푸시**
   - `git commit -m "..."` 실행.
   - 커밋 성공 후 `git push`. 원격에 해당 브랜치가 없거나 upstream이 설정되어 있지 않으면 `git push -u origin <branch>`로 최초 push를 수행한다.
   - push가 실패하면(예: non-fast-forward) 원인을 파악해 사용자에게 알린다. `--force`는 사용자가 명시적으로 요청하지 않는 한 사용하지 않는다.

6. **확인**
   - `git status`로 커밋/푸시 후 상태가 깨끗한지 확인하고 결과를 짧게 보고한다.

## 예외 처리

- pre-commit/pre-push 훅이 실패하면 `--no-verify`로 건너뛰지 말고 원인을 고쳐서 다시 커밋한다.
- 커밋 대상이 애매하거나(예: 실험적으로 만든 임시 파일) 위험해 보이면(예: 대규모 삭제) push 전에 사용자에게 짧게 확인한다.
- force push, 히스토리 재작성, 브랜치 삭제 등은 이 스킬의 범위가 아니다 — 별도로 명시적 요청이 있을 때만 수행한다.
