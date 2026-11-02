import { CAP, FULL_HOLES_TO_END, HOLE_COUNT, HOLE_LABELS, HOLE_NAMES, PLAYER_NAMES } from '../core/constants';
import { countColor, fullCount, holeOwner, isFull, nextStop } from '../core/rules';
import type { GameState, Player } from '../core/types';
import type { View } from '../game/controller';
import { h, restartAnimation, svg } from './dom';
import { busGlyph } from './icons';

/** 권역 i의 보드 내 위치(%) — 맨 위 A부터 시계 방향 */
const RADIUS = 35;
const angleOf = (i: number) => -90 + 60 * i;
export function holePos(i: number): [number, number] {
  const a = (angleOf(i) * Math.PI) / 180;
  return [50 + RADIUS * Math.cos(a), 50 + RADIUS * Math.sin(a)];
}

function ringSvg(): SVGSVGElement {
  const root = svg('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', class: 'ring' }, [
    svg('circle', { cx: 50, cy: 50, r: RADIUS, class: 'ring-road' }),
    svg('circle', { cx: 50, cy: 50, r: RADIUS, class: 'ring-line' }),
  ]);
  // 권역 사이 화살표 (시계 방향)
  for (let k = 0; k < HOLE_COUNT; k++) {
    const t = -60 + 60 * k;
    const a = (t * Math.PI) / 180;
    root.append(
      svg('g', { transform: `translate(${50 + RADIUS * Math.cos(a)} ${50 + RADIUS * Math.sin(a)}) rotate(${t + 180})` }, [
        svg('path', { d: 'M0,-2.4 L1.9,1.6 L-1.9,1.6Z', class: 'ring-arrow' }),
      ]),
    );
  }
  return root;
}

/** 포화 게이지: 4칸 원호 */
function gaugeSvg(): { root: SVGSVGElement; segs: SVGPathElement[]; num: SVGTextElement } {
  const segs: SVGPathElement[] = [];
  const n = FULL_HOLES_TO_END;
  const r = 26;
  const gap = 6; // 도(degree)
  for (let k = 0; k < n; k++) {
    const a0 = ((-90 + (360 / n) * k + gap / 2) * Math.PI) / 180;
    const a1 = ((-90 + (360 / n) * (k + 1) - gap / 2) * Math.PI) / 180;
    const d = `M${32 + r * Math.cos(a0)} ${32 + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${32 + r * Math.cos(a1)} ${32 + r * Math.sin(a1)}`;
    segs.push(svg('path', { d, class: 'gauge-seg' }));
  }
  const num = svg('text', { x: 32, y: 38.5, 'text-anchor': 'middle', class: 'gauge-num' });
  const root = svg('svg', { viewBox: '0 0 64 64', class: 'gauge', 'aria-hidden': 'true' }, [...segs, num]);
  return { root, segs, num };
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
  private centerIdle: HTMLElement;
  private centerBus: HTMLElement;
  private gauge: ReturnType<typeof gaugeSvg>;
  private gaugeLeft: HTMLElement;
  private busTotal: HTMLElement;
  private busMix: [Text, Text];

  constructor(handlers: BoardHandlers) {
    this.busCount = h('span', { class: 'bus-count disp' });
    this.busIcon = h('span', { class: 'bus-icon' }, [busGlyph(), this.busCount]);
    this.orbit = h('div', { class: 'bus-orbit', attrs: { 'aria-hidden': 'true' } }, [this.busIcon]);

    this.gauge = gaugeSvg();
    this.gaugeLeft = h('span');
    this.centerIdle = h('div', { class: 'board-center', attrs: { 'aria-hidden': 'true' } }, [
      this.gauge.root,
      h('span', { class: 'center-label', text: '포화 권역' }),
      this.gaugeLeft,
    ]);
    this.busTotal = h('span', { class: 'center-big disp' });
    this.busMix = [document.createTextNode(''), document.createTextNode('')];
    this.centerBus = h('div', { class: 'board-center', attrs: { 'aria-hidden': 'true' } }, [
      h('span', { class: 'center-label', text: '버스 탑승' }),
      this.busTotal,
      h('span', { class: 'center-mix' }, [
        h('span', { class: 'mark m0' }),
        this.busMix[0],
        h('span', { class: 'mark m1' }),
        this.busMix[1],
      ]),
    ]);
    this.el = h('div', { class: 'board', attrs: { role: 'group', 'aria-label': '권역 보드' } }, [
      ringSvg(),
      this.centerIdle,
      this.centerBus,
    ]);

    for (let i = 0; i < HOLE_COUNT; i++) {
      const lead = h('span', { class: 'lead' });
      const slots = Array.from({ length: CAP[i] }, () => h('span', { class: 'tok' }));
      const full = h('span', { class: 'full-tag disp', text: '포화', attrs: { 'aria-hidden': 'true' } });
      const [x, y] = holePos(i);
      const btn = h(
        'button',
        { class: 'hole', attrs: { type: 'button', style: `left:${x}%;top:${y}%` }, onClick: () => handlers.onHole(i) },
        [
          h('span', { class: 'ribbon', attrs: { 'aria-hidden': 'true' } }),
          h('span', { class: 'next-tag', text: '다음 정차', attrs: { 'aria-hidden': 'true' } }),
          h('span', { class: 'hole-head' }, [h('span', { class: 'hole-letter disp', text: HOLE_LABELS[i] }), HOLE_NAMES[i]]),
          h('span', { class: 'hole-sub' }, ['선거인단 ', h('b', { text: String(CAP[i]) }), lead]),
          h('span', { class: 'slots', attrs: { 'aria-hidden': 'true' } }, slots),
          full,
        ],
      );
      this.el.append(btn);
      this.holes.push({ btn, lead, slots, full });
    }
    this.el.append(this.orbit);
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
        const cls = k < g.length ? `tok t${g[k]}${k === 0 ? ' flag' : ''}` : 'tok';
        if (el.className !== cls) el.className = cls;
        const t = k === 0 && g.length ? '⚑' : '';
        if (el.textContent !== t) el.textContent = t;
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

    // 중앙: 평소엔 포화 게이지, 유세 중엔 버스 탑승 현황
    const fc = fullCount(s);
    this.gauge.segs.forEach((p, k) => p.classList.toggle('on', k < fc));
    this.gauge.num.textContent = `${Math.min(fc, FULL_HOLES_TO_END)}/${FULL_HOLES_TO_END}`;
    const left = FULL_HOLES_TO_END - fc;
    this.gaugeLeft.textContent = s.phase === 'over' ? '선거 종료' : left > 0 ? `선거일까지 ${left}곳` : '이번 턴이 끝나면 선거일';

    this.updateBus(s);
  }

  private updateBus(s: GameState): void {
    const on = s.phase === 'sow';
    this.orbit.classList.toggle('on', on);
    this.centerIdle.hidden = on;
    this.centerBus.hidden = !on;
    if (!on) return;
    // 누적 각도로 항상 시계 방향 회전
    const target = 60 * s.busPos;
    const cur = ((this.busAngle % 360) + 360) % 360;
    this.busAngle += (target - cur + 360) % 360;
    this.orbit.style.transform = `rotate(${this.busAngle}deg)`;
    this.busIcon.style.transform = `rotate(${-this.busAngle}deg)`;
    this.busCount.textContent = String(s.bus.length);
    const blue = countColor(s.bus, 0);
    this.busTotal.textContent = `${s.bus.length}명`;
    this.busMix[0].textContent = `${blue} `;
    this.busMix[1].textContent = `${s.bus.length - blue}`;
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
