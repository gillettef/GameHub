import { useState } from 'react';
import { CFG, HUMAN } from '../game/engine';
import type { GameState, Player } from '../game/types';
import { Icon } from './Icon';
import { TYPE_META } from './meta';
import { GroupChip, Members, Sheet } from './parts';

/** 한 플레이어의 운영 결과 (내 것·상대 것 모두 공개) */
function PlayerReport({ game, p, mine }: { game: GameState; p: Player; mine: boolean }) {
  const r = p.report;
  if (!r) return null;
  const net = r.feeIncome + r.shopIncome + r.bonusIncome - r.upkeep;
  const gained = r.sat - r.debtSat;
  return (
    <>
      <div className="rep-stats">
        <div className="rs">
          <Icon name="ticket" size={18} />
          <b>
            {r.groups}
            <small>그룹 {r.people}명</small>
          </b>
          <span>입장</span>
        </div>
        <div className="rs">
          <Icon name="coin" size={18} />
          <b className={net >= 0 ? 'pos' : 'neg'}>
            {net >= 0 ? '+' : ''}
            {net}
          </b>
          <span>순수익</span>
        </div>
        <div className="rs">
          <Icon name="star" size={18} />
          <b className={gained >= 0 ? 'pos' : 'neg'}>{gained >= 0 ? '+' : ''}{gained}</b>
          <span>만족도</span>
        </div>
      </div>

      <div className="rep-ledger">
        <div>
          <span>입장료 ({r.people}명 × ${r.fee})</span>
          <b className="pos">+${r.feeIncome}</b>
        </div>
        {r.shopIncome > 0 && (
          <div>
            <span>상점 수익</span>
            <b className="pos">+${r.shopIncome}</b>
          </div>
        )}
        {r.bonusIncome > 0 && (
          <div>
            <span>부대시설 수익</span>
            <b className="pos">+${r.bonusIncome}</b>
          </div>
        )}
        <div>
          <span>유지비</span>
          <b className="neg">-${r.upkeep}</b>
        </div>
      </div>

      {r.places.length > 0 && (
        <>
          <h4 className="rep-h">놀이기구 배치</h4>
          <ul className="visits">
            {r.places.map((l, i) => (
              <li key={i} style={{ animationDelay: `${Math.min(i, 14) * 55}ms` }}>
                <Members g={l.group} size={13} />
                <Icon name={TYPE_META[l.facilityType].icon} size={16} />
                <span className="vn">
                  {l.facility}
                  {l.facilityType === l.group.fav && <em>취향 저격</em>}
                  {l.wear && <em className="warn">수리 토큰</em>}
                </span>
                <span className="vs">
                  <Icon name="star" size={12} />
                  {l.sat}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {r.bonusSat > 0 && (
        <div className="callout">
          <Icon name="sparkle" size={20} />
          <div>
            <b>부대시설·연구원 만족도 +{r.bonusSat}</b>
          </div>
        </div>
      )}
      {r.turnedBack.length > 0 && (
        <div className="callout warn">
          <Icon name="ticket" size={20} />
          <div>
            <b>입구에서 돌아간 그룹 {r.turnedBack.length}개</b>
            <span>입장료 ${r.fee}가 지불 한도보다 높았어요.</span>
            <div className="entrance-row">
              {r.turnedBack.map((g) => (
                <GroupChip key={g.id} g={g} enters={false} />
              ))}
            </div>
          </div>
        </div>
      )}
      {r.unplaced.length > 0 && (
        <div className="callout warn">
          <Icon name="info" size={20} />
          <div>
            <b>놀이기구를 못 탄 그룹 {r.unplaced.length}개 · 만족도 -{r.unplacedSat}</b>
            <span>{mine ? '빈 놀이기구가 없거나 정원이 모자랐어요.' : '놀이기구가 부족했어요.'}</span>
          </div>
        </div>
      )}
      {r.trashAdded > 0 && (
        <div className="callout warn">
          <Icon name="trash" size={20} />
          <div>
            <b>쓰레기 +{r.trashAdded}</b>
            <span>{game.event?.trashDelta ? `이벤트 쓰레기 ${game.event.trashDelta}개 포함. ` : ''}라운드가 끝날 때 남은 쓰레기 1개마다 만족도 -1이에요.</span>
          </div>
        </div>
      )}
      {r.debtSat > 0 && (
        <div className="callout bad">
          <Icon name="coin" size={20} />
          <div>
            <b>유지비 부족! 만족도 -{r.debtSat}</b>
            <span>모자란 $1마다 만족도 -1, 돈은 $0이 돼요.</span>
          </div>
        </div>
      )}
    </>
  );
}

export function ReportSheet({ game, onNext }: { game: GameState; onNext: () => void }) {
  const [who, setWho] = useState(HUMAN);
  const p = game.players[who];
  return (
    <Sheet title={`${game.round}라운드 운영 결과`} tall>
      {game.players.length > 1 && (
        <div className="rep-tabs" role="tablist">
          {game.players.map((x) => (
            <button key={x.id} role="tab" aria-selected={who === x.id} className={who === x.id ? 'on' : ''} onClick={() => setWho(x.id)}>
              {x.id === HUMAN ? '내 공원' : x.name}
              <small>
                {(x.report?.sat ?? 0) - (x.report?.debtSat ?? 0) >= 0 ? '+' : ''}
                {(x.report?.sat ?? 0) - (x.report?.debtSat ?? 0)}
              </small>
            </button>
          ))}
        </div>
      )}
      <PlayerReport key={who} game={game} p={p} mine={who === HUMAN} />
      <p className="muted small">수리 토큰은 그룹 인원이 정원과 같은 놀이기구에 놓여요. 관리 단계에서 ${CFG.repairCost}로 떼거나 엔지니어가 무료로 떼요.</p>
      <div className="sticky-cta">
        <button className="btn primary wide" onClick={onNext}>
          관리 단계로 <Icon name="arrow" size={18} />
        </button>
      </div>
    </Sheet>
  );
}
