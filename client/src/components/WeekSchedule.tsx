import { useView } from '../store';

// 이번 주 일정 (월~주말): 지난 날 초록 · 오늘 강조 · 점검용 토큰이 놓인 날 빨강.
// 진행 영역(PC 왼쪽 사이드바 / 모바일 '진행' 탭) 맨 위에 둔다 — 구단 보드가 아니라 "지금 어디까지 왔나"를 보는 자리라서 (사용자 요청 2026-09).
// 점검용 토큰은 내 것만 표시한다(관전자는 없음)

const WEEK_DAYS = [
  { key: 'mon', label: '월', what: '조달 · 이사회', hint: '월요일: 능력치 트랙만큼 자원을 받고 이사회를 엽니다' },
  { key: 'tue', label: '화', what: '행동', hint: '화요일: 기본 행동 1회 + 운영 2개로 카드 행동 1회' },
  { key: 'wed', label: '수', what: '행동', hint: '수요일: 기본 행동 1회 + 운영 2개로 카드 행동 1회' },
  { key: 'thu', label: '목', what: '행동', hint: '목요일: 기본 행동 1회 + 운영 2개로 카드 행동 1회' },
  { key: 'fri', label: '금', what: '경기', hint: '금요일: 라인업 제출 → 경기 → 경기 영향 주사위' },
  { key: 'weekend', label: '주말', what: '유지비 · 정리', hint: '주말: 유지비 지불, 시장 순환, 팬덤·체력·운영은 1개만 남김' },
] as const;

function currentDayKey(kind: string, day?: string): string | null {
  if (kind === 'monday.board') return 'mon';
  if (kind === 'weekday') return day ?? null;
  if (kind.startsWith('friday')) return 'fri';
  return null;
}

const MODE_LABEL = { noBasic: '기본 행동 불가', cardActionOnly: '카드 행동만' } as const;

export function WeekSchedule() {
  const { view, session } = useView();
  const today = currentDayKey(view.phase.kind, view.phase.kind === 'weekday' ? view.phase.day : undefined);
  if (!today) return null; // 준비 단계·게임 종료에는 일정이 없다
  const todayIndex = WEEK_DAYS.findIndex((d) => d.key === today);
  const me = session ? view.players[session.playerId] : undefined;
  const restrictions = (me?.restrictions ?? []).filter((x) => x.week === view.week);
  return (
    <section className="panel week-panel" aria-label="이번 주 일정">
      <h2 className="week-title">{view.week}주차 일정</h2>
      <ol className="week-rail">
        {WEEK_DAYS.map((d, i) => {
          const r = restrictions.find((x) => x.day === d.key);
          const state = i < todayIndex ? 'past' : i === todayIndex ? 'now' : '';
          return (
            <li key={d.key} className={`week-stop ${state}${r ? ' inspect' : ''}`} title={r ? `점검용 토큰: ${r.mode === 'noBasic' ? '기본 행동 불가' : '카드 행동만 가능'}` : d.hint}>
              <span className="week-dot" />
              <span className="week-day">{d.label}</span>
              <span className="week-what">{r ? MODE_LABEL[r.mode] : d.what}</span>
            </li>
          );
        })}
      </ol>
      <p className="week-today muted">{WEEK_DAYS[todayIndex]!.hint}</p>
      {restrictions.map((r) => (
        <p key={r.day} className="week-today error">
          점검용 토큰 · {WEEK_DAYS.find((d) => d.key === r.day)?.label}: {MODE_LABEL[r.mode]}
        </p>
      ))}
    </section>
  );
}
