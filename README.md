# Neoterra (네오테라)

새 행성 개척 문명 카드게임. 모바일 웹 전용(AI 대전·온라인 대전).

- 규칙 정본: [`notes/Rules.md`](notes/Rules.md)
- 프로젝트 가이드(스택·코딩 규칙·포트): [`CLAUDE.md`](CLAUDE.md)
- 환경·브랜치 전략: [`docs/environments.md`](docs/environments.md)

## 상태

v0.3 규칙 초안 + 첫 구현(규칙 엔진·AI·시뮬레이터, 모바일 테이블 UI, 온라인 서버). 수치는 시뮬레이션으로 조정 중이다.

## 실행 (스캐폴딩 후)

```
npm install
npm run dev        # Vite http://localhost:25358
npm run server     # 온라인 대전 서버 23641(개발, 운영은 8094)
npm test
npm run build
```

## 브랜치

일상 작업은 `dev`, 운영 배포는 `main`(PR 병합만). GitHub 계정은 `gillettef`만 쓴다.
