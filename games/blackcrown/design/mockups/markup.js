/*
 * 목업이 쓰는 마크업 만들기 함수. React 컴포넌트를 만들 때 "이 클래스 조합이 정답"인 참고본이다.
 * (일반 스크립트. 전역 BC 하나만 만든다. 목업 HTML 이 <script src="markup.js"> 로 불러온다.)
 */
;(function () {
  const SUIT_KO = { blade: '칼날', ward: '방패', lantern: '등불', coin: '금화', shadow: '그림자' }
  const TILE_KO = {
    camp: '야영지', monster: '몬스터', boss: '장 보스', wander: '방랑 몬스터', treasure: '보물상자',
    shop: '상점', forge: '대장간', spring: '샘', altar: '제단', forest: '숲', ruins: '폐허', throne: '옥좌',
  }
  const CLASS_KO = { knight: '기사', mage: '마법사', cleric: '성직자', rogue: '도적', hunter: '사냥꾼' }

  const ico = (id, cls = '') => `<svg class="bc-ico ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`

  /** 숫자 구간 → 카드 그림 단계 (design.md 2-1) */
  const tierOf = (n) => (n <= 5 ? 'apprentice' : n <= 10 ? 'hero' : 'legend')
  const TIER_KO = { apprentice: '견습', hero: '용사', legend: '전설' }

  /**
   * 운명 카드. suit: blade|ward|lantern|coin, num 1~13. suit 'shadow' 면 그림자 카드.
   * opts: { w, lg, state: 'is-selected' 등 공백 구분 문자열 }
   */
  function card(suit, num, opts = {}) {
    const w = opts.w ? ` style="--bc-card-w:${opts.w}px"` : ''
    const state = opts.state ? ' ' + opts.state : ''
    const lg = opts.lg ? ' bc-card--lg' : ''
    if (suit === 'shadow') {
      return `<div class="bc-card bc-card--shadow bc-suit--shadow${lg}${state}"${w} role="img" aria-label="그림자 카드, 아무 문양 아무 숫자">
  <div class="bc-card__corner"><span class="bc-card__num">?</span>${ico('bc-shadow')}</div>
  <div class="bc-card__art">${ico('bc-shadow')}</div>
  <span class="bc-card__tier">와일드</span>
  <div class="bc-card__corner bc-card__corner--end"><span class="bc-card__num">?</span>${ico('bc-shadow')}</div>
</div>`
    }
    const tier = tierOf(num)
    return `<div class="bc-card bc-card--${tier} bc-suit--${suit}${lg}${state}"${w} role="img" aria-label="${SUIT_KO[suit]} ${num}">
  <div class="bc-card__corner"><span class="bc-card__num">${num}</span>${ico('bc-suit-' + suit)}</div>
  <div class="bc-card__art">${ico('bc-suit-' + suit)}</div>
  <span class="bc-card__tier">${TIER_KO[tier]}</span>
  <span class="bc-card__crown">${ico('bc-crown')}</span>
  <div class="bc-card__corner bc-card__corner--end"><span class="bc-card__num">${num}</span>${ico('bc-suit-' + suit)}</div>
</div>`
  }

  const cardback = (w) => `<div class="bc-cardback"${w ? ` style="--bc-card-w:${w}px"` : ''} role="img" aria-label="카드 뒷면">${ico('bc-crown')}</div>`

  const pawn = (seat, cls, extra = '') =>
    `<span class="bc-pawn ${extra}" style="--seat:var(--bc-seat-${seat})" title="${CLASS_KO[cls]}">${ico('bc-class-' + cls)}</span>`

  const demon = () => `<span class="bc-pawn bc-pawn--demon" title="마왕">${ico('bc-crown')}</span>`

  /** 7×7 칸의 고리: 0 바깥, 1 가운데, 2 안쪽, 3 옥좌 */
  const ringOf = (r, c) => Math.min(r, c, 6 - r, 6 - c)
  const RING_CLASS = ['', 'bc-tile--middle', 'bc-tile--inner', 'bc-tile--throne']
  const CODE = {
    C: 'camp', M: 'monster', B: 'boss', W: 'wander', T: 'treasure', S: 'shop', F: 'forge',
    P: 'spring', A: 'altar', O: 'forest', R: 'ruins', X: 'throne', H: null,
  }

  /**
   * 보드. rows: 7개 문자열(공백 구분 7칸). opened: 열린 고리 수(1~3, 4면 옥좌까지).
   * extras: { 'r,c': { state, hp, comm:[suit,num], pawns:html } }
   */
  function board(rows, opened, extras = {}, tile = 48, onlyRings = null) {
    let html = ''
    rows.forEach((row, r) => {
      row.trim().split(/\s+/).forEach((code, c) => {
        const ring = ringOf(r, c)
        if (onlyRings && !onlyRings.includes(ring)) return
        const kind = CODE[code]
        const ex = extras[`${r},${c}`] || {}
        const locked = ring >= opened ? ' is-locked' : ''
        const cls = ['bc-tile', RING_CLASS[ring], kind ? 'bc-tile--' + kind : 'bc-tile--hidden', ex.state || ''].join(' ') + locked
        const label = kind ? TILE_KO[kind] : '뒤집히지 않은 타일'
        html += `<div class="${cls.trim()}" role="gridcell" aria-label="${label}">${ico(kind ? 'bc-tile-' + kind : 'bc-tile-back')}`
        if (ex.hp != null) html += `<span class="bc-tile__hp">${ex.hp}</span>`
        if (ex.comm) html += `<span class="bc-tile__comm bc-suit--${ex.comm[0]}">${ex.comm[1]}</span>`
        if (ex.pawns) html += `<span class="bc-tile__pawns">${ex.pawns}</span>`
        html += `</div>`
      })
    })
    const n = onlyRings ? 7 - 2 * Math.min(...onlyRings) : 7
    return `<div class="bc-board" role="grid" aria-label="공용 보드" style="--bc-tile:${tile}px;grid-template-columns:repeat(${n},var(--bc-tile))">${html}</div>`
  }

  function seat(n, cls, name, stats, extra = '') {
    return `<div class="bc-seat ${extra}" style="--seat:var(--bc-seat-${n})">
  <span class="bc-seat__pawn">${pawn(n, cls)}<span class="bc-seat__lv" aria-label="레벨">${stats.lv}</span></span>
  <span class="bc-seat__name">${name}</span>
  <span class="bc-seat__stats">
    <span class="bc-stat--hp">${ico('bc-ui-hp')}${stats.hp}</span>
    <span class="bc-stat--fame">${ico('bc-ui-fame')}${stats.fame}</span>
    ${stats.prayer ? `<span class="bc-stat--prayer">${ico('bc-ui-prayer')}${stats.prayer}</span>` : ''}
  </span>
</div>`
  }

  /** 행동 토큰. lit: 남은 개수, total: 받은 개수, held: 대기 토큰 */
  function tokens(lit, total = 3, held = 0) {
    let h = ''
    for (let i = 0; i < total; i++)
      h += `<svg class="bc-token ${i < lit ? '' : 'is-spent'}" viewBox="0 0 24 24" aria-hidden="true"><use href="#${i < lit ? 'bc-ui-token' : 'bc-ui-token-spent'}"/></svg>`
    for (let i = 0; i < held; i++) h += `<svg class="bc-token is-held" viewBox="0 0 24 24" aria-hidden="true"><use href="#bc-ui-token-held"/></svg>`
    return `<div class="bc-tokens" role="img" aria-label="행동 토큰 ${lit}개 남음${held ? `, 대기 ${held}개` : ''}">${h}</div>`
  }

  /** 아이템 카드. it: { name, price, slot, icon, light, dark }, dark: true 면 어둠 면 */
  function item(it, opts = {}) {
    const w = opts.w ? ` style="--bc-item-w:${opts.w}px"` : ''
    return `<div class="bc-item ${opts.dark ? 'is-dark' : ''} ${opts.state || ''}"${w}>
  <div class="bc-item__inner">
    <div class="bc-item__face bc-item__face--light">
      <div class="bc-item__head"><span class="bc-item__name">${it.name}</span><span class="bc-item__price">${ico('bc-suit-coin')}${it.price}</span></div>
      <span class="bc-item__slot">${it.slot} · 빛 면</span>
      <div class="bc-item__art">${ico(it.icon)}</div>
      <div>
        <p class="bc-item__text" style="margin:0 0 6px">${it.light}</p>
        <div class="bc-item__peek">${ico('bc-crown')}${it.dark.replace(/<\/?b>/g, '')}</div>
      </div>
    </div>
    <div class="bc-item__face bc-item__face--dark" aria-hidden="${opts.dark ? 'false' : 'true'}">
      <div class="bc-item__head"><span class="bc-item__name">${it.name}</span>${ico('bc-crown')}</div>
      <span class="bc-item__slot">${it.slot} · 어둠 면</span>
      <div class="bc-item__art">${ico(it.icon)}</div>
      <p class="bc-item__text" style="margin:0">${it.dark}</p>
    </div>
  </div>
</div>`
  }

  window.BC = { ico, card, cardback, pawn, demon, board, seat, tokens, item, tierOf, SUIT_KO, TILE_KO, CLASS_KO }
})()
