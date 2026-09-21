import { useEffect, useMemo, useRef, useState } from 'react';
import { activeSide, cards, instanceName, tokenLabel } from '@server/engine/cards';
import { standsCount } from '@server/engine/friday';
import { hasTrait, lineupStaminaCost } from '@server/engine/traits';
import { autoPlace, previewField, validatePlacements } from '@server/engine/lineup';
import { SECTOR_PAIRS, sectorCounts } from '@server/engine/match';
import type { PlayerInstance, UniformToken } from '@server/engine/state';
import { RESOURCES } from '@server/engine/types';
import type { Resources, Sector } from '@server/engine/types';
import { OpponentCardView, PlayerCardView, TacticCardView } from '../components/Cards';
import { useCommit } from '../commit';
import { useDevice } from '../device';
import { CostChips, Icon, ResourceChip } from '../components/Icons';
import { LineupPitch, Stepper, TokenChipView, playedInstance } from '../components/Lineup';
import type { StepDef } from '../components/Lineup';
import { TurnBanner } from '../components/Turn';
import { UpkeepWarning } from '../components/Upkeep';
import { SECTOR_LABEL, matchDieLabel } from '../labels';
import { initialDraft, saveDraft } from '../lineupDraft';
import { useGame } from '../store';
import { injuryRollLabel } from '../components/DiceTray';
import { resultKeyOf, useRevealedRoll, useUi } from '../ui';

const PREPARE_STEPS = ['전술', '출전 선수', '배치', '관중석·제출'] as const;

// 경기 준비: 한 화면에 할 일 하나씩 네 스텝(전술 → 출전 선수 → 배치 → 관중석·제출)으로 나눠 짠다 (test_insight C1·C2·C4).
// 스텝은 클라이언트 안에서만 나뉘고 서버에는 마지막에 submitLineup 한 번만 보낸다. 앞 스텝이 유효해야 다음으로 가지만
// 되돌아가는 것은 언제든 된다(포메이션·출전 선수를 바꾸면 배치가 다시 잡히므로). 내 차례가 아니어도 미리 짜 둘 수 있고,
// 초안은 lineupDraft 가 저장해 다음 주의 기본값으로 쓴다. 상대 팀 카드는 모든 스텝 옆에 고정.
export function FridayPrepareScreen() {
  const { view, me, act } = useGame();
  const { mobile } = useDevice();
  const game = `${view.id}:${view.me}`;
  const [init] = useState(() => initialDraft(game, view.week, me, view.self.tacticCards));
  const [tacticCardId, setTacticCardId] = useState(init.tacticCardId);
  const [formationIndex, setFormationIndex] = useState(init.formationIndex);
  const [played, setPlayed] = useState<string[]>(init.played);
  const [placements, setPlacements] = useState<Record<string, Sector>>(init.placements);
  const [stands, setStands] = useState(init.stands);
  const [activations, setActivations] = useState<Record<string, boolean>>(init.activations);
  const [step, setStep] = useState(init.step);
  const [picked, setPicked] = useState<string | null>(null); // 배치 스텝에서 옮기려고 고른 토큰
  const [opponentOpen, setOpponentOpen] = useState(!mobile); // 모바일용은 접어 두고 필요할 때 펼친다

  const tactic = cards.tactic(tacticCardId || view.self.tacticCards[0]!);
  const formation = tactic.formations[formationIndex] ?? tactic.formations[0]!;
  const need = useMemo(() => sectorCounts(formation), [formation]);
  const field = useMemo(() => previewField(me.uniforms, played), [me.uniforms, played]);
  const issues = validatePlacements(field, me.roster, played, formation, placements);

  // 출전 선수·포메이션·필드 구성이 실제로 바뀔 때만 자동 배치 (서버 브로드캐스트마다 수동 배치를 덮어쓰지 않도록).
  // 처음 구성은 초안에서 되살린 배치를 그대로 둔다
  const layoutKey = `${field.map((t) => t.id).join(',')}|${played.join(',')}|${formation.defenders}-${formation.midfielders}-${formation.forwards}`;
  const restoredLayout = useRef<string | null>(layoutKey);
  useEffect(() => {
    if (layoutKey === restoredLayout.current) return;
    restoredLayout.current = null;
    setPlacements(autoPlace(field, me.roster, played, formation));
    setPicked(null);
  }, [layoutKey]);
  // 특성으로 전술 카드를 새로 뽑으면 손패가 바뀌므로 골라 둔 카드가 없어지면 첫 카드로
  useEffect(() => {
    if (tacticCardId && !view.self.tacticCards.includes(tacticCardId)) {
      setTacticCardId(view.self.tacticCards[0] ?? '');
      setFormationIndex(0);
    }
  }, [view.self.tacticCards, tacticCardId]);
  useEffect(() => {
    saveDraft(game, view.week, { tacticCardId, formationIndex, played, placements, activations, stands, step });
  }, [game, view.week, tacticCardId, formationIndex, played, placements, activations, stands, step]);

  if (view.phase.kind !== 'friday.prepare') return null;
  const submitted = view.phase.submitted[view.me];
  const submittedMap = view.phase.submitted;
  const current = view.phase.current;
  const myTurn = current === view.me;

  const playedRoster = me.roster.filter((r) => played.includes(r.instanceId));
  const numberOwner = new Map<number, PlayerInstance>();
  for (const r of playedRoster) {
    const n = activeSide(r).number;
    if (n !== undefined) numberOwner.set(n, r);
  }
  const keeper = playedRoster.find((r) => activeSide(r).goalkeeper); // 골키퍼는 1명만 출전
  // 왜 못 고르는지 카드에 적어 준다 (C1: "주전 선수가 왜 선택이 안 되지")
  const blockReason = (r: PlayerInstance): string | null => {
    if (r.tokens.injury > 0) return `부상 ×${r.tokens.injury} — 출전 불가`;
    if (r.tokens.suspension > 0) return `출장정지 ×${r.tokens.suspension} — 출전 불가`;
    const n = activeSide(r).number;
    const owner = n !== undefined ? numberOwner.get(n) : undefined;
    if (owner && owner.instanceId !== r.instanceId) return `등번호 ${n} 중복 — ${instanceName(owner)} 출전 중`;
    if (activeSide(r).goalkeeper && keeper && keeper.instanceId !== r.instanceId) return `골키퍼는 1명만 — ${instanceName(keeper)} 출전 중`;
    return null;
  };
  const togglePlayer = (instanceId: string) => setPlayed((p) => (p.includes(instanceId) ? p.filter((x) => x !== instanceId) : [...p, instanceId]));

  // 비용: 출전 체력 + 효과 활성화 자원 + 관중석 팬덤
  const lineupCost: Partial<Resources> = { stamina: lineupStaminaCost(me, playedRoster) };
  const activationMap: Record<string, Partial<Resources>> = {};
  for (const id of played) {
    if (!activations[id]) continue;
    const effect = activeSide(me.roster.find((r) => r.instanceId === id)!).effect;
    if (!effect || effect.mandatory) continue;
    activationMap[id] = effect.cost;
    for (const r of RESOURCES) lineupCost[r] = (lineupCost[r] ?? 0) + (effect.cost[r] ?? 0);
  }
  const standsMax = Math.max(0, Math.min(standsCount(me), me.resources.fandom - (lineupCost.fandom ?? 0)));
  const standsNow = Math.min(stands, standsMax);
  const cost: Partial<Resources> = { ...lineupCost, fandom: (lineupCost.fandom ?? 0) + standsNow };
  const lineupAffordable = RESOURCES.every((r) => (lineupCost[r] ?? 0) <= me.resources[r]);
  const affordable = RESOURCES.every((r) => (cost[r] ?? 0) <= me.resources[r]);

  const valid = [!!tacticCardId, lineupAffordable, issues.length === 0, affordable];
  const reachable = (i: number) => valid.slice(0, i).every(Boolean);
  const steps: StepDef[] = PREPARE_STEPS.map((label, i) => ({ label, done: valid[i] && i < step, warn: !valid[i] && i <= step, disabled: !reachable(i) }));
  const go = (i: number) => {
    setPicked(null);
    setStep(i);
  };
  const canSubmit = myTurn && !submitted && valid.every(Boolean);

  // "라인업 제출" 버튼 자체가 확정이다 (제출 전까지는 얼마든지 고칠 수 있다)
  const submit = () =>
    act({
      type: 'submitLineup',
      submission: { tacticCardId, formationIndex, players: played, placements, fandomInStands: standsNow, activations: activationMap },
    });

  // 배치: 토큰을 누르고 → 구획을 누르면 옮긴다. 토큰을 누르고 다른 토큰을 누르면 자리를 바꾼다
  const onToken = (id: string) => {
    if (!picked) return setPicked(id);
    if (picked !== id) {
      setPlacements((p) => {
        const next = { ...p };
        const a = p[picked];
        const b = p[id];
        if (b) next[picked] = b;
        else delete next[picked];
        if (a) next[id] = a;
        else delete next[id];
        return next;
      });
    }
    setPicked(null);
  };
  const onSector = (s: Sector) => {
    if (!picked) return;
    setPlacements((p) => ({ ...p, [picked]: s }));
    setPicked(null);
  };
  const unplace = () => {
    if (!picked) return;
    setPlacements((p) => {
      const next = { ...p };
      delete next[picked];
      return next;
    });
    setPicked(null);
  };
  const unplaced = field.filter((t) => !placements[t.id]);

  const opponentPanel = me.nextOpponent && (
    <details className="lineup-opponent" open={opponentOpen} onToggle={(e) => setOpponentOpen(e.currentTarget.open)}>
      <summary>다음 상대 · {cards.opponent(me.nextOpponent).teamName}</summary>
      <div className="cards"><OpponentCardView cardId={me.nextOpponent} revealed={me.scouted} /></div>
    </details>
  );

  return (
    <section className={`panel phase-panel${myTurn ? ' mine' : ''}`}>
      <div className="panel-head">
        <h2>경기 준비</h2>
        <TurnBanner current={current} done={submittedMap} />
      </div>
      {submitted ? (
        <p className="muted">{me.pending.length > 0 ? '라인업을 제출했습니다. 경기 전 효과의 대상을 고르면 다음 참가자로 넘어갑니다.' : '라인업을 제출했습니다. 다른 참가자를 기다리는 중'}</p>
      ) : (
        <>
          {!myTurn && (
            <p className="hint wait-note">
              <b>{view.players[current]!.name}</b>이(가) 라인업을 짜는 중입니다. 지금 미리 짜 두면 내 차례에 제출만 하면 됩니다.
            </p>
          )}
          <Stepper steps={steps} current={step} onSelect={go} />
          <div className="lineup-layout">
            <div className="stack lineup-main">
              {step === 0 && (
                <div className="step">
                  <h3>전술 카드와 포메이션 <span className="muted">상대의 스카우트 보고서를 보고 고릅니다</span></h3>
                  <div className="cards">
                    {view.self.tacticCards.map((id) => (
                      <TacticCardView key={id} cardId={id} compact selected={id === tacticCardId} onClick={() => { setTacticCardId(id); setFormationIndex(0); }} />
                    ))}
                  </div>
                  {hasTrait(me, 'redrawTactic') && tacticCardId && (
                    <div className="row">
                      <button className="ghost small" disabled={me.tacticRedrawn || !myTurn} onClick={() => act({ type: 'redrawTactic', cardId: tacticCardId })} title="특성: 스카우트 보고서를 본 뒤 전술 카드 1장을 버리고 새로 뽑습니다 (경기일마다 1회, 내 차례에만)">
                        {me.tacticRedrawn ? '이번 경기일에 이미 새로 뽑음' : '특성: 고른 카드를 버리고 새로 뽑기'}
                      </button>
                    </div>
                  )}
                  {tactic.formations.length > 1 && (
                    <div className="row">
                      포메이션
                      {tactic.formations.map((f, i) => (
                        <button key={i} className={i === formationIndex ? 'active' : ''} onClick={() => setFormationIndex(i)}>
                          {f.defenders}-{f.midfielders}-{f.forwards}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === 1 && (
                <div className="step">
                  <h3>출전 선수 <span className="muted">선수마다 <Icon name="stamina" size={12} />1 (카드에 올려놓은 <Icon name="stamina" size={12} />가 있으면 그것을 사용) · 고르지 않은 자리는 역량 1 유니폼 토큰</span></h3>
                  <p className={`small ${lineupAffordable ? 'muted' : 'error'}`}>
                    출전 {played.length}명 · 필요 <ResourceChip resource="stamina" amount={lineupCost.stamina ?? 0} cost /> / 보유 <Icon name="stamina" size={12} />{me.resources.stamina}
                    {!lineupAffordable && ' — 자원이 모자랍니다. 출전 선수나 효과 활성화를 줄이세요.'}
                  </p>
                  <div className="cards">
                    {me.roster.map((r) => {
                      const side = activeSide(r);
                      const reason = blockReason(r);
                      const on = played.includes(r.instanceId);
                      return (
                        <PlayerCardView
                          key={r.instanceId}
                          cardId={r.cardId}
                          instance={r}
                          selected={on}
                          onClick={reason ? undefined : () => togglePlayer(r.instanceId)}
                          footer={
                            reason ? (
                              <span className="error small lineup-blocked">⛔ {reason}</span>
                            ) : on && side.effect && !side.effect.mandatory ? (
                              <label className="row small" onClick={(e) => e.stopPropagation()}>
                                <input type="checkbox" checked={!!activations[r.instanceId]} onChange={(e) => setActivations((a) => ({ ...a, [r.instanceId]: e.target.checked }))} />
                                효과 활성화 <CostChips cost={side.effect.cost} />
                              </label>
                            ) : undefined
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="step">
                  <h3>
                    배치 <span className="formation">{formation.defenders}-{formation.midfielders}-{formation.forwards}</span>
                    <button className="ghost small" onClick={() => { setPlacements(autoPlace(field, me.roster, played, formation)); setPicked(null); }}>자동 배치</button>
                  </h3>
                  <p className="muted small">토큰을 누른 뒤 옮길 구획을 누르세요(밝은 구획이 그 선수가 설 수 있는 곳). 다른 토큰을 누르면 자리를 바꿉니다. 숫자는 역량.</p>
                  <LineupPitch roster={me.roster} field={field} played={played} placements={placements} need={need} showSkill selected={picked} onToken={onToken} onSector={onSector} />
                  {(unplaced.length > 0 || picked) && (
                    <div className={`unplaced${picked ? ' target' : ''}`} onClick={unplace}>
                      <span className="muted small">미배치{picked ? ' (여기를 누르면 구획에서 뺍니다)' : ''}</span>
                      {unplaced.map((t) => (
                        <TokenChipView key={t.id} token={t} inst={playedInstance(me.roster, played, t)} showSkill selected={t.id === picked} onClick={() => onToken(t.id)} />
                      ))}
                    </div>
                  )}
                  {issues.length > 0 ? <p className="error small">{issues.join(' · ')}</p> : <p className="ok-note small">✓ 포메이션대로 배치했습니다.</p>}
                </div>
              )}

              {step === 3 && (
                <div className="step">
                  <h3>관중석 <span className="muted">{standsCount(me)}석 · 놓은 <Icon name="fandom" size={12} />만큼 경기 후 <Icon name="money" size={12} /></span></h3>
                  <div className="stands-picker">
                    <button disabled={standsNow <= 0} onClick={() => setStands(standsNow - 1)} aria-label="관중석 팬덤 줄이기">−</button>
                    <span className="stands-value"><Icon name="fandom" size={16} /> {standsNow} <span className="muted">/ {standsMax}</span></span>
                    <button disabled={standsNow >= standsMax} onClick={() => setStands(standsNow + 1)} aria-label="관중석 팬덤 늘리기">+</button>
                    <span className="chips">→ 경기 후 <ResourceChip resource="money" amount={standsNow} /></span>
                  </div>
                  <p className="muted small">
                    보유 <Icon name="fandom" size={12} />{me.resources.fandom}. 넣을 수 있는 만큼 미리 채워 두었습니다 — 경기 뒤 주사위를 다시 굴릴 팬덤(1개씩)을 남기려면 줄이세요.
                    {standsMax === 0 && ' 지금은 관중석에 놓을 팬덤이 없습니다.'}
                  </p>
                  <UpkeepWarning view={view} p={me} />
                  <h3>제출 전 확인</h3>
                  <ul className="lineup-summary">
                    <li>전술 <b>{tactic.name}</b> · 포메이션 <b className="formation">{formation.defenders}-{formation.midfielders}-{formation.forwards}</b></li>
                    <li>출전 {played.length}명{playedRoster.length > 0 && <>: {playedRoster.map((r) => instanceName(r)).join(' · ')}</>}</li>
                    <li className="chips">
                      비용 {RESOURCES.filter((r) => (cost[r] ?? 0) > 0).map((r) => <ResourceChip key={r} resource={r} amount={cost[r]!} cost />)}
                      {RESOURCES.every((r) => (cost[r] ?? 0) === 0) && '없음'}
                      {!affordable && <span className="error">자원 부족</span>}
                    </li>
                  </ul>
                  <LineupPitch roster={me.roster} field={field} played={played} placements={placements} need={need} showSkill />
                </div>
              )}
            </div>
            {opponentPanel}
          </div>

          <div className="submit-row step-nav">
            <button disabled={step === 0} onClick={() => go(step - 1)}>← 이전</button>
            {step < PREPARE_STEPS.length - 1 ? (
              <button className="primary" disabled={!valid[step]} onClick={() => go(step + 1)}>다음: {PREPARE_STEPS[step + 1]} →</button>
            ) : (
              <button className="primary" disabled={!canSubmit} onClick={submit} title={myTurn ? undefined : '내 차례가 오면 제출할 수 있습니다'}>
                {myTurn ? '라인업 제출' : '내 차례에 제출'}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// 지금 써도 아무 일도 일어나지 않는 전술 효과 카드의 이유 (대상이 없음). 엔진은 받아 주고 기록만 남기므로 화면에서 미리 막는다
function tacticEffectBlock(cardId: string, me: { roster: PlayerInstance[]; uniforms: UniformToken[] }, played: string[]): string | null {
  for (const e of cards.tactic(cardId).effect?.effects ?? []) {
    if (e.type === 'addPlayerToken' && e.only === 'playedAttack' && !me.roster.some((r) => played.includes(r.instanceId) && activeSide(r).role === 'attack')) {
      return '출전 중인 [공격] 선수 카드가 없어 효과가 없습니다 (카드 없는 유니폼 토큰은 대상이 아닙니다)';
    }
    if (e.type === 'flipUnmatchedToken' && !me.uniforms.some((u) => u.location === 'field' && !u.cardInstanceId)) return '카드 없는 필드 유니폼 토큰이 없어 효과가 없습니다';
  }
  return null;
}

// p.21 경기 진행: 상대 팀 카드가 공개되고, 포메이션에 쓴 카드가 아닌 전술 카드 1장의 효과를 쓸 수 있다(카드는 손에 남는다).
// 선 참가자부터 한 명씩. 효과 카드는 select → 확정 막대, "효과 없이 진행"은 즉시 보낸다
export function FridayMatchScreen() {
  const { view, me, act } = useGame();
  const { chosen, select } = useCommit();
  if (view.phase.kind !== 'friday.match') return null;
  const { current, decided, effectCard } = view.phase;
  const actor = view.players[current]!;
  const mine = current === view.me;
  const lineup = view.phase.mine;
  const formation = lineup?.tacticCardId;
  const options = view.self.tacticCards.filter((id) => id !== formation && cards.tactic(id).effect);
  const choosing = mine && !decided[view.me];
  return (
    <section className={`panel phase-panel${mine ? ' mine' : ''}`}>
      <div className="panel-head">
        <h2>경기 진행</h2>
        <TurnBanner current={current} done={decided} />
      </div>
      <p className="hint">
        {choosing
          ? '상대 팀 카드가 공개됐습니다. 포메이션에 쓴 카드가 아닌 전술 카드 1장의 효과를 쓰거나, 효과 없이 진행하세요. 카드는 손에 남습니다.'
          : mine && me.pending.length > 0
            ? '전술 효과의 대상을 고르면 다음 참가자로 넘어갑니다.'
            : `${actor.name}이(가) 상대 팀 카드를 확인하고 전술 효과 카드를 고르는 중입니다.`}
      </p>
      <div className="two-col">
        <div className="stack">
          <h3>{actor.name}의 상대</h3>
          {actor.nextOpponent && <div className="cards"><OpponentCardView cardId={actor.nextOpponent} revealed /></div>}
        </div>
        <div className="stack">
          {mine && lineup && (
            <>
              <h3>내 라인업 <span className="muted">숫자는 역량</span></h3>
              <LineupPitch roster={me.roster} field={me.uniforms.filter((u) => u.location === 'field')} played={lineup.players} placements={lineup.placements} showSkill />
            </>
          )}
          {choosing ? (
            <>
              <h3>전술 효과 카드 <span className="muted">{options.length}장 가능</span></h3>
              {options.length > 0 ? (
                <div className="cards">
                  {options.map((id) => {
                    const blocked = tacticEffectBlock(id, me, lineup?.players ?? []);
                    return (
                      <TacticCardView
                        key={id}
                        cardId={id}
                        compact
                        chosen={chosen === `tactic:${id}`}
                        onClick={blocked ? undefined : () => select(`tactic:${id}`, { type: 'playTacticEffect', cardId: id }, <>전술 효과: <b>{cards.tactic(id).name}</b></>)}
                        footer={blocked ? <span className="error small lineup-blocked">⛔ {blocked}</span> : undefined}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="muted small">쓸 수 있는 효과 카드가 없습니다 (포메이션 카드는 효과로 쓸 수 없습니다).</p>
              )}
              <div className="row">
                <button className="primary" onClick={() => act({ type: 'playTacticEffect', cardId: null })}>효과 없이 진행</button>
              </div>
            </>
          ) : (
            <ul className="status-list">
              {view.seats.map((id) => (
                <li key={id}>
                  <b>{view.players[id]!.name}</b> — {decided[id] ? (effectCard[id] ? `전술 효과: ${cards.tactic(effectCard[id]!).name}` : '효과 없이 진행') : id === current ? '고르는 중' : '대기'}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

// 경기 결과도 선 참가자부터 한 명씩: 차례인 참가자의 경기 보고서와 주사위를 모두가 본다.
// 세 스텝으로 나눠 보여 준다 — ① 경기 결과 확인(득점자 이름) → ② 경기 영향 주사위 → ③ 부상 주사위(부상류일 때만).
// 스텝은 서버 상태(굴림 여부·부상 주사위)에서 정해져 지켜보는 참가자도 같은 스텝을 본다. 차례인 본인만 ①에서 "결과 확인"을
// 눌러야 주사위 트레이의 굴리기가 풀린다(ui.resultSeen) — 굴려야 하는지 몰라 멈춰 있던 문제(test_insight C4)
export function FridayAftermathScreen() {
  const { view } = useGame();
  const { resultSeen, setResultSeen } = useUi();
  const [override, setOverride] = useState<{ key: string; step: number } | null>(null); // 지나온 스텝을 다시 볼 때
  const dicePlace = useDevice().mobile ? '위' : '왼쪽'; // 모바일용 화면은 주사위가 단계 패널 위에 있다
  if (view.phase.kind !== 'friday.aftermath') return null;
  const { current, matches } = view.phase;
  const actor = view.players[current]!;
  const mine = current === view.me;
  const m = matches[current]!;
  const revealed = useRevealedRoll(current, m.roll); // 사이드바 주사위가 멈춘 뒤에만 눈을 보여준다
  const roll = m.injuryDice.length > 0 ? m.roll : revealed; // 이미 적용한 6면체 눈은 그대로 보여준다 (트레이는 부상 주사위로 넘어갔다)
  // 경기 영향이 부상류였으면 이어서 12면체 부상 주사위 (p.24·p.27)
  const injuryIndex = m.injuryDice.findIndex((d) => !d.applied);
  const injuryDie = injuryIndex >= 0 ? m.injuryDice[injuryIndex]! : null;
  const injuryRoll = useRevealedRoll(current, injuryDie?.roll ?? null, `d12-${injuryIndex}-`);
  const opponent = cards.opponent(m.opponentCardId);
  const outcomeLabel = { win: '승리', draw: '무승부', loss: '패배' }[m.report.outcome];
  const done = Object.fromEntries(view.seats.map((id) => [id, matches[id]!.decided]));

  const seenKey = resultKeyOf(view.week, current);
  const rolled = m.roll !== null || m.injuryDice.length > 0;
  const derived = injuryDie ? 2 : rolled || (mine && resultSeen === seenKey) ? 1 : 0;
  const overrideKey = `${seenKey}:${derived}`;
  const step = override?.key === overrideKey ? override.step : derived;
  const stepLabels = ['경기 결과', '경기 영향 주사위', ...(m.injuryDice.length > 0 ? ['부상 주사위'] : [])];
  const steps: StepDef[] = stepLabels.map((label, i) => ({ label, done: i < derived, disabled: i > derived }));

  const sectorGoals = m.report.sectors.reduce((n, s) => n + s.myGoals, 0);
  const sectorConceded = m.report.sectors.reduce((n, s) => n + s.theirGoals, 0);
  const field = actor.uniforms.filter((u) => u.location === 'field');

  return (
    <section className={`panel phase-panel${mine ? ' mine' : ''}`}>
      <div className="panel-head">
        <h2>경기 결과</h2>
        <TurnBanner current={current} done={done} />
      </div>
      <p className="scores-row">
        {view.seats.map((id) => {
          const x = matches[id]!;
          return (
            <span key={id} className={`tag${id === current ? ' now' : ''}${x.decided ? ' done' : ''}`}>
              {view.players[id]!.name} {x.report.myGoals}:{x.report.theirGoals} {{ win: '승', draw: '무', loss: '패' }[x.report.outcome]}
            </span>
          );
        })}
      </p>
      <Stepper steps={steps} current={step} onSelect={(i) => setOverride({ key: overrideKey, step: i })} />
      <div className="scoreline">
        <span className="team">{actor.name}</span>
        <span className={`score ${m.report.outcome}`}>{m.report.myGoals} : {m.report.theirGoals}</span>
        <span className="team">{opponent.teamName}</span>
        <span className={`outcome ${m.report.outcome}`}>{outcomeLabel}</span>
      </div>

      {step === 0 && (
        <div className="step">
          <div className="two-col">
            <div className="stack">
              <table className="report">
                <tbody>
                  {m.report.sectors.map((s, i) => (
                    <tr key={i}>
                      <td>{SECTOR_LABEL[SECTOR_PAIRS[i]![0]]}</td>
                      <td className="num">{s.myGoals} : {s.theirGoals}</td>
                      <td className="muted">{SECTOR_LABEL[SECTOR_PAIRS[i]![1]]}</td>
                      <td className="scorers">{s.myScorers.map((id) => `⚽ ${tokenLabel(actor, m.played, id)}`).join(' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {m.report.myGoals !== sectorGoals && <p className="muted small">카드·전술 효과로 넣은 골 {m.report.myGoals - sectorGoals > 0 ? '+' : ''}{m.report.myGoals - sectorGoals}</p>}
              {m.report.theirGoals !== sectorConceded && <p className="muted small">효과로 바뀐 실점 {m.report.theirGoals - sectorConceded > 0 ? '+' : ''}{m.report.theirGoals - sectorConceded}</p>}
              <p className="muted small">전술 효과: {m.effectCard ? <><b>{cards.tactic(m.effectCard).name}</b> — {cards.tactic(m.effectCard).effect?.text}</> : '쓰지 않음'}</p>
              <h3>{actor.name}의 라인업 <span className="muted">숫자 = 이 경기에 쓴 역량(일시적 토큰·전술 효과 포함) · ⚽ = 득점</span></h3>
              <LineupPitch roster={actor.roster} field={field} played={m.played} placements={m.placements} skills={m.skills} scorers={m.report.scorers} />
              <p className="muted small">승리 +3칸, 무승부 양 팀 +1칸, 패배 상대 +3칸. 관중석의 팬덤은 돈이 됐습니다.</p>
            </div>
            <OpponentCardView cardId={m.opponentCardId} revealed />
          </div>
          {derived === 0 &&
            (mine ? (
              <div className="submit-row step-nav">
                <span className="muted small">결과를 확인했으면 경기 영향 주사위를 굴립니다.</span>
                <button className="primary" onClick={() => setResultSeen(seenKey)}>결과 확인 → 경기 영향 주사위</button>
              </div>
            ) : (
              <p className="muted small">{actor.name}이(가) 결과를 확인하고 경기 영향 주사위를 굴릴 차례입니다.</p>
            ))}
        </div>
      )}

      {step === 1 && (
        <div className="step">
          <h3>경기 영향 주사위 <span className="muted">{outcomeLabel} 열</span></h3>
          <table className="die-table">
            <tbody>
              {[6, 5, 4, 3, 2, 1].map((face) => (
                <tr key={face} className={roll === face ? 'hit' : ''}>
                  <td className="face">{face}</td>
                  <td>{matchDieLabel(m.report.outcome, face)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {m.injuryDice.length > 0 ? (
            <p className="muted small">경기 영향 적용: <b>{matchDieLabel(m.report.outcome, m.roll!)}</b> → 부상 주사위로 누가 다치는지 정합니다.</p>
          ) : m.roll === null ? (
            <p className="hint todo">
              <Icon name="die" size={14} /> {mine ? `${dicePlace} 주사위 영역에서 굴리기를 누르세요.` : `${actor.name}이(가) 주사위를 굴리기를 기다리는 중`}
            </p>
          ) : roll === null ? (
            <p className="hint">
              <Icon name="die" size={14} /> 주사위가 구르는 중…
            </p>
          ) : mine ? (
            <p className="hint todo">
              <Icon name="die" size={14} /> {dicePlace} 주사위 영역에서 <b>적용: {matchDieLabel(m.report.outcome, roll)}</b>을 누르거나, 팬덤 1개로 다시 굴리세요.
            </p>
          ) : (
            <p className="muted small">{actor.name}이(가) 결과를 적용하거나 팬덤으로 다시 굴릴 수 있습니다.</p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="step">
          <h3>부상 주사위 <span className="muted">12면체 · 눈 = 다치는 선수의 등번호 (12는 12번 이상) · 그 번호의 출전 선수가 없으면 아무 일도 없음</span></h3>
          <ol className="injury-dice">
            {m.injuryDice.map((d, i) => {
              const shown = d.applied ? d.roll : i === injuryIndex ? injuryRoll : null;
              return (
                <li key={i} className={d.applied ? 'done' : i === injuryIndex ? 'now' : ''}>
                  <span className="tag">부상 토큰 {d.count}개</span>{' '}
                  {shown !== null ? <><b>눈 {shown}</b> — {injuryRollLabel(actor.roster, m.played, shown, d.count)}{d.applied ? ' (적용됨)' : ''}</> : i === injuryIndex ? (d.roll === null ? '굴리기 전' : '구르는 중…') : '대기'}
                </li>
              );
            })}
          </ol>
          <p className="played-numbers muted small">
            출전 선수 등번호: {actor.roster.filter((r) => m.played.includes(r.instanceId) && activeSide(r).number !== undefined).map((r) => activeSide(r).number).sort((a, b) => a! - b!).join(' · ') || '없음'}
          </p>
          {injuryDie && (
            <p className={`hint${mine && (injuryDie.roll === null || injuryRoll !== null) ? ' todo' : ''}`}>
              <Icon name="die" size={14} />{' '}
              {!mine
                ? `${actor.name}이(가) 부상 주사위를 굴리는 중`
                : injuryDie.roll === null
                  ? `${dicePlace} 주사위 영역에서 부상 주사위(12면체)를 굴리세요.`
                  : injuryRoll === null
                    ? '주사위가 구르는 중…'
                    : `${dicePlace} 주사위 영역에서 결과를 적용하거나, 팬덤 1개로 다시 굴리세요.`}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
