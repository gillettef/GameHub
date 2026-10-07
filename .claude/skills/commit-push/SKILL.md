---
name: commit-push
description: 작업 완료 후 변경 사항을 한국어 커밋 메시지로 커밋하고 https://github.com/gillettef/Rootbound.git 의 main 브랜치로 푸시한다. 작업 단위가 끝날 때마다 반드시 실행한다.
---

# /commit-push — 한국어 커밋 후 푸시

## 절차

1. 상태 확인
   ```
   git status --short
   git diff --stat
   ```
   `.dev/`, `server/data/`, `node_modules/`, `.env` 등 `.gitignore` 대상이 스테이징되지 않았는지 확인한다.

2. 스테이징
   ```
   git add -A
   ```
   의도하지 않은 파일이 포함되면 `git restore --staged <path>` 로 뺀다.

3. 커밋 — 메시지는 **한국어**, 제목은 `<타입>: <요약>` 형식, 관련 F-ID가 있으면 괄호로 덧붙인다.

   | 타입 | 용도 |
   |---|---|
   | 기능 | 새 기능 추가 |
   | 수정 | 버그 수정 |
   | 리팩터 | 동작 변화 없는 구조 개선 |
   | 테스트 | 테스트 추가·수정 |
   | 문서 | CLAUDE.md, notes, README 등 |
   | 설정 | 빌드·툴링·의존성·스크립트 |
   | 스타일 | UI 스타일, 포맷팅 |

   본문에는 무엇을 왜 바꿨는지 2~5줄로 적는다. 마지막 줄에 시스템이 안내한 `Co-Authored-By` 라인을 붙인다.

   ```
   git commit -m "기능: 로비 초대 링크 생성 및 클립보드 복사 (F001)" -m "방 생성 시 nanoid 기반 roomId를 발급하고 /room/:id 초대 URL을 반환한다.
클라이언트 로비 화면에 복사 버튼을 추가했다." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
   ```

4. 푸시
   ```
   git push origin main
   ```
   - 원격이 없으면: `git remote add origin https://github.com/gillettef/Rootbound.git`
   - 첫 푸시라면: `git push -u origin main`
   - 거부(rejected)되면 `git pull --rebase origin main` 후 다시 푸시한다. 충돌은 사용자에게 알린다.

5. 결과 보고: 커밋 해시와 제목 한 줄을 사용자에게 알린다.

## 하지 말 것

- `--no-verify`, `--force` 사용 금지.
- 여러 기능을 하나의 커밋으로 뭉치지 않는다. 작업 단위마다 커밋한다.
- `.dev/`, `server/data/`, 로그 파일을 커밋하지 않는다.
