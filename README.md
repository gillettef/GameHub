# Neoterra (네오테라)

새 행성 개척 문명 카드게임. 모바일 웹 전용(AI 대전·핫시트·온라인 대전).

- 규칙 정본: [`notes/Rules.md`](notes/Rules.md)
- 프로젝트 가이드(스택·코딩 규칙·포트): [`CLAUDE.md`](CLAUDE.md)
- 환경·브랜치 전략: [`docs/environments.md`](docs/environments.md)

## 상태

v0 규칙 초안 단계. 코드 스캐폴딩 전이다.

## 실행 (스캐폴딩 후)

```
npm install
npm run dev        # Vite http://localhost:5190
npm run server     # 온라인 대전 서버 8094
npm test
npm run build
```

## 브랜치

일상 작업은 `dev`, 운영 배포는 `main`(PR 병합만). GitHub 계정은 `gillettef`만 쓴다.
