"""
Rootbound 규칙 시뮬레이션 (탐색용 사본). 정본은 notes/Rules.md 와 TS 엔진(shared/src/engine)이다.
TS 와 결과가 어긋나면 AI 가 불법 수를 두므로, 양쪽을 같은 픽스처(shared/fixtures)로 검증한다.

2026-10-16 오프라인판(뿌리 큐브): 칸마다 한 색의 큐브만 있고(줄다리기), 한 사람의 큐브 수는 정해져 있다(공급처).
수치(종 스펙·목표·상수·인원별 규칙)는 shared/fixtures/specs.json 을 읽어 쓴다. 이 파일에 하드코딩하지 않는다.
모든 함수는 입력을 변이하지 않는 순수 함수다. 로그(GameState.log)는 시뮬레이션에서 기록하지 않는다.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Optional, Sequence, TypeVar

from .models import (
    Action,
    Board,
    ConfirmAction,
    DiscardAction,
    GameResult,
    GameState,
    Plant,
    PlantAction,
    PlayerState,
    Position,
    Score,
    SurrenderAction,
    TakeAction,
)

_FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures"

# 방향 0~5 (Rules.md 2절): (+1,0) (+1,−1) (0,−1) (−1,0) (−1,+1) (0,+1)
DIRECTIONS: tuple[tuple[int, int], ...] = ((1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1))

T = TypeVar("T")

# 꽃밭·숲 목표가 세는 종 (TS data/species.ts FLOWER_SPECIES / FOREST_SPECIES. specs.json 에 없어 여기 둔다)
FLOWER_SPECIES: tuple[str, ...] = ("dandelion", "lotus", "mugunghwa")
FOREST_SPECIES: tuple[str, ...] = ("oak", "pine")

# ---------------------------------------------------------------------------
# 기준표 (specs.json)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Specs:
    # 종 id → 스펙 dict (표 순서 유지)
    species: dict[str, dict[str, Any]]
    # 표 순서 (이번 판 식물 state.species 도 이 순서)
    species_ids: tuple[str, ...]
    # 목표 id → 연계 종 (없으면 None)
    goal_species: dict[str, Optional[str]]
    constants: dict[str, int]
    # 인원 → {gardenSize, copies, market, supply, komi}
    player_count_rules: dict[int, dict[str, Any]]


@lru_cache(maxsize=1)
def load_specs() -> Specs:
    raw = json.loads((_FIXTURES / "specs.json").read_text(encoding="utf-8"))
    species = {s["id"]: s for s in raw["species"]}
    return Specs(
        species=species,
        species_ids=tuple(s["id"] for s in raw["species"]),
        goal_species={g["id"]: g["species"] for g in raw["goals"]},
        constants=dict(raw["constants"]),
        player_count_rules={int(k): v for k, v in raw["playerCountRules"].items()},
    )


def species_spec(species_id: str) -> dict[str, Any]:
    return load_specs().species[species_id]


def rules_for(players: int) -> dict[str, Any]:
    r = load_specs().player_count_rules.get(players)
    if r is None:
        raise ValueError(f"{players}인 규칙이 없습니다")
    return r


# ---------------------------------------------------------------------------
# 시드 RNG (shared/src/engine/rng.ts, mulberry32 를 32비트 정수 연산으로 그대로 옮김)
# ---------------------------------------------------------------------------

_U32 = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    """Math.imul 의 하위 32비트 (부호 없는 표현)."""
    return (a * b) & _U32


def next_random(seed: int) -> tuple[float, int]:
    """[0,1) 값과 새 seed 를 돌려준다."""
    t = (seed + 0x6D2B79F5) & _U32
    x = _imul(t ^ (t >> 15), 1 | t)
    x = ((x + _imul(x ^ (x >> 7), 61 | x)) & _U32) ^ x
    value = ((x ^ (x >> 14)) & _U32) / 4294967296
    return value, t


def shuffle(items: Sequence[T], seed: int) -> tuple[list[T], int]:
    """Fisher-Yates. 입력을 변이하지 않는다."""
    out = list(items)
    s = seed
    for i in range(len(out) - 1, 0, -1):
        value, s = next_random(s)
        j = math.floor(value * (i + 1))
        out[i], out[j] = out[j], out[i]
    return out, s


# ---------------------------------------------------------------------------
# 육각 좌표 · 보드 색인
# ---------------------------------------------------------------------------


def hex_distance(a: Position, b: Position) -> int:
    dq = a.q - b.q
    dr = a.r - b.r
    return (abs(dq) + abs(dr) + abs(dq + dr)) // 2


def step(q: int, r: int, d: int, k: int = 1) -> tuple[int, int]:
    dq, dr = DIRECTIONS[d]
    return q + dq * k, r + dr * k


def rotate_spot(dq: int, dr: int, rotation: int) -> tuple[int, int]:
    """회전 1번 = 60°: (q, r) → (−r, q + r) (TS rotateSpot)."""
    for _ in range(rotation % 6):
        dq, dr = -dr, dq + dr
    return dq, dr


@dataclass(frozen=True)
class BoardIndex:
    n: int
    coords: tuple[tuple[int, int], ...]
    index_of: dict[tuple[int, int], int]
    terrain: tuple[str, ...]
    tile: tuple[int, ...]
    # 칸별 거리 1 이웃 색인 (방향 순서)
    ring1: tuple[tuple[int, ...], ...]
    # 칸별 거리 2 이내 칸 (자기 제외, 칸 순서)
    within2: tuple[tuple[int, ...], ...]
    edge: tuple[bool, ...]
    # 연못과 맞닿은 칸인가
    near_pond: tuple[bool, ...]
    # 좌석별 입구 칸 색인
    entrances: tuple[int, ...]
    # 칸별 입구 좌석 (−1 없음)
    entrance_seat: tuple[int, ...]

    def at(self, q: int, r: int) -> int:
        return self.index_of.get((q, r), -1)

    def can_hold_roots(self, c: int) -> bool:
        """큐브를 놓을 수 있는 칸: 빈 땅·기름진 땅이고 입구가 아니다 (식물이 있어도 된다)."""
        t = self.terrain[c]
        return (t == "empty" or t == "fertile") and self.entrance_seat[c] == -1


def _build_index(board: Board) -> BoardIndex:
    coords = tuple((c.q, c.r) for c in board.cells)
    index_of = {p: i for i, p in enumerate(coords)}
    at = lambda q, r: index_of.get((q, r), -1)  # noqa: E731
    terrain = tuple(c.terrain for c in board.cells)
    ring1: list[tuple[int, ...]] = []
    within2: list[tuple[int, ...]] = []
    edge: list[bool] = []
    for i, (q, r) in enumerate(coords):
        nb = tuple(x for x in (at(*step(q, r, d)) for d in range(6)) if x >= 0)
        ring1.append(nb)
        edge.append(len(nb) < 6)
        w: list[int] = []
        for j, (oq, orr) in enumerate(coords):
            dq, dr = q - oq, r - orr
            if j != i and (abs(dq) + abs(dr) + abs(dq + dr)) // 2 <= 2:
                w.append(j)
        within2.append(tuple(w))
    near_pond = tuple(any(terrain[x] == "pond" for x in nb) for nb in ring1)
    entrances = tuple(at(e.q, e.r) for e in board.entrances)
    entrance_seat = [-1] * len(coords)
    for seat, e in enumerate(entrances):
        entrance_seat[e] = seat
    return BoardIndex(
        n=len(coords),
        coords=coords,
        index_of=index_of,
        terrain=terrain,
        tile=tuple(c.tile for c in board.cells),
        ring1=tuple(ring1),
        within2=tuple(within2),
        edge=tuple(edge),
        near_pond=near_pond,
        entrances=entrances,
        entrance_seat=tuple(entrance_seat),
    )


# 보드 객체 id → (보드, 색인). 보드는 불변으로 다루므로 같은 객체면 색인도 같다.
_INDEX_CACHE: dict[int, tuple[Board, BoardIndex]] = {}


def board_index(board: Board) -> BoardIndex:
    hit = _INDEX_CACHE.get(id(board))
    if hit is not None and hit[0] is board:
        return hit[1]
    idx = _build_index(board)
    if len(_INDEX_CACHE) > 32:
        _INDEX_CACHE.clear()
    _INDEX_CACHE[id(board)] = (board, idx)
    return idx


def require_board(state: GameState) -> Board:
    if state.board is None:
        raise ValueError("보드가 아직 없습니다")
    return state.board


def _seat_of(state: GameState, player_id: str) -> Optional[int]:
    for p in state.players:
        if p.id == player_id:
            return p.seat
    return None


def plant_species_at(state: GameState, idx: BoardIndex) -> list[Optional[str]]:
    """칸별 식물 종 (없으면 None)."""
    out: list[Optional[str]] = [None] * idx.n
    for p in state.plants:
        out[idx.at(p.pos.q, p.pos.r)] = p.species
    return out


# ---------------------------------------------------------------------------
# 큐브 · 땅 · 심을 수 있는 칸 (Rules.md 6·7절, influence.ts)
# ---------------------------------------------------------------------------


def compute_owners(state: GameState) -> list[int]:
    """칸 주인 좌석 (−1 = 없음). 큐브가 있는 색이 주인이다."""
    return [s if n > 0 else -1 for s, n in zip(state.rootSeat, state.rootCount)]


def cubes_on_board(state: GameState) -> list[int]:
    out = [0] * len(state.players)
    for s, n in zip(state.rootSeat, state.rootCount):
        if n > 0 and s >= 0:
            out[s] += n
    return out


def supply_left(state: GameState) -> list[int]:
    """좌석별 공급처에 남은 큐브 (다음 선 정하기)."""
    lim = rules_for(len(state.players))["supply"]
    return [lim - v for v in cubes_on_board(state)]


def is_empty_cell(idx: BoardIndex, plants: list[Optional[str]], c: int) -> bool:
    return idx.can_hold_roots(c) and plants[c] is None


def legal_plant_cell_indices(state: GameState, player_id: str, species: str, idx: Optional[BoardIndex] = None) -> list[int]:
    """이 종을 심을 수 있는 칸 색인 (Rules.md 6.1). 칸 순서(r → q).
    내 땅, 또는 내 땅·입구와 맞닿은 큐브 없는 칸. 연꽃은 연못과 맞닿은 빈 칸이면 어디든."""
    idx = idx or board_index(require_board(state))
    seat = _seat_of(state, player_id)
    if seat is None:
        return []
    owners = compute_owners(state)
    plants = plant_species_at(state, idx)
    pond = bool(species_spec(species)["pondPlanting"])
    out: list[int] = []
    for c in range(idx.n):
        if not is_empty_cell(idx, plants, c):
            continue
        ok = owners[c] == seat or (
            owners[c] == -1 and any(owners[x] == seat or idx.entrance_seat[x] == seat for x in idx.ring1[c])
        )
        if not ok and pond:
            ok = idx.near_pond[c]
        if ok:
            out.append(c)
    return out


def legal_plant_cells(state: GameState, player_id: str, species: str) -> list[Position]:
    idx = board_index(require_board(state))
    return [Position(q=idx.coords[c][0], r=idx.coords[c][1]) for c in legal_plant_cell_indices(state, player_id, species, idx)]


def legal_seed_cell_indices(idx: BoardIndex, c: int) -> list[int]:
    """민들레 씨앗 칸: 두 칸 안, 큐브를 놓을 수 있는 칸 (심는 칸 제외)."""
    return [x for x in idx.within2[c] if idx.can_hold_roots(x)]


def legal_seed_cells(state: GameState, plant_pos: Position) -> list[Position]:
    idx = board_index(require_board(state))
    c = idx.at(plant_pos.q, plant_pos.r)
    if c < 0:
        return []
    return [Position(q=idx.coords[x][0], r=idx.coords[x][1]) for x in legal_seed_cell_indices(idx, c)]


def root_targets(idx: BoardIndex, species: str, c: int, rotation: int) -> list[tuple[int, int]]:
    """(칸, 큐브 수) 놓는 순서. 보드 밖·연못·바위·입구는 건너뛴다."""
    q, r = idx.coords[c]
    out: list[tuple[int, int]] = []
    for spot in species_spec(species)["roots"]:
        dq, dr = rotate_spot(spot["dq"], spot["dr"], rotation)
        x = idx.at(q + dq, r + dr)
        if x >= 0 and idx.can_hold_roots(x):
            out.append((x, spot["n"]))
    return out


class Roots:
    """큐브 작업 버퍼 (TS RootBuffer). 결과는 새 리스트로 꺼낸다."""

    def __init__(self, seat: Sequence[int], count: Sequence[int], plants: list[Optional[str]], players: int) -> None:
        self.seat = list(seat)
        self.count = list(count)
        self.on_board = [0] * players
        for s_, n in zip(self.seat, self.count):
            if n > 0 and s_ >= 0:
                self.on_board[s_] += n
        self.plants = plants
        self.limit = int(rules_for(players)["supply"])
        self.uprooted = 0

    def _set(self, c: int, seat: int, v: int) -> None:
        old = self.count[c] if self.seat[c] == seat else 0
        self.on_board[seat] += v - old
        self.count[c] = v
        self.seat[c] = seat if v > 0 else -1

    def _reserve(self, seat: int, k: int, except_c: int) -> int:
        """공급처에서 k 개를 쓸 수 있게 한다. 모자라면 가장 높이 쌓인 내 다른 칸에서 옮겨 온다
        (높이가 같으면 식물이 없는 칸 → 칸 순서)."""
        avail = self.limit - self.on_board[seat]
        while avail < k:
            best = -1
            bv = 0
            for x in range(len(self.count)):
                if x == except_c or self.seat[x] != seat:
                    continue
                v = self.count[x]
                if v > bv or (v == bv and v > 0 and best >= 0 and self.plants[best] is not None and self.plants[x] is None):
                    bv = v
                    best = x
            if best < 0:
                break
            self._set(best, seat, bv - 1)
            self.uprooted += 1
            avail += 1
        return max(0, min(k, avail))

    def add(self, c: int, seat: int, k: int) -> None:
        if k <= 0:
            return
        h = self.seat[c] if self.count[c] > 0 else -1
        if h == -1 or h == seat:
            cur = self.count[c] if h == seat else 0
            add = self._reserve(seat, k, c)
            if add > 0:
                self._set(c, seat, cur + add)
            return
        m = self.count[c]
        if k < m:
            self._set(c, h, m - k)
            return
        self._set(c, h, 0)
        rem = k - m
        add = self._reserve(seat, rem, c) if rem > 0 else 0
        if add > 0:
            self._set(c, seat, add)

    def wither(self, c: int, seat: int, k: int) -> None:
        h = self.seat[c] if self.count[c] > 0 else -1
        if h >= 0 and h != seat:
            self._set(c, h, max(0, self.count[c] - k))


def entrance_roots(state: GameState) -> tuple[list[int], list[int]]:
    """처음 입구 둘레 큐브 (TS entranceRoots)."""
    idx = board_index(require_board(state))
    buf = Roots(state.rootSeat, state.rootCount, plant_species_at(state, idx), len(state.players))
    k = load_specs().constants["ENTRANCE_ROOTS"]
    for seat, e in enumerate(idx.entrances):
        for x in idx.ring1[e]:
            if idx.can_hold_roots(x):
                buf.add(x, seat, k)
    return buf.seat, buf.count


def plant_roots(
    state: GameState, player_id: str, species: str, c: int, rotation: int, seed_cell: Optional[int], idx: Optional[BoardIndex] = None
) -> tuple[list[int], list[int], int]:
    """심기의 큐브 결과 (TS plantRoots). state.plants 에는 이미 이 식물이 들어 있어야 한다.
    (rootSeat, rootCount, 옮겨 온 큐브 수)."""
    idx = idx or board_index(require_board(state))
    seat = _seat_of(state, player_id)
    if seat is None:
        raise ValueError("없는 플레이어입니다")
    buf = Roots(state.rootSeat, state.rootCount, plant_species_at(state, idx), len(state.players))
    place_roots(buf, idx, seat, species, c, rotation, seed_cell)
    return buf.seat, buf.count, buf.uprooted


def place_roots(buf: Roots, idx: BoardIndex, seat: int, species: str, c: int, rotation: int, seed_cell: Optional[int]) -> None:
    """뿌리 모양 → 버섯 걷어내기 → 민들레 씨앗 순서로 버퍼에 놓는다. buf.plants 에는 이미 이 식물이 있어야 한다."""
    sp = species_spec(species)
    for x, n in root_targets(idx, species, c, rotation):
        buf.add(x, seat, n)
    if sp["wither"]:
        for x in idx.ring1[c]:
            if idx.can_hold_roots(x):
                buf.wither(x, seat, sp["wither"])
    if sp["seed"] and seed_cell is not None and seed_cell >= 0 and idx.can_hold_roots(seed_cell):
        buf.add(seed_cell, seat, sp["seed"])


# ---------------------------------------------------------------------------
# 점수 · 목표 · 순위 (Rules.md 8·9절, scoring.ts)
# ---------------------------------------------------------------------------


def _rank_award(values: list[int], first: int, second: int) -> list[int]:
    """1등 A, 2등 B. 동점 1등은 모두 A 이고 그때 2등은 없다. 값 0은 받지 않는다."""
    out = [0] * len(values)
    top = max([0, *values])
    if top <= 0:
        return out
    tops = sum(1 for v in values if v == top)
    for i, v in enumerate(values):
        if v == top:
            out[i] = first
    if tops == 1 and second > 0:
        rest = [v for v in values if v < top]
        sec = max(rest) if rest else 0
        if sec > 0:
            for i, v in enumerate(values):
                if v == sec:
                    out[i] = second
    return out


def _components(cells: list[int], idx: BoardIndex) -> list[list[int]]:
    cell_set = set(cells)
    seen: set[int] = set()
    comps: list[list[int]] = []
    for c in cells:
        if c in seen:
            continue
        comp: list[int] = []
        stack = [c]
        seen.add(c)
        while stack:
            x = stack.pop()
            comp.append(x)
            for y in idx.ring1[x]:
                if y in cell_set and y not in seen:
                    seen.add(y)
                    stack.append(y)
        comps.append(comp)
    return comps


def _longest_line(seat: int, cells: list[int], owners: list[int], idx: BoardIndex) -> int:
    """세 축(방향 0·1·2) 중 하나로 이어진 같은 주인 칸 줄의 최대 길이."""
    best = 0
    for d in (0, 1, 2):
        for c in cells:
            q, r = idx.coords[c]
            back = idx.at(*step(q, r, (d + 3) % 6))
            if back >= 0 and owners[back] == seat:
                continue  # 줄의 시작 칸에서만 센다
            length = 1
            cur = c
            while True:
                cq, cr = idx.coords[cur]
                nx = idx.at(*step(cq, cr, d))
                if nx < 0 or owners[nx] != seat:
                    break
                length += 1
                cur = nx
            best = max(best, length)
    return best


def _goal_points(goal: str, idx: BoardIndex, owners: list[int], mine: list[list[int]], plants: list[Optional[str]]) -> list[int]:
    terrain = idx.terrain
    c_ = load_specs().constants
    if goal == "pond-side":
        return [sum(1 for c in cs if idx.near_pond[c]) for cs in mine]
    if goal == "big-garden":
        return _rank_award([max([0, *(len(k) for k in _components(cs, idx))]) for cs in mine], 4, 2)
    if goal == "long-path":
        return _rank_award([_longest_line(seat, cs, owners, idx) for seat, cs in enumerate(mine)], 4, 2)
    if goal == "fertile-field":
        return [2 * sum(1 for c in cs if terrain[c] == "fertile") for cs in mine]
    if goal == "edge-fence":
        return [sum(1 for c in cs if idx.edge[c]) for cs in mine]
    if goal == "center-plaza":
        return _rank_award([sum(1 for c in cs if idx.tile[c] == 0) for cs in mine], 4, 0)
    if goal == "every-tile":
        return [len({idx.tile[c] for c in cs}) for cs in mine]
    if goal == "flower-bed":
        return [2 * sum(1 for c in cs if plants[c] in FLOWER_SPECIES) for cs in mine]
    if goal == "forest":
        return [4 * sum(1 for k in _components([c for c in cs if plants[c] in FOREST_SPECIES], idx) if len(k) >= 3) for cs in mine]
    if goal == "variety":
        return [c_["VARIETY_BONUS"] if len({plants[c] for c in cs if plants[c] is not None}) >= c_["VARIETY_SPECIES"] else 0 for cs in mine]
    species = load_specs().goal_species.get(goal)
    if not species:
        return [0] * len(mine)
    bonus = c_["RESERVE_BONUS"]
    return [bonus * sum(1 for c in cs if plants[c] == species) for cs in mine]


def score_totals(idx: BoardIndex, players: int, goals: Sequence[str], root_seat: Sequence[int], root_count: Sequence[int], plants: list[Optional[str]]) -> list[int]:
    """좌석별 총점만 빠르게 (탐색용). compute_scores 의 total 과 같다."""
    owners = [s if n > 0 else -1 for s, n in zip(root_seat, root_count)]
    mine: list[list[int]] = [[] for _ in range(players)]
    for c, o in enumerate(owners):
        if o >= 0:
            mine[o].append(c)
    totals = [len(cs) for cs in mine]
    for g in goals:
        for seat, v in enumerate(_goal_points(g, idx, owners, mine, plants)):
            totals[seat] += v
    specs = load_specs()
    komi = rules_for(players)["komi"]
    for seat, cs in enumerate(mine):
        totals[seat] += sum(specs.species[plants[c]]["bloomBonus"] for c in cs if plants[c] is not None)
        totals[seat] += komi[seat] if seat < len(komi) else 0
    return totals


def compute_scores(state: GameState, idx: Optional[BoardIndex] = None) -> dict[str, Score]:
    """좌석별 점수 (Rules.md 9절). 언제든 부를 수 있다."""
    idx = idx or board_index(require_board(state))
    owners = compute_owners(state)
    plants = plant_species_at(state, idx)
    P = len(state.players)
    mine: list[list[int]] = [[] for _ in range(P)]
    for c, o in enumerate(owners):
        if o >= 0:
            mine[o].append(c)
    breakdown = [_goal_points(g, idx, owners, mine, plants) for g in state.goals]
    specs = load_specs()
    komi = rules_for(P)["komi"]
    out: dict[str, Score] = {}
    for p in state.players:
        cs = mine[p.seat]
        land = len(cs)
        on_land = sum(1 for c in cs if plants[c] is not None)
        bloom = sum(specs.species[plants[c]]["bloomBonus"] for c in cs if plants[c] is not None)
        goal_breakdown = [b[p.seat] for b in breakdown]
        goals = sum(goal_breakdown)
        k = komi[p.seat] if p.seat < len(komi) else 0
        out[p.id] = Score(
            land=land, plantsOnLand=on_land, goals=goals, goalBreakdown=goal_breakdown, bloom=bloom, komi=k,
            total=land + goals + bloom + k,
        )
    return out


def compute_ranking(state: GameState, scores: Optional[dict[str, Score]] = None) -> list[str]:
    """순위: 기권 안 함 → 점수 → 땅 → 내 땅 위 식물 → 좌석 큰 쪽. 기권자는 늦게 기권한 쪽이 위."""
    if scores is None:
        scores = compute_scores(state)
    active = [p for p in state.players if p.surrenderedOrder is None]
    gone = [p for p in state.players if p.surrenderedOrder is not None]
    active.sort(key=lambda p: (-scores[p.id].total, -scores[p.id].land, -scores[p.id].plantsOnLand, -p.seat))
    gone.sort(key=lambda p: -(p.surrenderedOrder or 0))
    return [p.id for p in active + gone]


# ---------------------------------------------------------------------------
# 진행 (turn.ts)
# ---------------------------------------------------------------------------


def get_player(state: GameState, player_id: Optional[str]) -> Optional[PlayerState]:
    for p in state.players:
        if p.id == player_id:
            return p
    return None


def _update_player(state: GameState, player_id: str, **patch: Any) -> GameState:
    players = [p.model_copy(update=patch) if p.id == player_id else p for p in state.players]
    return state.model_copy(update={"players": players})


def _is_active(p: PlayerState) -> bool:
    return p.surrenderedOrder is None


def _can_act(state: GameState) -> Callable[[PlayerState], bool]:
    """이번 라운드에 둘 수 있는가: 기권 안 했고 손이나 마켓에 카드가 있다."""
    return lambda p: _is_active(p) and (len(p.hand) > 0 or len(state.market) > 0)


def _by_seat(state: GameState) -> list[PlayerState]:
    return sorted(state.players, key=lambda p: p.seat)


def next_round_start(state: GameState) -> int:
    """다음 라운드의 선 (TS nextRoundStart, Rules.md 5절): 공급처에 큐브가 가장 많이 남은 기권 안 한 사람.
    동점이면 이번 선의 다음 자리부터 시계방향으로 처음 만나는 동점자(이번 선은 마지막 후보)."""
    P = len(state.players)
    seats = _by_seat(state)
    active = [p for p in seats if _is_active(p)]
    if not active:
        return state.roundStart
    left = supply_left(state)
    most = max(left[p.seat] for p in active)
    for k in range(1, P + 1):
        p = seats[(state.roundStart + k) % P]
        if _is_active(p) and left[p.seat] == most:
            return p.seat
    return state.roundStart


def has_any_plant(state: GameState, player_id: str) -> bool:
    """손패의 어떤 카드라도 심을 칸이 있는가."""
    me = get_player(state, player_id)
    if me is None or state.board is None:
        return False
    idx = board_index(state.board)
    return any(legal_plant_cell_indices(state, player_id, s, idx) for s in dict.fromkeys(me.hand))


def _finish_game(state: GameState, reason: str) -> GameState:
    scores = compute_scores(state)
    ranking = compute_ranking(state, scores)
    return state.model_copy(
        update={
            "phase": "finished",
            "currentPlayerId": None,
            "market": [],
            "result": GameResult(reason=reason, ranking=ranking, scores=scores),  # type: ignore[arg-type]
        }
    )


def _next_in_round(state: GameState, after: Optional[int], ok: Callable[[PlayerState], bool]) -> Optional[PlayerState]:
    """이번 라운드에서 after 자리 뒤(선 기준 순서)로 ok 를 만족하는 첫 사람. after 가 None 이면 선부터 (TS nextInRound)."""
    P = len(state.players)
    seats = _by_seat(state)
    start = state.roundStart
    frm = 0 if after is None else (after - start + P) % P + 1
    for k in range(frm, P):
        p = seats[(start + k) % P]
        if ok(p):
            return p
    return None


def _enter_turn(state: GameState, nxt: PlayerState) -> GameState:
    """차례를 연다: 마켓에 카드가 있으면 가져오기부터, 없으면 바로 심기."""
    stage = "take" if state.market else "plant"
    return state.model_copy(update={"stage": stage, "currentPlayerId": nxt.id, "turn": state.turn + 1})


def _begin_round(state: GameState, round_no: int, start: int) -> GameState:
    s = state.model_copy(update={"round": round_no, "roundStart": start})
    first = _next_in_round(s, None, _can_act(s))
    return _enter_turn(s, first) if first is not None else _finish_game(s, "complete")


def _end_round(state: GameState) -> GameState:
    """라운드 끝 (TS endRound): 더미·마켓·손이 모두 비면 종료, 아니면 공급처가 가장 많은 사람이 선인 다음 라운드."""
    if not state.pile and not any(_can_act(state)(p) for p in state.players):
        return _finish_game(state, "complete")
    return _begin_round(state, state.round + 1, next_round_start(state))


def _maybe_begin_play(state: GameState) -> GameState:
    """공개 단계에서 기권하지 않은 사람이 모두 확인했으면 1라운드를 연다 (TS maybeBeginPlay)."""
    if state.phase != "reveal":
        return state
    active = [p for p in state.players if _is_active(p)]
    if not all(p.isReady for p in active):
        return state
    first = min(active, key=lambda p: p.seat)
    return _begin_round(state.model_copy(update={"phase": "playing"}), 1, first.seat)


def _advance(state: GameState) -> GameState:
    """지금 사람의 차례가 끝났다 (TS advance): 이번 라운드의 다음 사람, 없으면 다음 라운드로."""
    active = [p for p in state.players if _is_active(p)]
    if len(active) <= 1 and len(state.players) > 1:
        return _finish_game(state, "last-standing")
    cur = get_player(state, state.currentPlayerId)
    cur_seat = cur.seat if cur is not None else state.roundStart
    nxt = _next_in_round(state, cur_seat, _can_act(state))
    return _enter_turn(state, nxt) if nxt is not None else _end_round(state)


def _spend_card(state: GameState, player_id: str, species: str) -> GameState:
    me = get_player(state, player_id)
    assert me is not None
    hand = list(me.hand)
    hand.remove(species)
    return _update_player(state, player_id, hand=hand)


def turn_error(state: GameState, player_id: str, stage: str) -> Optional[str]:
    """지금 이 사람이 이 단계의 차례인가 (TS turnError). 아니면 거부 사유."""
    if state.phase != "playing":
        return "진행 중인 게임이 아닙니다"
    if state.currentPlayerId != player_id:
        return "내 차례가 아닙니다"
    if state.stage != stage:
        return "이미 가져왔습니다. 손의 카드 중 하나를 심으세요" if stage == "take" else "먼저 마켓에서 카드를 가져오세요"
    return None


def validate_take(state: GameState, a: TakeAction) -> Optional[str]:
    err = turn_error(state, a.playerId, "take")
    if err:
        return err
    take = a.take
    if isinstance(take, bool) or not isinstance(take, int) or take < 0 or take >= len(state.market):
        return "없는 카드입니다"
    return None


def apply_take_unchecked(state: GameState, a: TakeAction) -> GameState:
    """마켓 take 번 카드를 손에 넣고, 빈자리는 더미 맨 위 카드로 채운다. 같은 사람이 이어서 심는다."""
    card = state.market[a.take]
    me = get_player(state, a.playerId)
    assert me is not None
    market = [x for i, x in enumerate(state.market) if i != a.take]
    pile = list(state.pile)
    if pile:
        market.append(pile.pop(0))
    s = state.model_copy(update={"market": market, "pile": pile, "stage": "plant"})
    return _update_player(s, a.playerId, hand=[*me.hand, card])


def validate_plant(state: GameState, a: PlantAction) -> Optional[str]:
    if a.rotation is not None and (isinstance(a.rotation, bool) or a.rotation not in range(6)):
        return "잘못된 회전입니다"
    err = turn_error(state, a.playerId, "plant")
    if err:
        return err
    me = get_player(state, a.playerId)
    if me is None:
        return "없는 플레이어입니다"
    if a.species not in load_specs().species or a.species not in me.hand:
        return "손에 없는 카드입니다"
    sp = species_spec(a.species)
    idx = board_index(require_board(state))
    c = idx.at(a.pos.q, a.pos.r)
    if c < 0 or c not in legal_plant_cell_indices(state, a.playerId, a.species, idx):
        return "심을 수 없는 칸입니다"
    if a.seed is not None:
        if not sp["seed"]:
            return "이 식물은 씨앗을 날리지 않습니다"
        x = idx.at(a.seed.q, a.seed.r)
        if x < 0 or x not in legal_seed_cell_indices(idx, c):
            return "씨앗은 심는 칸에서 두 칸 안, 큐브를 놓을 수 있는 칸에만 놓을 수 있습니다"
    return None


def apply_plant_unchecked(state: GameState, a: PlantAction) -> GameState:
    """검증 없이 심기를 적용한다 (탐색이 이미 합법 수만 만든 경우)."""
    sp = species_spec(a.species)
    rotation = a.rotation or 0
    plant = Plant(id=f"p{len(state.plants) + 1}", species=a.species, ownerId=a.playerId, pos=Position(q=a.pos.q, r=a.pos.r), rotation=rotation)
    s = state.model_copy(update={"plants": [*state.plants, plant]})
    idx = board_index(require_board(s))
    seed_cell = idx.at(a.seed.q, a.seed.r) if a.seed is not None and sp["seed"] else None
    seat, count, _ = plant_roots(s, a.playerId, a.species, idx.at(a.pos.q, a.pos.r), rotation, seed_cell, idx)
    s = s.model_copy(update={"rootSeat": seat, "rootCount": count})
    s = _spend_card(s, a.playerId, a.species)
    return _advance(s)


def apply_action(state: GameState, action: Action) -> tuple[GameState, Optional[str]]:
    """TS applyAction 과 같은 상태 전이. (새 상태, 거부 사유) — 거부 시 상태는 입력 그대로."""
    if isinstance(action, ConfirmAction):
        if state.phase != "reveal":
            return state, "이번 판 식물 공개 단계가 아닙니다"
        me = get_player(state, action.playerId)
        if me is None or not _is_active(me):
            return state, "없는 플레이어입니다"
        if me.isReady:
            return state, "이미 확인했습니다"
        return _maybe_begin_play(_update_player(state, action.playerId, isReady=True)), None
    if isinstance(action, TakeAction):
        err = validate_take(state, action)
        if err:
            return state, err
        return apply_take_unchecked(state, action), None
    if isinstance(action, PlantAction):
        err = validate_plant(state, action)
        if err:
            return state, err
        return apply_plant_unchecked(state, action), None
    if isinstance(action, DiscardAction):
        err = turn_error(state, action.playerId, "plant")
        if err:
            return state, err
        me = get_player(state, action.playerId)
        if me is None or action.species not in me.hand:
            return state, "손에 없는 카드입니다"
        if has_any_plant(state, action.playerId):
            return state, "심을 수 있는 칸이 있으면 버릴 수 없습니다"
        return _advance(_spend_card(state, action.playerId, action.species)), None
    if isinstance(action, SurrenderAction):
        if state.phase not in ("playing", "reveal"):
            return state, "게임 중에만 기권할 수 있습니다"
        me = get_player(state, action.playerId)
        if me is None or me.surrenderedOrder is not None:
            return state, "기권할 수 없습니다"
        order = sum(1 for p in state.players if p.surrenderedOrder is not None)
        s = _update_player(state, action.playerId, surrenderedOrder=order, hand=[])
        if sum(1 for p in s.players if _is_active(p)) <= 1:
            return _finish_game(s, "last-standing"), None
        if s.phase == "reveal":
            return _maybe_begin_play(s), None
        if s.currentPlayerId == action.playerId:
            return _advance(s), None
        return s, None
    # READY(로비)는 탐색에서 쓰지 않는다. 보드 조립까지 옮기지 않았으므로 거부한다
    return state, "시뮬레이션이 지원하지 않는 행동입니다"


# ---------------------------------------------------------------------------
# 시간 초과 자동 수 (TS autoAction, Rules.md 6.3절)
# ---------------------------------------------------------------------------


def auto_action(state: GameState, player_id: str) -> Optional[Action]:
    """공개 단계 → 확인, 가져오기 → 마켓 0번, 심기 → 맨 앞 카드부터 심을 수 있는 첫 카드를 첫 칸에 회전 0으로,
    아무것도 못 심으면 맨 앞 카드 버리기. 둘 수 없으면 None."""
    me = get_player(state, player_id)
    if me is None or not _is_active(me):
        return None
    if state.phase == "reveal":
        return None if me.isReady else ConfirmAction(playerId=player_id)
    if state.phase != "playing" or state.currentPlayerId != player_id:
        return None
    if state.stage == "take":
        return TakeAction(playerId=player_id, take=0) if state.market else None
    if not me.hand:
        return None
    idx = board_index(require_board(state))
    for sp in me.hand:
        cells = legal_plant_cell_indices(state, player_id, sp, idx)
        if cells:
            q, r = idx.coords[cells[0]]
            return PlantAction(playerId=player_id, species=sp, pos=Position(q=q, r=r), rotation=0)  # type: ignore[arg-type]
    return DiscardAction(playerId=player_id, species=me.hand[0])  # type: ignore[arg-type]
