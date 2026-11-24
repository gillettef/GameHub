import type { PlayerId } from '@server/engine/state';
import { PlayerCrest } from './Crest';
import { seatColor } from './Shell';
import { useView } from '../store';

// 턴제 단계(이사회·경기 준비·경기 결과)의 차례 표시: 순서와 현재 참가자. 현재 참가자가 바뀌면 잠깐 반짝인다
export function TurnBanner({ current, done }: { current: PlayerId; done?: Record<PlayerId, boolean> }) {
  const { view, session } = useView();
  const start = view.seats.indexOf(view.firstPlayer);
  const order = view.seats.map((_, i) => view.seats[(start + i) % view.seats.length]!);
  const mine = session?.playerId === current;
  return (
    <div key={current} className={`turn-banner${mine ? ' mine' : ''}`} aria-live="polite">
      <span className="turn-now" style={{ '--seat': seatColor(view, current) } as React.CSSProperties}>
        <span className="turn-dot" />
        <PlayerCrest id={current} name={view.players[current]!.name} color={seatColor(view, current)} size={22} />
        <b>{view.players[current]!.name}</b>의 차례{mine && ' · 나'}
      </span>
      <span className="turn-order">
        {order.map((id) => (
          <span key={id} className={`tag${id === current ? ' now' : ''}${done?.[id] ? ' done' : ''}`} style={{ '--seat': seatColor(view, id) } as React.CSSProperties}>
            {view.players[id]!.name}
            {done?.[id] ? ' ✓' : ''}
          </span>
        ))}
      </span>
    </div>
  );
}
