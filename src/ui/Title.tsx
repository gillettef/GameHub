import { useState } from 'react';
import { CFG } from '../game/engine';
import { hasSave } from '../platform/storage';
import { Icon } from './Icon';
import { Slot } from './Slot';
import { Sheet } from './parts';
import { RulesBody } from './Rules';

interface Props {
  onNew: (aiCount: number) => void;
  /** 불러오기에 성공하면 true. 실패(버전 불일치·손상)하면 저장이 지워지고 false */
  onContinue: () => boolean;
}

/** 상대(AI) 수 선택지: 전체 인원 minPlayers~maxPlayers (사람 1명) */
const AI_OPTIONS = Array.from({ length: CFG.maxPlayers - CFG.minPlayers + 1 }, (_, i) => CFG.minPlayers - 1 + i);

export function Title({ onNew, onContinue }: Props) {
  const [ai, setAi] = useState(1);
  const [rules, setRules] = useState(false);
  const [save, setSave] = useState(hasSave);
  return (
    <div className="title">
      <Slot slot="ui/title-bg" tint="#2b2370" className="title-bg" />
      <div className="title-spark" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 0.7) % 5}s`, animationDuration: `${5 + (i % 4)}s` }} />
        ))}
      </div>
      <div className="title-main">
        <Slot slot="ui/logo" tint="#ffd54a" className="logo" fallback={<Icon name="smile" size={72} stroke={1.4} />} />
        <h1>스마일 파크</h1>
        <p>나만의 놀이공원을 키워 최고의 만족도를 얻어보세요</p>
      </div>
      <div className="title-menu">
        <div className="seg" role="group" aria-label="상대 수">
          <span className="seg-label">상대</span>
          {AI_OPTIONS.map((n) => (
            <button key={n} className={ai === n ? 'on' : ''} onClick={() => setAi(n)}>
              {n}명
            </button>
          ))}
        </div>
        <button className="btn primary wide big" onClick={() => onNew(ai)}>
          <Icon name="operate" size={22} /> 새 게임 시작
        </button>
        {save && (
          <button className="btn ghost wide" onClick={() => { if (!onContinue()) setSave(false); }}>
            <Icon name="arrow" size={18} /> 이어하기
          </button>
        )}
        <button className="btn ghost wide" onClick={() => setRules(true)}>
          <Icon name="help" size={18} /> 게임 규칙
        </button>
      </div>
      {rules && (
        <Sheet title="게임 규칙" onClose={() => setRules(false)} tall>
          <RulesBody />
        </Sheet>
      )}
    </div>
  );
}
