# Neoterra (네오테라)

새 행성 개척 문명 카드게임. 모바일 웹 전용(한 기기 AI 대전·온라인 대전). GameHub 허브 `/neoterra/` 에서 실행된다.

- 규칙 정본: [`notes/Rules.md`](notes/Rules.md)
- 프로젝트 가이드(스택·코딩 규칙): [`CLAUDE.md`](CLAUDE.md)
- 환경·브랜치 전략: [`docs/environments.md`](docs/environments.md)

## 실행

GameHub 루트에서 `npm install` 한 뒤 이 폴더에서:

```
npm run dev        # Vite http://localhost:25358 (온라인 방 서버 /ws 포함)
npm test
npm run build      # vite build + 서버 번들(server-dist/app.cjs)
npm run e2e        # 빌드 결과를 허브로 띄워 iPhone 화면 확인
npm run simulate -- --games 500 --players 3 --seed 1
```
