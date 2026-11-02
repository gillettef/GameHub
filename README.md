# 유세 대작전 (Election)

두 후보가 6개 권역을 도는 유세 버스로 지지자를 모으는 만칼라형 2인 보드게임. 모바일 웹(AI 대결·온라인 대결).

- 프로젝트 가이드(스택·규칙·포트·배포): [`CLAUDE.md`](CLAUDE.md)
- 환경·브랜치 전략: [`docs/environments.md`](docs/environments.md)

## 실행

```
npm install
npm run dev          # Vite (/api 는 38637 로 프록시)
npm run dev:server   # 온라인 대결 서버 38637(개발, 운영은 8096)
npm test
npm run build        # dist + server-dist/server.cjs
```

## 브랜치

일상 작업은 `dev`, 운영 배포는 `main`(PR 병합만). GitHub 계정은 `gillettef`만 쓴다.
