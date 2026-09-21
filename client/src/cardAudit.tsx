import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BOARD_CARDS, EXECUTIVE_CARDS, OBJECTIVE_CARDS, OPPONENT_CARDS, PLAYER_CARDS, SPONSOR_CARDS, STAFF_CARDS, TACTIC_CARDS } from '@server/data';
import { autoPlace } from '@server/engine/lineup';
import type { PlayerInstance, UniformToken } from '@server/engine/state';
import type { PlayerPublicView } from '@server/engine/view';
import { BoardCardView, ExecutiveCardView, ObjectiveCardView, OpponentCardView, PlayerCardView, SponsorCardView, StaffCardView, TacticCardView } from './components/Cards';
import { LineupPitch } from './components/Lineup';
import { StandsPicker } from './components/StandsPicker';
import './styles.css';

// 개발용 카드 넘침 점검 (사용자 요청 2026-09, "텍스트가 카드 크기를 벗어난다"): 모든 카드를 실제 크기로 그리고
// (1) 카드 밖으로 나가 잘리는 요소, (2) 안쪽 상자(overflow: hidden)에서 잘리는 요소, (3) 말줄임(clamp)으로 잘린 글을 찾아 #audit 에 JSON 으로 적는다.
// `node scripts/card-audit.mjs`가 헤드리스 브라우저로 열어 결과를 읽는다. `?mobile`이면 모바일용 스타일로 잰다

const trainedOf = (cardId: string): PlayerInstance => ({ instanceId: `a-${cardId}`, cardId, trained: true, tokens: {}, placed: {}, stamina: 0, exhausted: false, careerVP: 0, careerUsed: { appearances: 0, goals: 0 } }) as PlayerInstance;

interface Finding {
  card: string;
  kind: 'outside' | 'clipped' | 'clamped';
  where: string;
  by: number;
}

function describe(el: Element): string {
  return `${el.tagName.toLowerCase()}.${typeof el.className === 'string' ? el.className.split(' ').join('.') : ''} "${(el.textContent ?? '').slice(0, 24)}"`;
}

function audit(): Finding[] {
  const out: Finding[] = [];
  for (const card of document.querySelectorAll<HTMLElement>('[data-audit] > .card')) {
    const id = card.parentElement!.dataset.audit!;
    const box = card.getBoundingClientRect();
    const seen = new Set<string>();
    const add = (f: Finding) => {
      const k = `${f.kind}:${f.where}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push(f);
    };
    for (const el of card.querySelectorAll<HTMLElement>('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const over = Math.max(r.bottom - box.bottom, r.right - box.right, box.left - r.left);
      if (over > 1 && el.children.length === 0) add({ card: id, kind: 'outside', where: describe(el), by: Math.round(over) });
      const style = getComputedStyle(el);
      if (style.overflow === 'hidden' || style.overflowY === 'hidden') {
        if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
          add({ card: id, kind: /clamp/.test(el.className) ? 'clamped' : 'clipped', where: describe(el), by: Math.max(el.scrollHeight - el.clientHeight, el.scrollWidth - el.clientWidth) });
        }
      }
    }
  }
  return out;
}

function Slot({ id, children }: { id: string; children: React.ReactNode }) {
  return <div data-audit={id} title={id}>{children}</div>;
}

// `?only=pitch`: 9지역 배치판을 포메이션별로 그려 눈으로 본다 (선수 카드 없는 토큰 10개를 자동 배치)
const SAMPLE_FIELD: UniformToken[] = Array.from({ length: 10 }, (_, i) => ({ id: `u${i}`, number: i + 2, face: i < 5 ? 'defense' : 'attack', location: 'field' }));
function PitchSamples() {
  const formations = [...new Map(TACTIC_CARDS.flatMap((c) => c.formations).map((f) => [`${f.defenders}-${f.midfielders}-${f.forwards}`, f])).values()];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16, width: '100%' }}>
      {formations.map((f) => (
        <section key={`${f.defenders}${f.midfielders}${f.forwards}`} className="panel">
          <h3>{f.defenders}-{f.midfielders}-{f.forwards}</h3>
          <LineupPitch roster={[]} field={SAMPLE_FIELD} played={[]} placements={autoPlace(SAMPLE_FIELD, [], [], f)} formation={f} showSkill />
        </section>
      ))}
    </div>
  );
}

// `?only=stands`: 경기 준비의 관중석 배치 그림 (기본 2석 / 3·4번 건설 + 추가 관중석)
function StandsSamples() {
  const [a, setA] = useState(1);
  const [b, setB] = useState(4);
  const fake = (infrastructure: string[]) => ({ infrastructure }) as unknown as PlayerPublicView;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 520px))', gap: 16, width: '100%' }}>
      <section className="panel"><StandsPicker me={fake([])} seats={2} max={2} value={a} onChange={setA} /></section>
      <section className="panel"><StandsPicker me={fake(['stand3', 'stand4'])} seats={5} max={5} value={b} onChange={setB} /></section>
    </div>
  );
}

// `?only=sponsor` 처럼 카드 종류 하나만 그릴 수 있다 (스크린샷으로 눈으로 볼 때)
const only = new URLSearchParams(location.search).get('only');
const show = (kind: string) => !only || only === kind;

function App() {
  const [result, setResult] = useState('');
  useEffect(() => {
    if (location.search.includes('mobile')) document.documentElement.classList.add('mobile-ui');
    void document.fonts.ready.then(() => requestAnimationFrame(() => setResult(JSON.stringify(audit()))));
  }, []);
  return (
    <main style={{ padding: 16 }}>
      <pre id="audit" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{result}</pre>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {only === 'pitch' && <PitchSamples />}
        {only === 'stands' && <StandsSamples />}
        {show('player') && PLAYER_CARDS.map((c) => <Slot key={c.id} id={`${c.id} ${c.name} (미훈련)`}><PlayerCardView cardId={c.id} /></Slot>)}
        {show('player') && PLAYER_CARDS.map((c) => <Slot key={`${c.id}-t`} id={`${c.id} ${c.name} (훈련)`}><PlayerCardView cardId={c.id} instance={trainedOf(c.id)} /></Slot>)}
        {show('staff') && STAFF_CARDS.map((c) => <Slot key={c.id} id={`${c.id} ${c.name}`}><StaffCardView cardId={c.id} /></Slot>)}
        {show('executive') && EXECUTIVE_CARDS.map((c) => <Slot key={c.id} id={`${c.id} ${c.name}`}><ExecutiveCardView cardId={c.id} /></Slot>)}
        {show('sponsor') && SPONSOR_CARDS.map((c) => <Slot key={c.id} id={`${c.id} ${c.name}`}><SponsorCardView cardId={c.id} /></Slot>)}
        {show('board') && BOARD_CARDS.map((c) => <Slot key={c.id} id={`${c.id} ${c.name}`}><BoardCardView cardId={c.id} /></Slot>)}
        {show('tactic') && TACTIC_CARDS.map((c) => <Slot key={c.id} id={`${c.id} ${c.name}`}><TacticCardView cardId={c.id} /></Slot>)}
        {show('objective') && OBJECTIVE_CARDS.map((c) => <Slot key={c.id} id={`${c.id} ${c.name}`}><ObjectiveCardView cardId={c.id} /></Slot>)}
        {show('opponent') && OPPONENT_CARDS.map((c) => <Slot key={c.id} id={`${c.id} (보고서)`}><OpponentCardView cardId={c.id} /></Slot>)}
        {show('opponent') && OPPONENT_CARDS.map((c) => <Slot key={`${c.id}-r`} id={`${c.id} (앞면)`}><OpponentCardView cardId={c.id} revealed /></Slot>)}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
