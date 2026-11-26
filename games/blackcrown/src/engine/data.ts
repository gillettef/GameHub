/** 고정 데이터: 아이템·몬스터·직업·타일·경험치. 수치는 docs/design.md 초안 */
import type { Cat, Suit } from './hands'

export const SUIT_NAMES: Record<Suit, string> = { blade: '칼날', ward: '방패', lantern: '등불', coin: '금화' }

// ── 레벨 ──
export const MAX_LEVEL = 7
/** 레벨 n 에 필요한 누적 경험치(인덱스 = 레벨 - 1) */
export const XP_TABLE = [0, 2, 4, 7, 11, 15, 20] as const
export const BASE_HP = 12
export const HP_PER_LEVEL = 2
export const START_GOLD = 3
export const TOKENS_PER_TURN = 3

// ── 진행 ──
export const ROUNDS_PER_CHAPTER = 3
export const CHAPTERS = 3
export const FINAL_ROUNDS = 3
export const LAST_HIT_BONUS = 8

// ── 아이템 ──
export type Slot = 'weapon' | 'armor' | 'trinket' | 'consumable' | 'curse'
export type ItemId =
  | 'heroSword' | 'twinBlades' | 'warHammer' | 'longbow' | 'runeStaff' | 'dagger'
  | 'knightArmor' | 'shadowCloak' | 'thornArmor' | 'pilgrimRobe' | 'mirrorShield' | 'leather'
  | 'windBoots' | 'shiftRing' | 'lanternNecklace' | 'merchantPouch' | 'prophetEye' | 'coinCharm'
  | 'potion' | 'scroll' | 'smoke' | 'whetstone' | 'feather' | 'holyWater'
  | 'bloodMask' | 'hungryBlade' | 'deadRing' | 'blackChalice'

export interface ItemDef {
  id: ItemId
  name: string
  slot: Slot
  price: number
  light: string
  dark: string
}

const I = (id: ItemId, name: string, slot: Slot, price: number, light: string, dark = ''): ItemDef => ({ id, name, slot, price, light, dark })

export const ITEMS: Record<ItemId, ItemDef> = {
  heroSword: I('heroSword', '용사의 검', 'weapon', 5, '칼날 카드 숫자 +2', '마왕이 공격할 때 이웃 칸 전원 피해 +1'),
  twinBlades: I('twinBlades', '쌍검', 'weapon', 6, '일격으로 공격하면 2번 때림', '마왕의 일격이 2회'),
  warHammer: I('warHammer', '전쟁 망치', 'weapon', 5, '방패 카드도 피해 +1씩', '밀쳐내기가 2칸'),
  longbow: I('longbow', '장궁', 'weapon', 6, '이웃 칸 공격 가능', '마왕 공격 사거리 +1'),
  runeStaff: I('runeStaff', '룬 지팡이', 'weapon', 7, '공격할 때 카드 1장 숫자 ±1', '마왕이 카드 1장 숫자 ±1'),
  dagger: I('dagger', '단검', 'weapon', 3, '막타 골드 +2', '연합이 공격할 때마다 공격자 골드 −1'),
  knightArmor: I('knightArmor', '기사 갑옷', 'armor', 5, '받는 피해 −1', '마왕이 받는 피해 −1'),
  shadowCloak: I('shadowCloak', '그림자 망토', 'armor', 4, '제단 방문이 기록에 남지 않음', '연합이 마왕의 남은 체력을 볼 수 없음'),
  thornArmor: I('thornArmor', '가시 갑옷', 'armor', 5, '반격받을 때 몬스터에게 피해 1', '마왕을 공격하면 공격자 피해 1'),
  pilgrimRobe: I('pilgrimRobe', '순례자의 로브', 'armor', 4, '샘에서 체력 전부 회복 + 골드 1', '마왕이 라운드마다 체력 3 회복'),
  mirrorShield: I('mirrorShield', '거울 방패', 'armor', 7, '장마다 1회 반격 무효', '라운드마다 1회 연합 공격 무효'),
  leather: I('leather', '가죽옷', 'armor', 3, '숲·험한 길 이동 추가 비용 없음', '마왕 체력 +5'),
  windBoots: I('windBoots', '바람의 장화', 'trinket', 5, '차례마다 첫 이동 공짜', '마왕의 첫 이동 공짜'),
  shiftRing: I('shiftRing', '변신 반지', 'trinket', 5, '공격할 때 카드 1장 문양 바꾸기', '마왕이 카드 1장 문양 바꾸기'),
  lanternNecklace: I('lanternNecklace', '등불 목걸이', 'trinket', 4, '등불 효과 2배', '연합 회복량 −1'),
  merchantPouch: I('merchantPouch', '상인의 주머니', 'trinket', 3, '처치 골드 +1, 상점 가격 −1', '봉인 의식 가격 +2'),
  prophetEye: I('prophetEye', '예언자의 눈', 'trinket', 6, '드로우할 때 2장 보고 좋은 쪽', '마왕 드로우 +1'),
  coinCharm: I('coinCharm', '금화 부적', 'trinket', 6, '공격마다 금화 카드 1장을 명성 1로', '연합 막타 보너스 절반'),
  potion: I('potion', '물약', 'consumable', 2, '체력 4 회복'),
  scroll: I('scroll', '탐지 두루마리', 'consumable', 2, '가까운 뒤집힌 타일 2개 몰래 보기'),
  smoke: I('smoke', '연막', 'consumable', 3, '이번 차례 다음 공격의 반격 무시'),
  whetstone: I('whetstone', '숫돌', 'consumable', 3, '이번 차례 다음 공격 피해 +3'),
  feather: I('feather', '귀환의 깃털', 'consumable', 3, '가장 가까운 열린 샘으로 이동'),
  holyWater: I('holyWater', '정화수', 'consumable', 5, '그림자 −1'),
  bloodMask: I('bloodMask', '피의 가면', 'curse', 0, '손패 한도 +2 (그림자 +1)'),
  hungryBlade: I('hungryBlade', '굶주린 칼', 'curse', 0, '공격 피해 +3 (그림자 +1)'),
  deadRing: I('deadRing', '망자의 반지', 'curse', 0, '쓰러져도 골드·명성을 잃지 않음 (그림자 +1)'),
  blackChalice: I('blackChalice', '검은 성배', 'curse', 0, '차례 시작 드로우 +1 (그림자 +1)'),
}

export const EQUIPMENT: ItemId[] = (Object.keys(ITEMS) as ItemId[]).filter((k) => ['weapon', 'armor', 'trinket'].includes(ITEMS[k].slot))
export const CONSUMABLES: ItemId[] = (Object.keys(ITEMS) as ItemId[]).filter((k) => ITEMS[k].slot === 'consumable')
export const CURSES: ItemId[] = (Object.keys(ITEMS) as ItemId[]).filter((k) => ITEMS[k].slot === 'curse')
export const MAX_CONSUMABLES = 2

// ── 몬스터 ──
export type Grade = 'normal' | 'elite' | 'boss'
export type MonsterId =
  | 'slime' | 'goblin' | 'wolf' | 'vine' | 'troll' | 'forestLord'
  | 'skeleton' | 'golem' | 'wraith' | 'mimic' | 'lich'
  | 'guard' | 'beast' | 'dragon'

export interface MonsterDef {
  id: MonsterId
  name: string
  grade: Grade
  hp: number
  atk: number
  /** 이 등급 이상 족보만 피해 */
  minCat?: Cat
  /** 이 문양의 효과가 듣지 않음(칼날: 피해 보너스 없음, 방패: 반격 감소 없음) */
  resist?: Suit
  /** 이 문양 카드 1장마다 피해 +1 */
  weak?: Suit
  text: string
}

const M = (id: MonsterId, name: string, grade: Grade, hp: number, atk: number, text: string, extra: Partial<MonsterDef> = {}): MonsterDef => ({ id, name, grade, hp, atk, text, ...extra })

export const MONSTERS: Record<MonsterId, MonsterDef> = {
  slime: M('slime', '슬라임', 'normal', 3, 1, ''),
  goblin: M('goblin', '고블린', 'normal', 5, 2, '금화 카드 골드 2배'),
  wolf: M('wolf', '늑대', 'normal', 4, 3, ''),
  vine: M('vine', '덩굴 정령', 'normal', 6, 1, '칼날 저항', { resist: 'blade' }),
  troll: M('troll', '떠돌이 트롤', 'elite', 10, 3, '라운드 끝에 가장 가까운 말 쪽으로 이동'),
  forestLord: M('forestLord', '숲의 주인', 'boss', 14, 4, '쌍격 이상만 피해', { minCat: 1 }),
  skeleton: M('skeleton', '해골 기사', 'elite', 8, 3, '등불 약점', { weak: 'lantern' }),
  golem: M('golem', '골렘', 'elite', 12, 2, '일격 무효', { minCat: 1 }),
  wraith: M('wraith', '망령', 'elite', 7, 4, '삼연 이상만 피해', { minCat: 3 }),
  mimic: M('mimic', '미믹', 'elite', 6, 3, '처치하면 보물 2개'),
  lich: M('lich', '폐허의 리치', 'boss', 20, 5, '연환 이상만 피해, 라운드 끝 체력 3 회복', { minCat: 2 }),
  guard: M('guard', '마왕 근위병', 'elite', 12, 5, '방패 저항', { resist: 'ward' }),
  beast: M('beast', '그림자 짐승', 'elite', 10, 5, '막타를 치면 그림자 카드를 받을 수 있음'),
  dragon: M('dragon', '문지기 용', 'boss', 26, 6, '진군 이상만 피해, 처치하면 참여자 전원 명성 +2', { minCat: 4 }),
}

export const REWARDS: Record<Grade, { xpEach: number; xpLast: number; fame: number; gold: number }> = {
  normal: { xpEach: 1, xpLast: 2, fame: 1, gold: 2 },
  elite: { xpEach: 1, xpLast: 3, fame: 2, gold: 3 },
  boss: { xpEach: 2, xpLast: 5, fame: 5, gold: 6 },
}

// ── 보드 (육각 판 조립, docs/design.md 10절. 판 데이터는 tiles.ts) ──
export type TileKind = 'camp' | 'monster' | 'boss' | 'wander' | 'treasure' | 'shop' | 'forge' | 'spring' | 'altar' | 'forest' | 'ruin' | 'throne' | 'empty'

export const TILE_NAMES: Record<TileKind, string> = {
  camp: '야영지', monster: '몬스터', boss: '장 보스', wander: '방랑 몬스터', treasure: '보물상자', shop: '상점', forge: '대장간',
  spring: '샘', altar: '제단', forest: '숲', ruin: '폐허', throne: '옥좌', empty: '빈 땅',
}

/** 고리마다 꼭 까는 칸 타일 */
export const RING_MUST: Record<1 | 2 | 3, TileKind[]> = { 1: ['boss', 'wander'], 2: ['boss', 'forge'], 3: ['boss'] }

/** 고리(1 바깥 … 3 안쪽)별 칸 타일 묶음(꼭 까는 것 제외). 칸이 가장 많은 판 조합도 채울 만큼 들어 있다 */
export function ringBag(ring: 1 | 2 | 3, seats: number): TileKind[] {
  const rep = (k: TileKind, n: number) => Array<TileKind>(n).fill(k)
  if (ring === 1) {
    const monsters = seats <= 3 ? 6 : 8
    return [...rep('monster', monsters), ...rep('treasure', 4), ...rep('shop', 2), ...rep('spring', 2), ...rep('altar', 3), ...rep('forest', 14 - monsters)]
  }
  if (ring === 2) return [...rep('monster', 4), ...rep('treasure', 2), 'shop', 'spring', ...rep('altar', 2), ...rep('ruin', 5)]
  return [...rep('monster', 3), ...rep('treasure', 2), 'spring', 'altar']
}

export const RING_MONSTERS: Record<1 | 2 | 3, MonsterId[]> = {
  1: ['slime', 'slime', 'goblin', 'goblin', 'wolf', 'wolf', 'vine'],
  2: ['skeleton', 'golem', 'wraith', 'mimic'],
  3: ['guard', 'guard', 'beast'],
}
export const RING_BOSS: Record<1 | 2 | 3, MonsterId> = { 1: 'forestLord', 2: 'lich', 3: 'dragon' }

// ── 제단 ──
export type Blessing = 'heal' | 'xp' | 'gold' | 'fill' | 'fame' | 'token'
export const BLESSINGS: Blessing[] = ['heal', 'xp', 'gold', 'fill', 'fame', 'token']
export const BLESSING_TEXT: Record<Blessing, string> = {
  heal: '체력 5 회복', xp: '경험치 2', gold: '골드 3', fill: '손패를 한도까지', fame: '명성 1', token: '행동 토큰 1',
}
export const SHADOW_CARDS = 4
export const SHADOW_ID_BASE = 100

// ── 직업 ──
export type ClassId = 'knight' | 'mage' | 'priest' | 'rogue' | 'hunter'
export interface ClassDef {
  id: ClassId
  name: string
  suit: Suit | null
  passive: string
  active: string
  /** [3레벨 A, B], [5레벨 A, B] */
  upgrades: [[string, string], [string, string]]
  dark: string
}

export const CLASSES: Record<ClassId, ClassDef> = {
  knight: {
    id: 'knight', name: '기사', suit: 'ward',
    passive: '수호를 켜면 같은 칸 아군이 받는 피해를 대신 받음',
    active: '철벽: 내 다음 차례까지 받는 피해 0',
    upgrades: [['방패 카드 효과 2배', '반격받을 때 피해 1 되돌림'], ['철벽이 같은 칸 아군에게도', '최대 체력 +6']],
    dark: '마왕이 받는 피해 절반',
  },
  mage: {
    id: 'mage', name: '마법사', suit: 'blade',
    passive: '공격할 때 카드 1장 숫자 ±1',
    active: '운명 비틀기: 이 칸 몬스터의 공용 카드 다시 뽑기',
    upgrades: [['±1 대신 ±2', '2장에 적용'], ['운명 비틀기 장마다 2회', '칼날 카드 피해 +2씩']],
    dark: '리버를 한 번 다시 뽑음',
  },
  priest: {
    id: 'priest', name: '성직자', suit: 'lantern',
    passive: '제단에서 2장 보고 1장 고름',
    active: '축복: 같은 칸·이웃 칸 아군 손패 1장씩 보충',
    upgrades: [['등불 효과 2배', '축복에 체력 3 회복 추가'], ['정화: 장마다 1회 그림자 −1', '축복 범위 2칸']],
    dark: '연합이 회복할 때마다 마왕도 회복',
  },
  rogue: {
    id: 'rogue', name: '도적', suit: 'coin',
    passive: '대기 토큰 2개까지, 막타 골드 2배',
    active: '소매치기: 묘지 맨 위 카드를 손패로',
    upgrades: [['협공 막타 판정 숫자 +2', '상점 가격 −1'], ['소매치기 장마다 2회', '대기 토큰 3개']],
    dark: '연합의 대기 토큰과 협공 무효',
  },
  hunter: {
    id: 'hunter', name: '사냥꾼', suit: null,
    passive: '이웃 칸 몬스터도 공격',
    active: '추적: 방랑 몬스터를 원하는 열린 칸으로',
    upgrades: [['차례 시작에 이웃 타일 몰래 보기', '숲·험한 길 이동 추가 비용 없음'], ['사거리 2칸', '공격할 때 카드 1장 문양 바꾸기']],
    dark: '마왕 공격 사거리 2칸',
  },
}
export const CLASS_IDS: ClassId[] = ['knight', 'mage', 'priest', 'rogue', 'hunter']

// ── 최종전 ──
export type RitualId = 'holyWater' | 'chain' | 'lantern' | 'pierce'
export const RITUALS: Record<RitualId, { name: string; price: number; text: string }> = {
  holyWater: { name: '성수', price: 8, text: '마왕 행동 토큰 영구 −1' },
  chain: { name: '봉인 사슬', price: 6, text: '이번 라운드 마왕 이동·밀쳐내기 불가' },
  lantern: { name: '축복의 등불', price: 4, text: '연합 전원 체력 3 회복' },
  pierce: { name: '꿰뚫는 빛', price: 5, text: '다음 연합 공격 1번에 마왕의 피해 감소 무시' },
}
export const DEMON_TOKENS = 5
