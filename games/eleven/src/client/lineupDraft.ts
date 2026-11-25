import { activeSide, cards } from '../engine/cards';
import { standsCount } from '../engine/friday';
import { autoPlace, eligiblePlayers, previewField, validatePlacements } from '../engine/lineup';
import { lineupStaminaCost } from '../engine/traits';
import type { PlayerPublicView } from '../engine/view';
import type { Region } from '../engine/types';

// 경기 준비 초안: 짜는 중인 라인업을 localStorage 에 두어 (1) 새로고침·대기 중에도 남고 (2) 다음 주에는 지난주 라인업을
// 기본값으로 쓴다(사용자 요청, 2026-09). 서버에는 제출할 때만 보낸다. 저장소를 못 쓰는 환경이면 그냥 매번 새로 짠다.

const KEY = 'eleven:lineup';

export interface LineupDraft {
  tacticCardId: string;
  formationIndex: number;
  played: string[];
  placements: Record<string, Region>;
  activations: Record<string, boolean>;
  stands: number;
  step: number;
}
interface Stored extends LineupDraft {
  game: string; // 판 id + 참가자 — 다른 판의 초안은 버린다
  week: number;
}

type Me = PlayerPublicView;

export function saveDraft(game: string, week: number, draft: LineupDraft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ game, week, ...draft } satisfies Stored));
  } catch {
    /* 저장 실패는 무시 */
  }
}

// 같은 방에서 '다시 하기'로 새 판을 시작하면 판 id(방 코드)가 같다 — 지금보다 뒤 주차의 초안은 이전 판 것이므로 버린다
function load(game: string, week: number): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    const stored = raw ? (JSON.parse(raw) as Stored) : null;
    return stored && stored.game === game && stored.week <= week ? stored : null;
  } catch {
    return null;
  }
}

// 체력이 닿는 만큼 출전 가능한 선수를 앞에서부터 고른다 (첫 주 기본값)
function affordablePlayers(me: Me): string[] {
  const chosen: string[] = [];
  for (const id of eligiblePlayers(me)) {
    const next = [...chosen, id];
    if (lineupStaminaCost(me, me.roster.filter((r) => next.includes(r.instanceId))) > me.resources.stamina) break;
    chosen.push(id);
  }
  return chosen;
}

// 저장된 초안(같은 주면 그대로, 지난주 것이면 기본값으로)을 지금 상태에 맞게 다듬는다:
// 없어진 전술 카드·선수, 부상/출장정지, 등번호 중복을 걸러 내고, 배치가 더는 맞지 않으면 자동 배치로 바꾼다
export function initialDraft(game: string, week: number, me: Me, tacticHand: string[]): LineupDraft {
  const stored = load(game, week);
  const sameWeek = stored?.week === week;
  const tacticCardId = stored && tacticHand.includes(stored.tacticCardId) ? stored.tacticCardId : (tacticHand[0] ?? '');
  const formations = tacticCardId ? cards.tactic(tacticCardId).formations : [];
  const formationIndex = stored && tacticCardId === stored.tacticCardId && stored.formationIndex < formations.length ? stored.formationIndex : 0;

  let played: string[];
  if (stored) {
    const numbers = new Set<number>();
    let keeper = false; // 골키퍼는 1명만
    played = stored.played.filter((id) => {
      const inst = me.roster.find((r) => r.instanceId === id);
      if (!inst || inst.tokens.injury > 0 || inst.tokens.suspension > 0) return false;
      const n = activeSide(inst).number;
      if (n !== undefined && numbers.has(n)) return false;
      if (n !== undefined) numbers.add(n);
      if (activeSide(inst).goalkeeper) {
        if (keeper) return false;
        keeper = true;
      }
      return true;
    });
  } else played = affordablePlayers(me);

  const formation = formations[formationIndex];
  const field = previewField(me, played);
  let placements: Record<string, Region> = {};
  if (formation) {
    const kept = stored?.placements ?? {};
    placements = stored && validatePlacements(field, me.roster, played, formation, kept).length === 0 ? kept : autoPlace(field, me.roster, played, formation);
  }

  const activations = Object.fromEntries(Object.entries(stored?.activations ?? {}).filter(([id, on]) => on && played.includes(id)));
  // 관중석은 넣을 수 있는 최대치가 기본 — 잊지 않게 (test_insight C2). 재굴림용으로 남기려면 줄인다
  const standsMax = Math.min(standsCount(me), me.resources.fandom);
  const stands = sameWeek && stored ? Math.min(stored.stands, standsMax) : standsMax;
  return { tacticCardId, formationIndex, played, placements, activations, stands, step: sameWeek && stored ? stored.step : 0 };
}
