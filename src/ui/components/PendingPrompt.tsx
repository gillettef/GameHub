// 내게 온 대기 결정(퀘스트 보상·유도·공존·후원 계약)
import { useState, type ReactNode } from 'react';
import { QUEST_DEFS } from '../../core/data/quests';
import { PATRON_DEFS } from '../../core/data/patrons';
import { PATRON_LIMIT } from '../../core/data/constants';
import { defenseValue } from '../../core/engine/derive';
import { useGame } from '../useGame';
import { condText, modsText, optionText, questSummary } from '../describe';
import { CardArt } from './CardArt';
import type { IconName } from './Icon';
import styles from './PendingPrompt.module.css';

export function PendingPrompt() {
  const { game, me, act } = useGame();
  const [peek, setPeek] = useState(false);
  const pd = game.pending[0];
  if (!pd || pd.player !== me) return null;
  const p = game.players[me];
  const choose = (choice: number) => act({ type: 'respond', choice });

  let title = '';
  let body: ReactNode = null;
  let options: { label: string; choice: number; tone?: string }[] = [];
  let art: { id: string; icon: IconName } | null = null;

  switch (pd.kind) {
    case 'questReward': {
      const q = QUEST_DEFS[pd.questId];
      title = `「${q.name}」 보상 선택`;
      art = { id: q.id, icon: 'quest' };
      body = <p>{questSummary(q)}</p>;
      if (q.kind === 'judge' || q.kind === 'contest') options = q.options.map((o, i) => ({ label: optionText(o), choice: i, tone: o.doctrine }));
      break;
    }
    case 'redirect': {
      const q = QUEST_DEFS[pd.questId];
      title = `위협 「${q.name}」 — 유도할까요?`;
      art = { id: q.id, icon: 'threat' };
      body = (
        <p>
          {questSummary(q)}
          <br />내 방어값 {defenseValue(p)}. 공생 점수 1을 내고 다른 플레이어에게 넘길 수 있습니다.
        </p>
      );
      options = [{ label: '직접 맞선다', choice: 0 }, ...pd.targets.map((t, i) => ({ label: `${game.players[t].name}에게 유도 (방어 ${defenseValue(game.players[t])})`, choice: i + 1 }))];
      break;
    }
    case 'coexist': {
      const q = QUEST_DEFS[pd.questId];
      title = `「${q.name}」을 막았습니다`;
      art = { id: q.id, icon: 'threat' };
      body = <p>처치하면 보상을 받고, 공존하면 다음 내 생산까지 건강 −1 대신 공생 점수 +2·식량 +2(공생 단계 3이면 2배)를 받습니다.</p>;
      options = [
        { label: '처치', choice: 0 },
        { label: '공존', choice: 1, tone: 'symbiont' },
      ];
      break;
    }
    case 'patron': {
      const d = PATRON_DEFS[pd.patronId];
      title = `후원 제안 「${d.name}」`;
      art = { id: d.id, icon: 'patron' };
      body = (
        <p>
          {modsText(d.mods)} · 본국 요구: {condText([d.demand])} · {d.points}점
          <br />
          시대가 바뀔 때마다 요구를 검사해 충족하면 문화 +시대×2, 못 하면 문화 −3.
        </p>
      );
      options = [{ label: '거절', choice: 0 }];
      if (p.patrons.length < PATRON_LIMIT) options.unshift({ label: '계약 체결', choice: 1 });
      else p.patrons.forEach((id, i) => options.unshift({ label: `「${PATRON_DEFS[id].name}」 해지하고 체결`, choice: 2 + i }));
      break;
    }
  }

  if (peek)
    return (
      <button className={styles.collapsed} onClick={() => setPeek(false)}>
        결정하기: {title}
      </button>
    );
  return (
    <div className={styles.backdrop}>
      <section className={styles.box} role="dialog" aria-modal="true">
        <h3>{title}</h3>
        {art && <CardArt id={art.id} icon={art.icon} className={styles.banner} />}
        {body}
        <div className={styles.options}>
          {options.map((o) => (
            <button key={o.choice} onClick={() => choose(o.choice)} style={o.tone ? { borderColor: `var(--${o.tone})`, color: `var(--${o.tone})` } : undefined}>
              {o.label}
            </button>
          ))}
        </div>
        <button className={styles.peek} onClick={() => setPeek(true)}>
          보드 먼저 보기
        </button>
      </section>
    </div>
  );
}
