// 처음 화면: 공통 HomeScreen(한 기기·온라인, 인원·자리) 위에 워드마크·이어 하기·상대할 부를 얹는다
import type { SeatInfo } from '@gamehub/net';
import { Button, HomeScreen as CommonHome } from '@gamehub/ui';
import { useState } from 'react';
import { MAX_SEATS } from '../def';
import type { Division } from '../engine/types';

const DIVISION_KEY = 'eleven:division';

const DIVISIONS: { value: Division; label: string; hint: string }[] = [
  { value: 3, label: '3부', hint: '쉬움' },
  { value: 2, label: '2부', hint: '보통' },
  { value: 1, label: '1부', hint: '어려움' },
];

function loadDivision(): Division {
  try {
    const v = Number(localStorage.getItem(DIVISION_KEY));
    return v === 1 || v === 2 ? v : 3;
  } catch {
    return 3;
  }
}

interface Props {
  invited: string | null;
  error: string | null;
  connecting: boolean;
  canContinue: boolean;
  onContinue(): void;
  onLocal(seats: SeatInfo[], division: Division): void;
  onCreate(name: string, seats: number, bots: number[], division: Division): void;
  onJoin(code: string, name: string): void;
  onWatch(code: string): void;
}

export function HomeScreen(p: Props) {
  const [division, setDivisionRaw] = useState<Division>(loadDivision);
  const setDivision = (d: Division) => {
    setDivisionRaw(d);
    try {
      localStorage.setItem(DIVISION_KEY, String(d));
    } catch {
      // 저장할 수 없으면 이번 실행 동안만
    }
  };
  return (
    <CommonHome
      slug="eleven"
      title="ELEVEN"
      minSeats={1}
      maxSeats={MAX_SEATS}
      bots
      invited={p.invited}
      error={p.error}
      connecting={p.connecting}
      hero={
        <div className="mt-1 mb-1">
          <h1 className="m-0 font-[family-name:var(--font-display)] text-[34px] leading-tight font-bold tracking-[0.04em]">ELEVEN</h1>
          <p className="mt-1 mb-0 text-muted">축구 구단 매니지먼트 보드게임 · 6주 시즌 동안 구단을 키워 승점을 겨룹니다.</p>
        </div>
      }
      top={
        p.canContinue ? (
          <Button tone="primary" onClick={p.onContinue}>
            이어 하기
          </Button>
        ) : undefined
      }
      setup={
        <div>
          <span className="mb-1 block text-sm text-muted">상대할 부 · 차례 순서는 시작할 때 무작위</span>
          <div className="flex gap-1.5" role="radiogroup" aria-label="상대할 부">
            {DIVISIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                role="radio"
                aria-checked={division === d.value}
                className={`flex min-h-12 flex-1 flex-col items-center justify-center rounded-lg border-2 bg-surface ${division === d.value ? 'border-primary font-bold' : 'border-transparent'}`}
                onClick={() => setDivision(d.value)}
              >
                <span>{d.label}</span>
                <span className="text-xs text-muted">{d.hint}</span>
              </button>
            ))}
          </div>
        </div>
      }
      onLocal={(seats) => p.onLocal(seats, division)}
      onCreate={(name, seats, bots) => p.onCreate(name, seats, bots, division)}
      onJoin={p.onJoin}
      onWatch={p.onWatch}
    />
  );
}
