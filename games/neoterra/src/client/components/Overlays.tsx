// 기록 서랍, 결과판, 시대 전환 배너·시대 요약, 내 차례 요약, 확인 창
import { useEffect, useRef, type CSSProperties } from 'react';
import type { GameState, LogEntry } from '../../engine/types';
import { Confetti } from '../motion';
import { ranking } from '../../engine/rules/scoring';
import { mainDoctrine } from '../../engine/rules/derive';
import { researchedCount } from '../../engine/rules/research';
import { CHARTER_FULL_POINTS, DOCTRINE_NAMES, FRUITION_FIRST, FRUITION_OTHER, FRUITION_PER_STAGE } from '../../engine/data/constants';
import { useApp } from '../store/app';
import { useGame } from '../useGame';
import { Sheet } from './Sheet';
import styles from './Overlays.module.css';

const banners = import.meta.glob('../assets/emblems/era*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const eraName = (era: number) => (era <= 3 ? `${era}시대` : '종료 시대');

export function LogDrawer({ onClose }: { onClose: () => void }) {
  const { game } = useGame();
  const entries = game.log.slice(-150).reverse();
  return (
    <Sheet title="기록" onClose={onClose}>
      <ol className={styles.log}>
        {entries.map((e, i) => (
          <li key={i}>
            <span className={styles.round}>R{e.round}</span>
            {e.player !== null && <strong>{game.players[e.player].name} </strong>}
            {e.text}
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

/** 결과판. 배경을 눌러도 닫히지 않는다(✕ 로만 닫음) */
export function ScoreBoard({ onClose, onHome, onRematch }: { onClose: () => void; onHome: () => void; onRematch?: () => void }) {
  const { game } = useGame();
  const rows = ranking(game);
  return (
    <Sheet
      title="최종 점수"
      onClose={onClose}
      backdropClose={false}
      actions={[...(onRematch ? [{ label: '같은 설정으로 다시 하기', onClick: onRematch }] : []), { label: '처음 화면으로', onClick: onHome, tone: onRematch ? ('plain' as const) : ('primary' as const) }]}
    >
      <div className={styles.party}>
        <Confetti />
      </div>
      <table className={styles.score}>
        <thead>
          <tr>
            <th>순위</th>
            <th>이름</th>
            <th>문화</th>
            <th>결실</th>
            <th>기타</th>
            <th>합계</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.player} className={`${i === 0 ? styles.win : ''} anim-rise`} style={{ '--delay': `${150 + (rows.length - 1 - i) * 160}ms` } as CSSProperties}>
              <td>{i === 0 ? <span className={`${styles.crown} anim-float`}>★</span> : i + 1}</td>
              <td>{game.players[r.player].name}</td>
              <td>{r.culture}</td>
              <td>{r.fruition}</td>
              <td>{r.legacies + r.charters + r.patrons + r.finale}</td>
              <td>
                <strong>{r.total}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4 className={styles.subhead}>항목별 내역</h4>
      <ul className={styles.breakdown}>
        {rows.map((r) => (
          <li key={r.player}>
            <strong>{game.players[r.player].name}</strong> — 유산 {r.legacies} · 헌장 {r.charters} · 주둔지 {r.patrons} · 종료 기록 {r.finale}
          </li>
        ))}
      </ul>
      <dl className={styles.explain}>
        <dt>문화</dt>
        <dd>게임 끝에 남은 문화가 그대로 점수입니다.</dd>
        <dt>결실</dt>
        <dd>
          종료 묶음의 결실 퀘스트마다 그 노선 단계 × {FRUITION_PER_STAGE}점, 그 노선 단계 4에 처음 닿은 사람 +{FRUITION_FIRST}, 그 뒤 닿은 사람 +{FRUITION_OTHER}.
        </dd>
        <dt>기타</dt>
        <dd>완성한 유산의 점수 + 헌장 한 분야를 3단계까지 채울 때마다 {CHARTER_FULL_POINTS}점 + 지닌 주둔지 점수 + 종료 기록 퀘스트(지표 ÷ 기준).</dd>
      </dl>
    </Sheet>
  );
}

/** 시대가 바뀌면 배너를 잠깐 띄우고, 시대 요약을 대기열에 넣는다(배너가 사라진 뒤 NoticeLayer 가 연다) */
export function EraOverlay() {
  const { game } = useGame();
  const last = useRef(game.era);
  const show = useApp((s) => s.eraBanner);
  const set = useApp((s) => s.set);
  useEffect(() => {
    if (game.era !== last.current) {
      last.current = game.era;
      const era = game.era;
      useApp.getState().pushNotice({ kind: 'era', era });
      set({ eraBanner: era });
      const t = setTimeout(() => set({ eraBanner: null }), 2400);
      return () => clearTimeout(t);
    }
  }, [game.era, set]);
  if (show === null) return null;
  return (
    // 안쪽 요소의 애니메이션 끝(버블링)은 무시하고 배너 자신의 것만
    <div className={`${styles.era} anim-era`} onAnimationEnd={(e) => e.target === e.currentTarget && set({ eraBanner: null })}>
      <span className={`${styles.rays} anim-rays`} style={{ color: `var(--ring${Math.min(show, 3)})` }} aria-hidden />
      <img src={banners[`../assets/emblems/era${show}.svg`]} alt="" className="anim-float" style={{ '--dur': '2.4s' } as CSSProperties} />
      <strong className="anim-track-in" style={{ color: `var(--ring${Math.min(show, 3)})` }}>
        {eraName(show)}
      </strong>
    </div>
  );
}

/**
 * 요약 창(시대 요약·차례 요약)을 한 번에 하나만 연다.
 * 내 결정(PendingPrompt)·대기 중인 결정·확인 창·시대 배너가 있으면 기다린다
 */
export function NoticeLayer() {
  const { game } = useGame();
  const notices = useApp((s) => s.notices);
  const banner = useApp((s) => s.eraBanner);
  const confirm = useApp((s) => s.confirm);
  const shift = useApp((s) => s.shiftNotice);
  const head = notices[0];
  if (!head || banner !== null || confirm || game.pending.length > 0) return null;
  if (head.kind === 'era') return <EraSummary key={`era${head.era}`} era={head.era} onClose={shift} />;
  return <TurnSummary key={`turn${notices.length}`} entries={head.entries} onClose={shift} />;
}

/** 시대 전환 때 기록된 일(주둔지 요구 판정 등)과 지금 판세 */
function eraEvents(game: GameState, era: number): LogEntry[] {
  const marker = era <= 3 ? `${era}시대 시작` : '종료 시대 시작';
  let at = -1;
  for (let i = game.log.length - 1; i >= 0; i--) {
    if (game.log[i].player === null && game.log[i].text.startsWith(marker)) {
      at = i;
      break;
    }
  }
  if (at < 0) return [];
  // 시대 시작 줄 바로 앞의 주둔지 요구 판정(시대 전환 처리 중 기록된 것)
  const out: LogEntry[] = [];
  for (let i = at - 1; i >= 0 && i >= at - 20; i--) {
    const e = game.log[i];
    if (e.round !== game.log[at].round) break;
    if (e.text.includes('요구')) out.unshift(e);
  }
  return out;
}

function EraSummary({ era, onClose }: { era: number; onClose: () => void }) {
  const { game, me } = useGame();
  const events = eraEvents(game, era);
  return (
    <Sheet title={`${eraName(era)} 요약`} onClose={onClose} actions={[{ label: '확인', onClick: () => undefined }]}>
      <ul className={styles.breakdown}>
        {era <= 3 ? <li>이제 {era}고리 줄기·곁가지까지 연구할 수 있습니다.</li> : <li>마지막 시대 — 퀘스트 트랙 뒤쪽에 결실·종료 기록 퀘스트가 섞였습니다. 공개되면 곧 게임이 끝납니다.</li>}
        <li>퀘스트 트랙이 새 시대 카드로 바뀌었습니다.</li>
      </ul>
      <h4 className={styles.subhead}>주둔지 본국 요구 판정</h4>
      {events.length ? (
        <ul className={styles.breakdown}>
          {events.map((e, i) => (
            <li key={i}>
              {e.player !== null && <strong>{game.players[e.player].name} </strong>}
              {e.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.note}>판정할 주둔지가 없었습니다.</p>
      )}
      <h4 className={styles.subhead}>지금 판세</h4>
      <table className={styles.score}>
        <thead>
          <tr>
            <th>이름</th>
            <th>문화</th>
            <th>연구</th>
            <th>주 노선</th>
          </tr>
        </thead>
        <tbody>
          {game.players.map((p) => {
            const d = mainDoctrine(p);
            return (
              <tr key={p.id} className={p.id === me ? styles.win : ''}>
                <td>{p.name}</td>
                <td>{p.res.culture}</td>
                <td>{researchedCount(p)}</td>
                <td style={d ? { color: `var(--${d})` } : undefined}>{d ? DOCTRINE_NAMES[d] : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Sheet>
  );
}

/** 내 차례가 돌아오면: 지난 내 차례 이후 상대별로 무슨 일이 있었나 */
export function TurnSummary({ entries, onClose }: { entries: LogEntry[]; onClose: () => void }) {
  const { game } = useGame();
  const setSettings = useApp((s) => s.setSettings);
  const groups = new Map<number | null, LogEntry[]>();
  for (const e of entries) groups.set(e.player, [...(groups.get(e.player) ?? []), e]);
  const order = [...game.players.map((p) => p.id as number | null), null].filter((id) => groups.has(id));
  return (
    <Sheet
      title="지난 내 차례 이후"
      onClose={onClose}
      actions={[
        { label: '확인', onClick: () => undefined },
        { label: '앞으로 요약 보지 않기', onClick: () => setSettings({ turnSummary: false }), tone: 'plain' },
      ]}
    >
      {order.map((id) => {
        const list = groups.get(id)!;
        const shown = list.slice(-12);
        return (
          <section key={String(id)} className={styles.group}>
            <h4 className={styles.subhead} style={id !== null ? { color: `var(--seat-${id})` } : undefined}>
              {id === null ? '공통' : game.players[id].name}
            </h4>
            <ul className={styles.breakdown}>
              {list.length > shown.length && <li className={styles.note}>… 앞선 {list.length - shown.length}줄은 기록에서</li>}
              {shown.map((e, i) => (
                <li key={i}>{e.text}</li>
              ))}
            </ul>
          </section>
        );
      })}
    </Sheet>
  );
}

/** 행동 전 확인 창(useApp.confirm) */
export function ConfirmLayer() {
  const confirm = useApp((s) => s.confirm);
  const set = useApp((s) => s.set);
  if (!confirm) return null;
  const close = () => set({ confirm: null });
  return (
    <Sheet
      title={confirm.title}
      onClose={close}
      actions={[
        { label: confirm.ok, onClick: confirm.onOk },
        { label: '취소', onClick: () => undefined, tone: 'plain' },
      ]}
    >
      <p>{confirm.text}</p>
    </Sheet>
  );
}
