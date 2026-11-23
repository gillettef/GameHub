// 아레나 보드. 한 게임 동안 같은 DOM 을 유지해서 로봇 이동·회전이 CSS 전환으로 움직이게 한다.
import { CORE_SPOTS, PILLARS, SIZE, STARTS } from '../core/data';
import type { GameState } from '../core/types';
import { COLORS } from './text';

export class Board {
  readonly el: HTMLElement;
  private grid: HTMLElement;
  private bots: HTMLElement[] = [];
  /** 로봇별 누적 회전 각도 (270° → 0° 를 짧은 쪽으로 돌리기 위해) */
  private angles: number[] = [];
  private cores: HTMLElement;

  constructor(n: number) {
    this.el = document.createElement('div');
    this.el.className = 'board-wrap';
    const cols = Array.from({ length: SIZE }, (_, i) => `<span>${String.fromCharCode(65 + i)}</span>`).join('');
    const rows = Array.from({ length: SIZE }, (_, i) => `<span>${i + 1}</span>`).join('');
    const cells: string[] = [];
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const pillar = PILLARS.some((p) => p.x === x && p.y === y);
        const spot = CORE_SPOTS.some((p) => p.x === x && p.y === y);
        const start = STARTS[n]!.find((p) => p.x === x && p.y === y);
        const edge = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1;
        cells.push(
          `<div class="cell${pillar ? ' pillar' : ''}${spot ? ' spot' : ''}${edge ? ' edge' : ''}" data-x="${x}" data-y="${y}">${start ? `<i class="start d${start.dir}"></i>` : ''}</div>`,
        );
      }
    this.el.innerHTML = `<div class="labels cols">${cols}</div><div class="labels rows">${rows}</div><div class="grid">${cells.join('')}<div class="cores"></div></div>`;
    this.grid = this.el.querySelector('.grid')!;
    this.cores = this.el.querySelector('.cores')!;
    for (let i = 0; i < n; i++) {
      const b = document.createElement('div');
      b.className = 'bot';
      b.style.setProperty('--c', COLORS[i]!);
      b.innerHTML = `<div class="bot-body"><svg viewBox="0 0 40 40"><path d="M20 4 L34 34 L20 27 L6 34 Z"/></svg></div>`;
      this.grid.appendChild(b);
      this.bots.push(b);
      this.angles.push(NaN);
    }
  }

  update(g: GameState, opts: { active?: number | null; target?: number | null } = {}): void {
    g.players.forEach((p, i) => {
      const b = this.bots[i]!;
      b.style.setProperty('--x', String(p.bot.x));
      b.style.setProperty('--y', String(p.bot.y));
      const want = p.bot.dir * 90;
      let a = this.angles[i]!;
      if (Number.isNaN(a)) a = want;
      else {
        let diff = (((want - a) % 360) + 360) % 360;
        if (diff > 180) diff -= 360;
        a += diff;
      }
      this.angles[i] = a;
      b.style.setProperty('--r', `${a}deg`);
      b.classList.toggle('active', opts.active === i);
      b.classList.toggle('target', opts.target === i);
    });
    this.cores.innerHTML = g.cores.map((c) => `<i class="core" style="--x:${c.x};--y:${c.y}"></i>`).join('');
  }
}
