import { CAP, HOLE_COUNT, HOLE_LABELS, HOLE_NAMES, PLAYER_NAMES } from '../core/constants';
import { countColor, holeOwner, isFull, nextStop } from '../core/rules';
import type { GameState, Player } from '../core/types';
import type { View } from '../game/controller';
import { h, restartAnimation, svg } from './dom';

/** 권역 i의 보드 내 위치(%) — 맨 위 A부터 시계 방향 */
const RADIUS = 35;
const angleOf = (i: number) => -90 + 60 * i;
export function holePos(i: number): [number, number] {
  const a = (angleOf(i) * Math.PI) / 180;
  return [50 + RADIUS * Math.cos(a), 50 + RADIUS * Math.sin(a)];
}

function ringSvg(): SVGSVGElement {
  const root = svg('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', class: 'ring' }, [
    svg('circle', { cx: 50, cy: 50, r: RADIUS, class: 'ring-line' }),
  ]);
  // 권역 사이 화살표 (시계 방향)
  for (let k = 0; k < HOLE_COUNT; k++) {
    const t = -60 + 60 * k;
    const a = (t * Math.PI) / 180;
    root.append(
      svg('g', { transform: `translate(${50 + RADIUS * Math.cos(a)} ${50 + RADIUS * Math.sin(a)}) rotate(${t + 180})` }, [
        svg('path', { d: 'M0,-2.6 L2,1.8 L-2,1.8Z', class: 'ring-arrow' }),
      ]),
    );
  }
  return root;
}

export interface BoardHandlers {
  onHole(i: number): void;
}

interface HoleEls {
  btn: HTMLButtonElement;
  lead: HTMLElement;
  slots: HTMLElement[];
  full: HTMLElement;
}

export class Board {
  readonly el: HTMLElement;
  private holes: HoleEls[] = [];
  private orbit: HTMLElement;
  private busIcon: HTMLElement;
  private busCount: HTMLElement;
  private busAngle = 0;
  private lastPulse = -1;
  private lastHighlight = -1;

  constructor(handlers: BoardHandlers) {
    this.busCount = h('span', { class: 'bus-count' });
    this.busIcon = h('span', { class: 'bus-icon' }, ['🚌', this.busCount]);
    this.orbit = h('div', { class: 'bus-orbit', attrs: { 'aria-hidden': 'true' } }, [this.busIcon]);
    const center = h('div', { class: 'board-center', attrs: { 'aria-hidden': 'true' } }, [
      h('span', { class: 'center-emoji', text: '🗳️' }),
      h('span', { text: '시계 방향' }),
      h('span', { class: 'center-dir', text: 'A→B→C→D→E→F' }),
    ]);
    this.el = h('div', { class: 'board', attrs: { role: 'group', 'aria-label': '권역 보드' } }, [ringSvg(), center, this.orbit]);

    for (let i = 0; i < HOLE_COUNT; i++) {
      const lead = h('span', { class: 'lead' });
      const slots = Array.from({ length: CAP[i] }, () => h('span', { class: 'tok' }));
      const full = h('span', { class: 'full-tag', text: '포화' });
      const [x, y] = holePos(i);
      const btn = h(
        'button',
        { class: 'hole', attrs: { type: 'button', style: `left:${x}%;top:${y}%` }, onClick: () => handlers.onHole(i) },
        [
          h('span', { class: 'next-tag', text: '다음 ▼', attrs: { 'aria-hidden': 'true' } }),
          h('span', { class: 'hole-head' }, [h('b', { text: HOLE_LABELS[i] }), ` ${HOLE_NAMES[i]}`]),
          h('span', { class: 'hole-sub' }, [`선거인단 ${CAP[i]}`, lead]),
          h('span', { class: 'slots', attrs: { 'aria-hidden': 'true' } }, slots),
          full,
        ],
      );
      this.el.append(btn);
      this.holes.push({ btn, lead, slots, full });
    }
  }

  update(v: View, selectable: (i: number) => boolean): void {
    const s = v.state;
    const nx = s.phase === 'sow' ? nextStop(s) : -1;
    let anyCan = false;
    for (let i = 0; i < HOLE_COUNT; i++) {
      const e = this.holes[i];
      const g = s.holes[i];
      const owner = holeOwner(s, i);
      const can = selectable(i);
      anyCan ||= can;
      const full = isFull(s, i);
      e.btn.classList.toggle('can', can);
      e.btn.classList.toggle('nx', i === nx);
      e.btn.classList.toggle('is-full', full);
      e.btn.classList.toggle('lead-0', owner === 0);
      e.btn.classList.toggle('lead-1', owner === 1);
      e.btn.setAttribute('aria-disabled', String(!can));
      e.btn.setAttribute('aria-label', holeAria(s, i, i === nx));
      e.lead.className = owner === null ? 'lead' : `lead mark m${owner}`;
      e.lead.title = owner === null ? '' : `${PLAYER_NAMES[owner]} 우세`;
      e.full.hidden = !full;
      e.slots.forEach((el, k) => {
        el.className = k < g.length ? `tok t${g[k]}${k === 0 ? ' flag' : ''}` : 'tok';
        el.textContent = k === 0 && g.length ? '⚑' : '';
      });
    }

    this.el.classList.toggle('acting', anyCan);

    // 마지막 하차 표시: 위치가 바뀌거나 사라지면 지운다 (감속 모드에서는 애니메이션이 지워 주지 않음)
    if (v.highlight !== this.lastHighlight || v.pulse !== this.lastPulse) {
      this.lastHighlight = v.highlight;
      for (const e of this.holes) e.btn.classList.remove('drp');
    }
    if (v.pulse !== this.lastPulse) {
      this.lastPulse = v.pulse;
      if (v.highlight >= 0 && s.phase !== 'over') restartAnimation(this.holes[v.highlight].btn, 'drp');
    }

    this.updateBus(s);
  }

  private updateBus(s: GameState): void {
    const on = s.phase === 'sow';
    this.orbit.classList.toggle('on', on);
    this.el.classList.toggle('sowing', on);
    if (!on) return;
    // 누적 각도로 항상 시계 방향 회전
    const target = 60 * s.busPos;
    const cur = ((this.busAngle % 360) + 360) % 360;
    this.busAngle += (target - cur + 360) % 360;
    this.orbit.style.transform = `rotate(${this.busAngle}deg)`;
    this.busIcon.style.transform = `rotate(${-this.busAngle}deg)`;
    this.busCount.textContent = String(s.bus.length);
  }
}

function holeAria(s: GameState, i: number, isNext: boolean): string {
  const g = s.holes[i];
  const parts = [`${HOLE_LABELS[i]} ${HOLE_NAMES[i]}`, `선거인단 ${CAP[i]}`];
  if (!g.length) parts.push('비어 있음');
  else {
    const b = countColor(g, 0);
    parts.push(`파랑 ${b} 빨강 ${g.length - b}`, `깃발 ${PLAYER_NAMES[g[0] as Player]}`);
    const o = holeOwner(s, i);
    if (o !== null) parts.push(`${PLAYER_NAMES[o]} 우세`);
  }
  if (isFull(s, i)) parts.push('포화');
  if (isNext) parts.push('다음 정차지');
  return parts.join(', ');
}
