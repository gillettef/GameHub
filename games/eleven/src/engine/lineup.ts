import { activeSide } from './cards';
import { swapBenchTokens } from './friday';
import { LINE_LABEL, regionName } from './labels';
import { lineCounts, regionColumn, regionIssues, regionLimit, regionLine, regionSector } from './match';
import type { PlayerInstance, UniformToken } from './state';
import { LINES, REGIONS } from './types';
import type { Formation, Region, Sector } from './types';
import { claimUniforms } from './uniforms';

// 경기 준비 도우미. 클라이언트 UI, 봇, 테스트가 공유한다 (순수 함수)

// 출전 가능한 선수(부상/출장정지 없음, 등번호 중복 없음, 골키퍼는 1명)를 최대 인원 안에서 고른다
export function eligiblePlayers(player: { roster: PlayerInstance[] }, max = Infinity): string[] {
  const numbers = new Set<number>();
  const chosen: string[] = [];
  let keeper = false;
  for (const inst of player.roster) {
    if (chosen.length >= max) break;
    if (inst.tokens.injury > 0 || inst.tokens.suspension > 0) continue;
    if (activeSide(inst).goalkeeper) {
      if (keeper) continue;
      keeper = true;
    }
    const n = activeSide(inst).number;
    if (n !== undefined) {
      if (numbers.has(n)) continue;
      numbers.add(n);
    }
    chosen.push(inst.instanceId);
  }
  return chosen;
}

// 출전 선수를 고른 뒤 토큰 연결(같은 등번호면 출전하는 쪽, claimUniforms)과 벤치 토큰 교환까지 반영한 필드 토큰 — 서버 submitLineup 과 같은 순서
export function previewField(player: { roster: PlayerInstance[]; uniforms: UniformToken[] }, played: string[]): UniformToken[] {
  const clone = { roster: player.roster, uniforms: structuredClone(player.uniforms) };
  claimUniforms(clone, played);
  try {
    swapBenchTokens(clone, played);
  } catch {
    /* 교환할 토큰이 없으면 서버가 거부한다. 미리보기는 현재 필드로 */
  }
  return clone.uniforms.filter((u) => u.location === 'field');
}

function zonesOf(roster: PlayerInstance[], instanceId: string | undefined): Sector[] | null {
  const inst = instanceId ? roster.find((r) => r.instanceId === instanceId) : undefined;
  return inst ? activeSide(inst).zones : null;
}

// 9지역 자동 배치 (p.20): 라인별 인원 = 포메이션, 센터 지역 1~3, 윙 지역 최대 1.
// 허용 구획이 적은 출전 선수부터 채우고(센터가 비어 있는 라인은 센터 몫 1자리를 남겨 둔다) 나머지 토큰은 남는 자리에. 못 넣은 토큰은 비워둔다
export function autoPlace(field: UniformToken[], roster: PlayerInstance[], played: string[], formation: Formation): Record<string, Region> {
  const need = lineCounts(formation);
  const count = Object.fromEntries(REGIONS.map((r) => [r, 0])) as Record<Region, number>;
  const placements: Record<string, Region> = {};
  const room = (r: Region): boolean => {
    const line = regionLine(r);
    if (need[line] <= 0 || count[r] >= regionLimit(r).max) return false;
    // 윙 지역에 놓아도 그 라인의 빈 센터를 채울 자리가 남아야 한다
    return regionColumn(r) === 'C' || count[`${line}-C`] > 0 || need[line] >= 2;
  };
  const put = (tokenId: string, r: Region) => {
    placements[tokenId] = r;
    count[r]++;
    need[regionLine(r)]--;
  };
  const carded = field.filter((u) => u.cardInstanceId && played.includes(u.cardInstanceId));
  carded.sort((a, b) => (zonesOf(roster, a.cardInstanceId)?.length ?? 9) - (zonesOf(roster, b.cardInstanceId)?.length ?? 9));
  for (const token of carded) {
    const zones = zonesOf(roster, token.cardInstanceId) ?? [];
    // 카드에 적힌 구획 순서대로, 같은 구획 안에서는 자리가 많이 남은 라인부터
    const region = zones.flatMap((z) => REGIONS.filter((r) => regionSector(r) === z && room(r)).sort((a, b) => need[regionLine(b)] - need[regionLine(a)]))[0];
    if (region) put(token.id, region);
  }
  // 카드 없는 토큰만 남는 자리에 채운다: [수비] 면 토큰은 수비 라인부터, [공격] 면 토큰은 공격 라인부터 — 라인 안에서는 센터 → 레프트 윙 → 라이트 윙.
  // 허용 구획이 없어 못 넣은 출전 선수는 미배치로 남긴다
  const rest = field.filter((t) => !(t.id in placements) && !(t.cardInstanceId && played.includes(t.cardInstanceId)));
  const COLUMN_ORDER = { C: 0, L: 1, R: 2 } as const;
  for (const token of [...rest.filter((t) => t.face === 'defense'), ...rest.filter((t) => t.face === 'attack').reverse()]) {
    const lineOrder = token.face === 'defense' ? LINES : [...LINES].reverse();
    const region = REGIONS.filter(room).sort((x, y) => lineOrder.indexOf(regionLine(x)) - lineOrder.indexOf(regionLine(y)) || COLUMN_ORDER[regionColumn(x)] - COLUMN_ORDER[regionColumn(y)])[0];
    if (!region) break;
    put(token.id, region);
  }
  return placements;
}

export function validatePlacements(field: UniformToken[], roster: PlayerInstance[], played: string[], formation: Formation, placements: Record<string, Region>): string[] {
  const issues: string[] = [];
  const regions: Region[] = [];
  for (const token of field) {
    const region = placements[token.id];
    if (!region || !REGIONS.includes(region)) {
      issues.push(`토큰 ${token.number ?? '∅'} 미배치`);
      continue;
    }
    regions.push(region);
    const zones = token.cardInstanceId && played.includes(token.cardInstanceId) ? zonesOf(roster, token.cardInstanceId) : null;
    if (zones && !zones.includes(regionSector(region))) issues.push(`토큰 ${token.number ?? '∅'}: ${regionName(region)} 배치 불가`);
  }
  return [...issues, ...regionIssues(formation, regions, regionName, (l) => `${LINE_LABEL[l]} 라인`)];
}

// 자동 배치가 실패한 선수를 빼가며 서버가 받아들일 라인업을 만든다
export function buildLineup(player: { roster: PlayerInstance[]; uniforms: UniformToken[] }, tacticCardId: string, formation: Formation, players: string[]) {
  for (let attempt = players.length; attempt >= 0; attempt--) {
    const field = previewField(player, players);
    const placements = autoPlace(field, player.roster, players, formation);
    const issues = validatePlacements(field, player.roster, players, formation, placements);
    if (issues.length === 0) return { tacticCardId, formationIndex: 0, players, placements };
    const unplaced = field.find((t) => !(t.id in placements) && t.cardInstanceId && players.includes(t.cardInstanceId));
    if (!unplaced) break;
    players = players.filter((id) => id !== unplaced.cardInstanceId);
  }
  return null;
}
