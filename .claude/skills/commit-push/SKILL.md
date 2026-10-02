---
name: commit-push
description: 작업 완료 후 변경사항을 한국어 메시지로 git commit 하고 push 한다. 모든 작업 마무리에 사용.
---
1. `git status`, `git diff`로 변경 내용을 확인한다. 저장소가 아니면 사용자에게 알린다.
2. 관련 파일만 `git add` 한다(비밀 정보·임시 파일 제외).
3. 변경 목적이 드러나는 한국어 커밋 메시지(첫 줄 50자 내외, 필요시 본문)로 commit 한다. 시스템에서 지정한 Co-Authored-By 줄이 있으면 말미에 붙인다.
4. `git push`로 원격에 올린다. upstream이 없으면 `git push -u origin <branch>`.
5. 실패(충돌, 권한 등) 시 원인을 그대로 보고한다.
