import { useEffect, useRef, useState } from 'react';
import { cards } from '@server/engine/cards';
import type { PlayerId } from '@server/engine/state';
import { RESOURCES } from '@server/engine/types';
import type { PlayerToken, Resource } from '@server/engine/types';
import type { GameView, PlayerPublicView } from '@server/engine/view';
import { Chip, ResourceChip, TokenChip, TrackChip } from './components/Icons';
import type { IconName } from './components/Icons';
import { seatColor } from './components/Shell';
import { DAY_LABEL, INFRA_LABEL, TOKEN_LABEL, phaseLabel } from './labels';
import { useView } from './store';

// 효과 적용 강조: 서버 뷰가 바뀔 때마다 직전 뷰와 비교해 "무슨 일이 있었는지"(새 기록 + 참가자별 변화)를
// 화면 위쪽 토스트로 3초 동안 크게 보여준다. 봇이 연달아 움직여도 토스트가 쌓이므로(최대 4개) 놓치지 않는다.

const TOAST_MS = 3000;
const MAX_TOASTS = 4;
const MAX_DELTAS = 10;
const ROLL_DELAY_MS = 1300; // 주사위 눈이 든 토스트는 주사위 애니메이션(1.1초)이 멈춘 뒤에 띄운다
const ROLL_TEXT = /주사위 → \d|다시 굴림 → \d/;

type Delta =
  | { kind: 'resource'; resource: Resource; amount: number }
  | { kind: 'track'; track: Resource; delta: number }
  | { kind: 'vp'; amount: number }
  | { kind: 'token'; token: PlayerToken; count: number; name: string }
  | { kind: 'text'; icon?: IconName; text: string; tone?: string };

interface PlayerDelta {
  pid: PlayerId;
  deltas: Delta[];
}

interface Toast {
  id: number;
  primary?: PlayerId; // 머리에 쓸 참가자 (행위자)
  heading: string;
  lines: { actor?: PlayerId; text: string }[];
  players: PlayerDelta[];
}

const TOKENS: PlayerToken[] = ['injury', 'suspension', 'strengthTemp', 'strengthPerm', 'weaknessTemp', 'weaknessPerm'];

function playerName(p: PlayerPublicView, instanceId: string): string {
  const inst = p.roster.find((r) => r.instanceId === instanceId);
  return inst ? cards.player(inst.cardId).name : instanceId;
}

// 참가자 한 명의 공개 상태 변화 (자원·트랙·승점·선수·직원·스폰서·시설·사무실·리그·전술 손패)
export function diffPlayer(a: PlayerPublicView, b: PlayerPublicView, leagueA: number | undefined, leagueB: number | undefined): Delta[] {
  const out: Delta[] = [];
  for (const r of RESOURCES) {
    const d = b.resources[r] - a.resources[r];
    if (d !== 0) out.push({ kind: 'resource', resource: r, amount: d });
  }
  for (const r of RESOURCES) {
    const d = b.tracks[r] - a.tracks[r];
    if (d !== 0) out.push({ kind: 'track', track: r, delta: d });
  }
  if (b.vp !== a.vp) out.push({ kind: 'vp', amount: b.vp - a.vp });

  const before = new Map(a.roster.map((r) => [r.instanceId, r]));
  const after = new Map(b.roster.map((r) => [r.instanceId, r]));
  for (const r of b.roster) {
    const prev = before.get(r.instanceId);
    const name = cards.player(r.cardId).name;
    if (!prev) {
      out.push({ kind: 'text', icon: 'prospect', text: `영입 ${name}`, tone: 'prospect' });
      continue;
    }
    if (!prev.trained && r.trained) out.push({ kind: 'text', icon: 'train', text: `훈련 ${name}`, tone: 'train' });
    for (const t of TOKENS) {
      const d = r.tokens[t] - prev.tokens[t];
      if (d !== 0) out.push({ kind: 'token', token: t, count: d, name });
    }
    if (r.careerVP !== prev.careerVP) out.push({ kind: 'text', icon: 'vp', text: `${name} 경력 승점 ${r.careerVP - prev.careerVP > 0 ? '+' : ''}${r.careerVP - prev.careerVP}`, tone: 'vp' });
  }
  for (const r of a.roster) if (!after.has(r.instanceId)) out.push({ kind: 'text', text: `방출 ${playerName(a, r.instanceId)}` });

  const staffBefore = a.staff.map((s) => s.cardId);
  for (const s of b.staff) {
    const i = staffBefore.indexOf(s.cardId);
    if (i < 0) out.push({ kind: 'text', text: `고용 ${cards.staff(s.cardId).name}` });
    else staffBefore.splice(i, 1);
  }
  const suspBefore = a.staff.reduce((n, s) => n + s.suspension, 0);
  const suspAfter = b.staff.reduce((n, s) => n + s.suspension, 0);
  if (suspAfter !== suspBefore) out.push({ kind: 'text', icon: 'suspension', text: `직원 ${TOKEN_LABEL.suspension} ${suspAfter - suspBefore > 0 ? '+' : ''}${suspAfter - suspBefore}`, tone: 'suspension' });

  for (const id of b.sponsors.billboards) if (!a.sponsors.billboards.includes(id)) out.push({ kind: 'text', text: `광고판 ${cards.sponsor(id).name}` });
  if (b.sponsors.naming && b.sponsors.naming !== a.sponsors.naming) out.push({ kind: 'text', text: `유니폼 ${cards.sponsor(b.sponsors.naming).name}` });
  if (b.infrastructure.length > a.infrastructure.length) {
    const added = [...b.infrastructure];
    for (const t of a.infrastructure) {
      const i = added.indexOf(t);
      if (i >= 0) added.splice(i, 1);
    }
    for (const t of added) out.push({ kind: 'text', text: `건설 ${INFRA_LABEL[t]}` });
  }
  if (b.office !== a.office) out.push({ kind: 'text', text: `사무실 ${b.office}단계` });
  if (b.tacticCardCount !== a.tacticCardCount) out.push({ kind: 'text', icon: 'tactic', text: `전술 카드 ${b.tacticCardCount - a.tacticCardCount > 0 ? '+' : ''}${b.tacticCardCount - a.tacticCardCount}`, tone: 'tactic' });
  if (leagueA !== undefined && leagueB !== undefined && leagueA !== leagueB) out.push({ kind: 'text', icon: 'goal', text: `리그 ${leagueB - leagueA > 0 ? '+' : ''}${leagueB - leagueA}칸`, tone: 'goal' });
  return out;
}

function buildToast(id: number, before: GameView, after: GameView): Toast | null {
  const lastLog = before.log[before.log.length - 1]?.id ?? 0;
  const lines = after.log.filter((e) => e.id > lastLog).map((e) => ({ actor: e.actor, text: e.text }));
  const players: PlayerDelta[] = [];
  for (const pid of after.seats) {
    const a = before.players[pid];
    const b = after.players[pid];
    if (!a || !b) continue;
    const deltas = diffPlayer(a, b, before.league.players[pid], after.league.players[pid]);
    if (deltas.length) players.push({ pid, deltas: deltas.slice(0, MAX_DELTAS) });
  }
  if (lines.length === 0 && players.length === 0) return null;
  const primary = lines.find((l) => l.actor)?.actor ?? (players.length === 1 ? players[0]!.pid : undefined);
  const day = after.log.find((e) => e.id > lastLog)?.day;
  const heading = day ? (day === 'setup' ? '준비' : `${after.week}주차 ${DAY_LABEL[day]}`) : phaseLabel(after.phase.kind);
  return { id, primary, heading, lines, players };
}

function DeltaChip({ d }: { d: Delta }) {
  switch (d.kind) {
    case 'resource':
      return <ResourceChip resource={d.resource} amount={d.amount} signedValue />;
    case 'track':
      return <TrackChip track={d.track} delta={d.delta} />;
    case 'vp':
      return <Chip icon="vp" value={d.amount > 0 ? `+${d.amount}` : `${d.amount}`} title="승점 토큰" />;
    case 'token':
      return (
        <span className="chips fx-token" title={`${d.name}: ${TOKEN_LABEL[d.token]} ${d.count > 0 ? '+' : ''}${d.count}`}>
          <TokenChip token={d.token} count={d.count} />
          <span className="fx-token-name">{d.name}</span>
        </span>
      );
    case 'text':
      return <Chip icon={d.icon} tone={d.tone}>{d.text}</Chip>;
  }
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const { view, session } = useView();
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), TOAST_MS);
    return () => clearTimeout(t);
  }, []);
  const name = (pid?: PlayerId) => (pid ? (view.players[pid]?.name ?? pid) : '');
  const mine = !!session && (toast.primary === session.playerId || toast.players.some((p) => p.pid === session.playerId));
  const style = toast.primary ? ({ '--seat': seatColor(view, toast.primary) } as React.CSSProperties) : undefined;
  return (
    <div className={`fx-toast${mine ? ' mine' : ''}${toast.primary ? '' : ' neutral'}`} style={style} onClick={onDone} role="status">
      <div className="fx-head">
        {toast.primary && <span className="seat-dot" />}
        <b>{toast.primary ? name(toast.primary) : toast.heading}</b>
        {toast.primary && <span className="fx-day">{toast.heading}</span>}
      </div>
      {toast.lines.map((l, i) => (
        <div key={i} className="fx-line">
          {l.actor && l.actor !== toast.primary && <span className="fx-actor" style={{ '--seat': seatColor(view, l.actor) } as React.CSSProperties}>{name(l.actor)}</span>}
          {l.text}
        </div>
      ))}
      {toast.players.map((p) => (
        <div key={p.pid} className="fx-deltas" style={{ '--seat': seatColor(view, p.pid) } as React.CSSProperties}>
          {(p.pid !== toast.primary || toast.players.length > 1) && (
            <span className="fx-actor">
              <span className="seat-dot" />
              {name(p.pid)}
            </span>
          )}
          <span className="chips">
            {p.deltas.map((d, i) => (
              <DeltaChip key={i} d={d} />
            ))}
          </span>
        </div>
      ))}
      <span className="fx-bar" />
    </div>
  );
}

export function EffectToasts() {
  const { view } = useView();
  const prev = useRef<GameView | null>(null);
  const nextId = useRef(1);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const before = prev.current;
    prev.current = view;
    if (!before || before === view || before.id !== view.id) return; // 첫 뷰·같은 뷰·다른 판은 기준만 잡는다
    if (view.phase.kind.startsWith('setup')) return; // 준비 단계(드래프트·목표)는 화면의 대기 표시로 충분 (사용자 요청)
    const toast = buildToast(nextId.current, before, view);
    if (!toast) return;
    nextId.current += 1;
    const push = () => setToasts((t) => [...t, toast].slice(-MAX_TOASTS));
    if (toast.lines.some((l) => ROLL_TEXT.test(l.text))) setTimeout(push, ROLL_DELAY_MS);
    else push();
  }, [view]);

  if (toasts.length === 0) return null;
  return (
    <div className="fx-toasts" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDone={() => setToasts((all) => all.filter((x) => x.id !== t.id))} />
      ))}
    </div>
  );
}
