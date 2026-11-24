import { activeSide, cards, effectiveSkill } from '@server/engine/cards';
import { SECTOR_PAIRS, regionSector, resolveMatch } from '@server/engine/match';
import type { Slot, TeamSide } from '@server/engine/match';
import type { PlayerInstance, UniformToken } from '@server/engine/state';
import { traitCount } from '@server/engine/traits';
import type { Region, Sector } from '@server/engine/types';
import type { PlayerPublicView } from '@server/engine/view';
import { SECTOR_LABEL } from '../labels';
import { Icon } from './Icons';
import { playedInstance } from './Lineup';

// 경기 준비 '배치' 스텝: 구획별로 내 공격·수비 역량을 모아 보여 준다. 판정은 결정적(주사위 없음)이라,
// 상대 팀 카드를 미리 봤으면(scouted) 엔진의 resolveMatch 로 구획별 예상 득실까지 계산한다 — 효과·전술 카드는 빼고 계산한 값.
// 미리 보지 않았으면 상대 배치는 경기 직전에야 공개되므로 내 쪽만 보인다

function mySide(me: PlayerPublicView, field: UniformToken[], played: string[], placements: Record<string, Region>): TeamSide {
  const sectors: Record<Sector, Slot[]> = { LW: [], CB: [], CM: [], CF: [], RW: [] };
  for (const t of field) {
    const region = placements[t.id];
    if (!region) continue;
    const inst = playedInstance(me.roster, played, t);
    sectors[regionSector(region)].push({ id: t.id, role: t.face, skill: inst ? effectiveSkill(inst) : 1 });
  }
  const gk: PlayerInstance | undefined = me.roster.find((r) => played.includes(r.instanceId) && activeSide(r).goalkeeper);
  const base = gk ? { skill: effectiveSkill(gk), saves: activeSide(gk).goalkeeper!.saves } : { skill: 1, saves: 1 };
  return { sectors, goalkeeper: { ...base, saves: base.saves + traitCount(me, 'extraSaves') } };
}

// 엔진 friday.ts opponentSide 와 같은 구성
function theirSide(cardId: string): TeamSide {
  const card = cards.opponent(cardId);
  const sectors: Record<Sector, Slot[]> = { LW: [], CB: [], CM: [], CF: [], RW: [] };
  for (const s of Object.keys(sectors) as Sector[]) sectors[s] = card.sectors[s].map((slot, i) => ({ id: `${card.id}:${s}${i}`, ...slot }));
  return { sectors, goalkeeper: card.goalkeeper };
}

const skills = (slots: Slot[], role: 'attack' | 'defense') => slots.filter((s) => s.role === role).map((s) => s.skill);
const list = (xs: number[]) => (xs.length > 0 ? xs.join('·') : '—');

export function SectorPreview({ me, field, played, placements }: { me: PlayerPublicView; field: UniformToken[]; played: string[]; placements: Record<string, Region> }) {
  const mine = mySide(me, field, played, placements);
  const opponentId = me.nextOpponent;
  const revealed = !!opponentId && me.scouted;
  const theirs = revealed ? theirSide(opponentId) : null;
  const report = theirs ? resolveMatch(mine, theirs) : null;
  return (
    <div className="sector-preview">
      <table className="report sector-table">
        <thead>
          <tr>
            <th>구획</th>
            <th><Icon name="attack" size={12} />내 공격</th>
            <th><Icon name="defense" size={12} />내 수비</th>
            {theirs && <th>상대 수비 / 공격</th>}
            {report && <th className="num">예상</th>}
          </tr>
        </thead>
        <tbody>
          {SECTOR_PAIRS.map(([my, their], i) => {
            const s = report?.sectors[i];
            return (
              <tr key={my}>
                <td>{SECTOR_LABEL[my]}</td>
                <td className="num">{list(skills(mine.sectors[my], 'attack'))}</td>
                <td className="num">{list(skills(mine.sectors[my], 'defense'))}</td>
                {theirs && <td className="num">{list(skills(theirs.sectors[their], 'defense'))} / {list(skills(theirs.sectors[their], 'attack'))}</td>}
                {s && <td className={`num ${s.myGoals > s.theirGoals ? 'good' : s.myGoals < s.theirGoals ? 'bad' : ''}`}>{s.myGoals} : {s.theirGoals}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">
        {report
          ? <>미리 본 상대 카드로 계산한 예상 <b>{report.myGoals} : {report.theirGoals}</b> (골키퍼 {mine.goalkeeper.skill}·선방 {mine.goalkeeper.saves} 포함, 선수·전술 효과는 빼고 계산). 공격 역량이 짝지은 수비보다 커야 슛이 뚫립니다.</>
          : '숫자는 구획별 역량. 공격 역량이 상대 수비보다 커야 슛이 뚫립니다. 상대 배치는 경기 직전에 공개됩니다(카드 효과로 미리 보면 여기서 예상 득실까지 계산).'}
      </p>
    </div>
  );
}
