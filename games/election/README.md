# 유세 대작전 (Election)

두 후보가 6개 권역을 도는 유세 버스로 지지자를 모으는 만칼라형 2인 보드게임. 모바일 웹(봇 대결·한 기기·온라인·관전). GameHub 모노레포의 `games/election`.

- 프로젝트 가이드(규칙·구조·배포): [`CLAUDE.md`](CLAUDE.md)
- 모노레포 공통 계획: [`../../docs/refactor-plan.md`](../../docs/refactor-plan.md)

## 실행

```
npm install          # 모노레포 루트에서 한 번
npm run dev          # (games/election) Vite + 온라인 방 서버(/ws)
npm test
npm run build        # dist + server-dist/app.cjs
npm run e2e          # iPhone 17 Pro 화면 확인
```

운영은 GameHub 허브 안(`http://54.116.67.196/election/`). 일상 작업은 `dev`, 운영 배포는 `main`(PR 병합만).
