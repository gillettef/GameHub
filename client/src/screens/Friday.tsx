import { useEffect, useMemo, useState } from 'react';
import { activeSide, cards } from '@server/engine/cards';
import { standsCount } from '@server/engine/friday';
import { autoPlace, previewField, validatePlacements } from '@server/engine/lineup';
import { SECTOR_PAIRS, sectorCounts } from '@server/engine/match';
import type { UniformToken } from '@server/engine/state';
import { RESOURCES, SECTORS } from '@server/engine/types';
import type { Resources, Sector } from '@server/engine/types';
import { OpponentCardView, PlayerCardView, TacticCardView } from '../components/Cards';
import { CostChips, Icon, ResourceChip } from '../components/Icons';
import { SECTOR_LABEL, matchDieLabel } from '../labels';
import { useGame } from '../store';

function TokenChipView({ token, name }: { token: UniformToken; name?: string }) {
  return (
    <span className={`utoken ${token.face}`} title={name}>
      <Icon name={token.face} size={11} />
      {token.number ?? '∅'}
      {name && <span className="utoken-name">{name}</span>}
    </span>
  );
}

function Waiting({ done }: { done: Record<string, boolean> }) {
  const { view } = useGame();
  return (
    <span className="waiting">
      {view.seats.map((id) => (
        <span key={id} className={`tag${done[id] ? ' done' : ''}`}>{view.players[id]!.name}{done[id] ? ' ✓' : ''}</span>
      ))}
    </span>
  );
}

export function FridayPrepareScreen() {
  const { view, me, act } = useGame();
  const [tacticCardId, setTacticCardId] = useState(view.self.tacticCards[0] ?? '');
  const [formationIndex, setFormationIndex] = useState(0);
  const [played, setPlayed] = useState<string[]>([]);
  const [placements, setPlacements] = useState<Record<string, Sector>>({});
  const [stands, setStands] = useState(0);
  const [activations, setActivations] = useState<Record<string, boolean>>({});

  const tactic = cards.tactic(tacticCardId || view.self.tacticCards[0]!);
  const formation = tactic.formations[formationIndex] ?? tactic.formations[0]!;
  const need = useMemo(() => sectorCounts(formation), [formation]);
  const field = useMemo(() => previewField(me.uniforms, played), [me.uniforms, played]);
  const issues = validatePlacements(field, me.roster, played, formation, placements);
  const nameOf = (instanceId?: string) => (instanceId ? cards.player(me.roster.find((r) => r.instanceId === instanceId)?.cardId ?? '').name : undefined);

  // 출전 선수·포메이션·필드 구성이 실제로 바뀔 때만 자동 배치 (서버 브로드캐스트마다 수동 배치를 덮어쓰지 않도록)
  const layoutKey = `${field.map((t) => t.id).join(',')}|${played.join(',')}|${formation.defenders}-${formation.midfielders}-${formation.forwards}`;
  useEffect(() => {
    setPlacements(autoPlace(field, me.roster, played, formation));
  }, [layoutKey]);

  if (view.phase.kind !== 'friday.prepare') return null;
  const submitted = view.phase.submitted[view.me];
  const submittedMap = view.phase.submitted;

  const usedNumbers = new Set(played.map((id) => activeSide(me.roster.find((r) => r.instanceId === id)!).number).filter((n) => n !== undefined));
  const togglePlayer = (instanceId: string) => setPlayed((p) => (p.includes(instanceId) ? p.filter((x) => x !== instanceId) : [...p, instanceId]));

  const cost: Partial<Resources> = { stamina: played.length, fandom: stands };
  const activationMap: Record<string, Partial<Resources>> = {};
  for (const id of played) {
    if (!activations[id]) continue;
    const effect = activeSide(me.roster.find((r) => r.instanceId === id)!).effect;
    if (!effect) continue;
    activationMap[id] = effect.cost;
    for (const r of RESOURCES) cost[r] = (cost[r] ?? 0) + (effect.cost[r] ?? 0);
  }
  const affordable = RESOURCES.every((r) => (cost[r] ?? 0) <= me.resources[r]);
  const canSubmit = !submitted && issues.length === 0 && affordable && tacticCardId;

  const submit = () =>
    act({
      type: 'submitLineup',
      submission: { tacticCardId, formationIndex, players: played, placements, fandomInStands: stands, activations: activationMap },
    });

  return (
    <section className="panel phase-panel mine">
      <div className="panel-head">
        <h2>경기 준비</h2>
        <Waiting done={submittedMap} />
      </div>
      {submitted ? (
        <p className="muted">라인업을 제출했습니다. 다른 참가자를 기다리는 중</p>
      ) : (
        <div className="stack">
          <div className="step">
            <h3>상대</h3>
            {me.nextOpponent && <div className="cards"><OpponentCardView cardId={me.nextOpponent} /></div>}
          </div>

          <div className="step">
            <h3>전술</h3>
            <div className="cards">
              {view.self.tacticCards.map((id) => (
                <TacticCardView key={id} cardId={id} compact selected={id === tacticCardId} onClick={() => { setTacticCardId(id); setFormationIndex(0); }} />
              ))}
            </div>
            {tacticCardId && cards.tactic(tacticCardId).formations.length > 1 && (
              <div className="row">
                {cards.tactic(tacticCardId).formations.map((f, i) => (
                  <button key={i} className={i === formationIndex ? 'active' : ''} onClick={() => setFormationIndex(i)}>
                    {f.defenders}-{f.midfielders}-{f.forwards}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="step">
            <h3>출전 선수 <span className="muted">선수마다 <Icon name="stamina" size={12} />1 · 부상·출장정지·같은 등번호는 불가</span></h3>
            <div className="cards">
              {me.roster.map((r) => {
                const side = activeSide(r);
                const blocked = r.tokens.injury > 0 || r.tokens.suspension > 0 || (side.number !== undefined && usedNumbers.has(side.number) && !played.includes(r.instanceId));
                return (
                  <PlayerCardView
                    key={r.instanceId}
                    cardId={r.cardId}
                    instance={r}
                    selected={played.includes(r.instanceId)}
                    onClick={blocked ? undefined : () => togglePlayer(r.instanceId)}
                    footer={
                      played.includes(r.instanceId) && side.effect && !side.effect.mandatory ? (
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

          <div className="step">
            <h3>
              배치 <span className="formation">{formation.defenders}-{formation.midfielders}-{formation.forwards}</span>
              <button className="ghost small" onClick={() => setPlacements(autoPlace(field, me.roster, played, formation))}>자동 배치</button>
            </h3>
            <div className="pitch">
              {SECTORS.map((s) => (
                <div key={s} className={`sector ${s}${field.filter((t) => placements[t.id] === s).length === need[s] ? ' ok' : ''}`}>
                  <div className="sector-title">{SECTOR_LABEL[s]} <span>{field.filter((t) => placements[t.id] === s).length}/{need[s]}</span></div>
                  {field.filter((t) => placements[t.id] === s).map((t) => (
                    <TokenChipView key={t.id} token={t} name={played.includes(t.cardInstanceId ?? '') ? nameOf(t.cardInstanceId) : undefined} />
                  ))}
                </div>
              ))}
            </div>
            <div className="token-list">
              {field.map((t) => (
                <label key={t.id} className="row small">
                  <TokenChipView token={t} name={played.includes(t.cardInstanceId ?? '') ? nameOf(t.cardInstanceId) : undefined} />
                  <select value={placements[t.id] ?? ''} onChange={(e) => setPlacements((p) => ({ ...p, [t.id]: e.target.value as Sector }))}>
                    <option value="">—</option>
                    {SECTORS.map((s) => (
                      <option key={s} value={s}>{SECTOR_LABEL[s]}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {issues.length > 0 && <p className="error small">{issues.join(' · ')}</p>}
          </div>

          <div className="step">
            <h3>관중석 <span className="muted">{standsCount(me)}석 · 놓은 <Icon name="fandom" size={12} />만큼 경기 후 <Icon name="money" size={12} /></span></h3>
            <input type="number" min={0} max={Math.min(standsCount(me), me.resources.fandom)} value={stands} onChange={(e) => setStands(Number(e.target.value))} />
          </div>

          <div className="submit-row">
            <span className="chips">
              비용 {RESOURCES.filter((r) => (cost[r] ?? 0) > 0).map((r) => <ResourceChip key={r} resource={r} amount={cost[r]!} />)}
              {!affordable && <span className="error">자원 부족</span>}
            </span>
            <button className="primary" disabled={!canSubmit} onClick={submit}>라인업 제출</button>
          </div>
        </div>
      )}
    </section>
  );
}

export function FridayAftermathScreen() {
  const { view, me, act } = useGame();
  if (view.phase.kind !== 'friday.aftermath') return null;
  const m = view.phase.matches[view.me]!;
  const matches = view.phase.matches;
  const opponent = cards.opponent(m.opponentCardId);
  const outcomeLabel = { win: '승리', draw: '무승부', loss: '패배' }[m.report.outcome];
  return (
    <section className="panel phase-panel mine">
      <div className="panel-head">
        <h2>경기 결과</h2>
        <span className="waiting">
          {view.seats.map((id) => {
            const x = matches[id]!;
            return (
              <span key={id} className={`tag${x.decided ? ' done' : ''}`}>
                {view.players[id]!.name} {x.report.myGoals}:{x.report.theirGoals}
              </span>
            );
          })}
        </span>
      </div>
      <div className="two-col">
        <div className="stack">
          <div className="scoreline">
            <span className="team">{me.name}</span>
            <span className={`score ${m.report.outcome}`}>{m.report.myGoals} : {m.report.theirGoals}</span>
            <span className="team">{opponent.teamName}</span>
            <span className={`outcome ${m.report.outcome}`}>{outcomeLabel}</span>
          </div>
          <table className="report">
            <tbody>
              {m.report.sectors.map((s, i) => (
                <tr key={i}>
                  <td>{SECTOR_LABEL[SECTOR_PAIRS[i]![0]]}</td>
                  <td className="num">{s.myGoals} : {s.theirGoals}</td>
                  <td className="muted">{SECTOR_LABEL[SECTOR_PAIRS[i]![1]]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">승리 +3칸, 무승부 양 팀 +1칸, 패배 상대 +3칸. 관중석의 팬덤은 돈이 됐습니다.</p>
        </div>
        <OpponentCardView cardId={m.opponentCardId} revealed />
      </div>
      <div className="step">
        <h3>경기 영향 주사위 <span className="muted">{outcomeLabel} 열</span></h3>
        <table className="die-table">
          <tbody>
            {[6, 5, 4, 3, 2, 1].map((face) => (
              <tr key={face} className={m.roll === face ? 'hit' : ''}>
                <td className="face">{face}</td>
                <td>{matchDieLabel(m.report.outcome, face)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {m.decided ? (
          <p className="muted">처리 완료. 다른 참가자를 기다리는 중</p>
        ) : m.roll === null ? (
          <p className="hint"><Icon name="die" size={14} /> 오른쪽 위 주사위를 굴리세요.</p>
        ) : (
          <div className="row">
            <button className="primary" onClick={() => act({ type: 'acceptMatchRoll' })}>적용: {matchDieLabel(m.report.outcome, m.roll)}</button>
            <span className="muted small">팬덤 1개로 다시 굴릴 수 있습니다</span>
          </div>
        )}
      </div>
    </section>
  );
}
