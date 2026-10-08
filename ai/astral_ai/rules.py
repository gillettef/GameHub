"""
Rootbound 규칙 시뮬레이션 (탐색용 사본). 정본은 notes/Rules.md 와 TS 엔진(shared/src/engine)이다.
TS 와 결과가 어긋나면 AI 가 불법 수를 두므로, 양쪽을 같은 픽스처(shared/fixtures)로 검증한다.

수치(종 스펙·목표·상수·인원별 규칙)는 shared/fixtures/specs.json 을 읽어 쓴다. 이 파일에 하드코딩하지 않는다.
모든 함수는 입력을 변이하지 않는 순수 함수다. 로그(GameState.log)는 시뮬레이션에서 기록하지 않는다.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional, Sequence, TypeVar

from .models import (
    Action,
    Board,
    DiscardAction,
    DraftAction,
    GameResult,
    GameState,
    Plant,
    PlantAction,
    PlayerState,
    Position,
    Score,
    Seed,
    SurrenderAction,
)

_FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures"

# 방향 0~5 (Rules.md 2절): (+1,0) (+1,−1) (0,−1) (−1,0) (−1,+1) (0,+1)
DIRECTIONS: tuple[tuple[int, int], ...] = ((1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1))

T = TypeVar("T")

# ---------------------------------------------------------------------------
# 기준표 (specs.json)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Specs:
    # 종 id → 스펙 dict (표 순서 유지)
    species: dict[str, dict[str, Any]]
    # 표 순서 = 드래프트 자동 픽 순서
    species_ids: tuple[str, ...]
    # 목표 id → 연계 종 (없으면 None)
    goal_species: dict[str, Optional[str]]
    constants: dict[str, int]
    # 인원 → {picks, copies, maxTakers, draftFirstRound, komi}
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


@dataclass(frozen=True)
class BoardIndex:
    n: int
    coords: tuple[tuple[int, int], ...]
    index_of: dict[tuple[int, int], int]
    terrain: tuple[str, ...]
    tile: tuple[int, ...]
    # 칸별 거리 1 이웃 색인
    ring1: tuple[tuple[int, ...], ...]
    # 칸별 별 모양 거리 2 (방향 d 로 두 번 간 칸이 보드 안이면 포함)
    star2: tuple[tuple[int, ...], ...]
    # 칸별·방향별 거리 1..3 직선 칸. 보드 밖은 −1 자리표시자로 남겨 거리가 밀리지 않는다
    line: tuple[tuple[tuple[int, ...], ...], ...]
    # 칸별 거리 2 이내 칸 (자기 제외, 칸 순서)
    within2: tuple[tuple[int, ...], ...]
    edge: tuple[bool, ...]
    # 연못과 맞닿은 칸인가
    near_pond: tuple[bool, ...]
    # 좌석별 입구 칸 색인
    entrances: tuple[int, ...]

    def at(self, q: int, r: int) -> int:
        return self.index_of.get((q, r), -1)


def _build_index(board: Board) -> BoardIndex:
    coords = tuple((c.q, c.r) for c in board.cells)
    index_of = {p: i for i, p in enumerate(coords)}
    at = lambda q, r: index_of.get((q, r), -1)  # noqa: E731
    terrain = tuple(c.terrain for c in board.cells)
    ring1: list[tuple[int, ...]] = []
    star2: list[tuple[int, ...]] = []
    line: list[tuple[tuple[int, ...], ...]] = []
    within2: list[tuple[int, ...]] = []
    edge: list[bool] = []
    for i, (q, r) in enumerate(coords):
        nb = tuple(x for x in (at(*step(q, r, d)) for d in range(6)) if x >= 0)
        ring1.append(nb)
        edge.append(len(nb) < 6)
        star2.append(tuple(x for x in (at(*step(q, r, d, 2)) for d in range(6)) if x >= 0))
        line.append(
            tuple(tuple(at(*step(q, r, d, k)) for k in (1, 2, 3)) for d in range(6))
        )
        w: list[int] = []
        for j, (oq, orr) in enumerate(coords):
            dq, dr = q - oq, r - orr
            if j != i and (abs(dq) + abs(dr) + abs(dq + dr)) // 2 <= 2:
                w.append(j)
        within2.append(tuple(w))
    near_pond = tuple(any(terrain[x] == "pond" for x in nb) for nb in ring1)
    return BoardIndex(
        n=len(coords),
        coords=coords,
        index_of=index_of,
        terrain=terrain,
        tile=tuple(c.tile for c in board.cells),
        ring1=tuple(ring1),
        star2=tuple(star2),
        line=tuple(line),
        within2=tuple(within2),
        edge=tuple(edge),
        near_pond=near_pond,
        entrances=tuple(at(e.q, e.r) for e in board.entrances),
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


def _seat_map(state: GameState) -> dict[str, int]:
    return {p.id: p.seat for p in state.players}


@dataclass(frozen=True)
class Occupancy:
    # 식물 주인 좌석 (−1 없음)
    plant_seat: list[int]
    plant_species: list[Optional[str]]
    # 입구 주인 좌석 (−1 없음)
    entrance_seat: list[int]


def occupancy(state: GameState, idx: Optional[BoardIndex] = None) -> Occupancy:
    idx = idx or board_index(require_board(state))
    seat_of = _seat_map(state)
    plant_seat = [-1] * idx.n
    plant_species: list[Optional[str]] = [None] * idx.n
    entrance_seat = [-1] * idx.n
    for p in state.plants:
        i = idx.at(p.pos.q, p.pos.r)
        plant_seat[i] = seat_of.get(p.ownerId, -1)
        plant_species[i] = p.species
    for seat, e in enumerate(idx.entrances):
        entrance_seat[e] = seat
    return Occupancy(plant_seat, plant_species, entrance_seat)


# ---------------------------------------------------------------------------
# 영향력 · 땅 · 심을 수 있는 칸 (Rules.md 6·7절, influence.ts)
# ---------------------------------------------------------------------------


def compute_influence(
    state: GameState, idx: Optional[BoardIndex] = None, occ: Optional[Occupancy] = None
) -> list[list[int]]:
    """좌석별 영향력 [seat][칸]. 입구 → 식물 → 씨앗을 더한 뒤 버섯 빼기를 마지막에 적용한다(0 아래로 안 내려감)."""
    board = require_board(state)
    idx = idx or board_index(board)
    occ = occ or occupancy(state, idx)
    specs = load_specs()
    c_ = specs.constants
    P = len(state.players)
    n = idx.n
    inf = [[0] * n for _ in range(P)]
    wither = [[0] * n for _ in range(P)]
    seat_of = _seat_map(state)
    ring1 = idx.ring1

    for seat, e in enumerate(idx.entrances):
        if seat >= P:
            continue
        row = inf[seat]
        row[e] += c_["ENTRANCE_SELF"]
        for x in ring1[e]:
            row[x] += c_["ENTRANCE_RING"]

    fertile_bonus = c_["FERTILE_BONUS"]
    for plant in state.plants:
        seat = seat_of.get(plant.ownerId)
        if seat is None:
            continue
        sp = specs.species[plant.species]
        row = inf[seat]
        c = idx.at(plant.pos.q, plant.pos.r)
        nb = ring1[c]
        self_v = sp["self"]
        ring = sp["ring1"]
        fertile = idx.terrain[c] == "fertile"
        if fertile:
            self_v += fertile_bonus
            if sp["fertileRing"]:
                ring += sp["fertileRing"]
        if sp["cluster"]:
            for x in nb:
                if occ.plant_species[x] == plant.species and occ.plant_seat[x] == seat:
                    self_v += sp["cluster"]
        row[c] += self_v
        if ring:
            for x in nb:
                row[x] += ring
        if sp["star2"]:
            for x in idx.star2[c]:
                row[x] += sp["star2"]
        if sp["line"] and plant.direction is not None:
            for x in idx.line[c][plant.direction][: sp["lineLength"]]:
                if x >= 0:  # 보드 밖 칸은 건너뛴다 (거리 3 으로 밀리지 않음)
                    row[x] += sp["line"]
        if sp["ivy"]:
            for x in nb:
                if occ.plant_seat[x] >= 0:
                    row[x] += sp["ivy"]
        if sp["wither"]:
            for x in nb:
                for o in range(P):
                    if o != seat:
                        wither[o][x] += sp["wither"]

    seed_value = specs.species["dandelion"]["seed"]
    for sd in state.seeds:
        seat = seat_of.get(sd.ownerId)
        if seat is not None:
            inf[seat][idx.at(sd.pos.q, sd.pos.r)] += seed_value

    for p in range(P):
        row = inf[p]
        w = wither[p]
        for c in range(n):
            if w[c]:
                row[c] = max(0, row[c] - w[c])
    return inf


def compute_owners(
    state: GameState, inf: Optional[list[list[int]]] = None, idx: Optional[BoardIndex] = None
) -> list[int]:
    """칸 주인 좌석 (−1 = 없음). 엄격한 1등 한 명만. 연못·돌밭은 항상 −1."""
    idx = idx or board_index(require_board(state))
    if inf is None:
        inf = compute_influence(state, idx)
    out = [-1] * idx.n
    P = len(inf)
    for c in range(idx.n):
        t = idx.terrain[c]
        if t == "pond" or t == "rock":
            continue
        best = 0
        who = -1
        tie = False
        for p in range(P):
            v = inf[p][c]
            if v > best:
                best = v
                who = p
                tie = False
            elif v == best and v > 0:
                tie = True
        if not tie:
            out[c] = who
    return out


def is_empty_cell(idx: BoardIndex, occ: Occupancy, c: int) -> bool:
    """빈 칸: 식물·입구·연못·돌밭이 없다 (씨앗은 있어도 된다)."""
    t = idx.terrain[c]
    return t != "pond" and t != "rock" and occ.plant_seat[c] == -1 and occ.entrance_seat[c] == -1


def _seat_of(state: GameState, player_id: str) -> Optional[int]:
    for p in state.players:
        if p.id == player_id:
            return p.seat
    return None


def legal_plant_cell_indices(
    state: GameState,
    player_id: str,
    species: str,
    inf: Optional[list[list[int]]] = None,
    idx: Optional[BoardIndex] = None,
    occ: Optional[Occupancy] = None,
) -> list[int]:
    """이 종을 심을 수 있는 칸 색인 (Rules.md 6.1). 칸 순서(r → q)."""
    idx = idx or board_index(require_board(state))
    occ = occ or occupancy(state, idx)
    seat = _seat_of(state, player_id)
    if seat is None:
        return []
    if inf is None:
        inf = compute_influence(state, idx, occ)
    row = inf[seat]
    pond_planting = bool(species_spec(species)["pondPlanting"])
    out: list[int] = []
    for c in range(idx.n):
        if not is_empty_cell(idx, occ, c):
            continue
        if row[c] >= 1 or (pond_planting and idx.near_pond[c]):
            out.append(c)
    return out


def legal_plant_cells(
    state: GameState, player_id: str, species: str, inf: Optional[list[list[int]]] = None
) -> list[Position]:
    idx = board_index(require_board(state))
    return [Position(q=idx.coords[c][0], r=idx.coords[c][1]) for c in legal_plant_cell_indices(state, player_id, species, inf, idx)]


def legal_seed_cells(state: GameState, plant_pos: Position) -> list[Position]:
    """민들레 씨앗 칸: 심는 칸에서 거리 2 이내 빈 칸(심는 칸 제외)."""
    idx = board_index(require_board(state))
    occ = occupancy(state, idx)
    c = idx.at(plant_pos.q, plant_pos.r)
    if c < 0:
        return []
    return [Position(q=idx.coords[x][0], r=idx.coords[x][1]) for x in idx.within2[c] if is_empty_cell(idx, occ, x)]


def line_directions(idx: BoardIndex, c: int, line_length: int) -> list[int]:
    """칸 c 에서 거리 1..line_length 에 보드 칸이 하나라도 있는 방향."""
    return [d for d in range(6) if any(x >= 0 for x in idx.line[c][d][:line_length])]


def legal_directions(state: GameState, pos: Position, line_length: Optional[int] = None) -> list[int]:
    """칡이 고를 수 있는 방향 (Rules.md 7절): 거리 1..lineLength 에 보드 칸이 하나라도 있어야 한다."""
    idx = board_index(require_board(state))
    c = idx.at(pos.q, pos.r)
    if c < 0:
        return []
    if line_length is None:
        line_length = int(species_spec("kudzu")["lineLength"])
    return line_directions(idx, c, line_length)


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


def _goal_points(
    goal: str, state: GameState, idx: BoardIndex, owners: list[int], mine: list[list[int]], occ: Occupancy
) -> list[int]:
    P = len(state.players)
    terrain = idx.terrain
    if goal == "pond-side":
        return [sum(1 for c in cs if idx.near_pond[c]) for cs in mine]
    if goal == "big-garden":
        return _rank_award([max([0, *(len(k) for k in _components(cs, idx))]) for cs in mine], 6, 3)
    if goal == "long-path":
        return _rank_award([_longest_line(seat, cs, owners, idx) for seat, cs in enumerate(mine)], 5, 2)
    if goal == "fertile-field":
        return [2 * sum(1 for c in cs if terrain[c] == "fertile") for cs in mine]
    if goal == "edge-fence":
        return [sum(1 for c in cs if idx.edge[c]) for cs in mine]
    if goal == "center-plaza":
        return _rank_award([sum(1 for c in cs if idx.tile[c] == 0) for cs in mine], 6, 0)
    if goal == "every-tile":
        return [len({idx.tile[c] for c in cs}) for cs in mine]
    if goal == "flower-bed":
        flowers = ("rapeseed", "lotus", "mugunghwa")
        return [2 * sum(1 for c in cs if occ.plant_species[c] in flowers) for cs in mine]
    if goal == "forest":
        out: list[int] = []
        for seat in range(P):
            trees = [
                c
                for c in range(idx.n)
                if occ.plant_seat[c] == seat and occ.plant_species[c] in ("oak", "bamboo")
            ]
            out.append(4 * sum(1 for k in _components(trees, idx) if len(k) >= 3))
        return out
    if goal == "connected":
        out = []
        for seat in range(P):
            group = [idx.entrances[seat]] + [c for c in range(idx.n) if occ.plant_seat[c] == seat]
            out.append(5 if len(group) > 1 and len(_components(group, idx)) == 1 else 0)
        return out
    if goal == "border-guard":
        return [
            sum(1 for c in cs if any(owners[x] >= 0 and owners[x] != seat for x in idx.ring1[c]))
            for seat, cs in enumerate(mine)
        ]
    if goal == "full-set":
        out = []
        for p in state.players:
            planted = {pl.species for pl in state.plants if pl.ownerId == p.id}
            out.append(4 if len(p.drafted) > 0 and all(s in planted for s in p.drafted) else 0)
        return out
    # 종 연계 보호구역 목표
    pts = [0] * P
    species = load_specs().goal_species.get(goal)
    if not species:
        return pts
    bonus = load_specs().constants["RESERVE_BONUS"]
    for c in range(idx.n):
        seat = occ.plant_seat[c]
        if occ.plant_species[c] == species and seat >= 0 and owners[c] == seat:
            pts[seat] += bonus
    return pts


def compute_scores(state: GameState, idx: Optional[BoardIndex] = None) -> dict[str, Score]:
    """좌석별 점수 (Rules.md 9절). 언제든 부를 수 있다."""
    idx = idx or board_index(require_board(state))
    occ = occupancy(state, idx)
    inf = compute_influence(state, idx, occ)
    owners = compute_owners(state, inf, idx)
    P = len(state.players)
    mine: list[list[int]] = [[] for _ in range(P)]
    for c in range(idx.n):
        if owners[c] >= 0:
            mine[owners[c]].append(c)
    breakdown = [_goal_points(g, state, idx, owners, mine, occ) for g in state.goals]
    specs = load_specs()
    bloom = [0] * P
    for c in range(idx.n):
        sp = occ.plant_species[c]
        seat = occ.plant_seat[c]
        if sp and seat >= 0 and owners[c] == seat:
            bloom[seat] += specs.species[sp]["bloomBonus"]
    komi = rules_for(P)["komi"]
    out: dict[str, Score] = {}
    for p in state.players:
        land = len(mine[p.seat])
        goal_breakdown = [b[p.seat] if p.seat < len(b) else 0 for b in breakdown]
        goals = sum(goal_breakdown)
        k = komi[p.seat] if p.seat < len(komi) else 0
        out[p.id] = Score(
            land=land, goals=goals, goalBreakdown=goal_breakdown, bloom=bloom[p.seat], komi=k,
            total=land + goals + bloom[p.seat] + k,
        )
    return out


def compute_ranking(state: GameState, scores: Optional[dict[str, Score]] = None) -> list[str]:
    """순위: 기권 안 함 → 점수 → 땅 → 좌석 큰 쪽. 기권자는 늦게 기권한 쪽이 위."""
    if scores is None:
        scores = compute_scores(state)
    active = [p for p in state.players if p.surrenderedOrder is None]
    gone = [p for p in state.players if p.surrenderedOrder is not None]
    active.sort(key=lambda p: (-scores[p.id].total, -scores[p.id].land, -p.seat))
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


def draft_options(state: GameState, player_id: str) -> list[str]:
    """드래프트에서 지금 고를 수 있는 종 (표 순서)."""
    if state.phase != "drafting" or state.currentPlayerId != player_id:
        return []
    me = get_player(state, player_id)
    if me is None:
        return []
    max_takers = rules_for(len(state.players))["maxTakers"]
    return [
        s
        for s in load_specs().species_ids
        if s not in me.drafted and sum(1 for p in state.players if s in p.drafted) < max_takers
    ]


def _finish_draft(state: GameState) -> GameState:
    rule = rules_for(len(state.players))
    hand_size = load_specs().constants["HAND_SIZE"]
    seed = state.deckSeed  # 덱 셔플은 보드 시드와 따로 (Rules.md 11절)
    players: list[PlayerState] = []
    for p in sorted(state.players, key=lambda x: x.seat):
        cards = [s for s in p.drafted for _ in range(rule["copies"])]
        items, seed = shuffle(cards, seed)
        players.append(p.model_copy(update={"hand": items[:hand_size], "deck": items[hand_size:]}))
    return state.model_copy(
        update={
            "phase": "playing",
            "players": players,
            "deckSeed": seed,
            "round": 1,
            "turn": 1,
            "currentPlayerId": players[0].id,
        }
    )


def _can_act(p: PlayerState) -> bool:
    return p.surrenderedOrder is None and len(p.hand) > 0


def has_any_plant(state: GameState, player_id: str) -> bool:
    """손패의 어떤 카드라도 심을 칸이 있는가."""
    me = get_player(state, player_id)
    if me is None or state.board is None:
        return False
    idx = board_index(state.board)
    occ = occupancy(state, idx)
    inf = compute_influence(state, idx, occ)
    return any(legal_plant_cell_indices(state, player_id, s, inf, idx, occ) for s in dict.fromkeys(me.hand))


def _finish_game(state: GameState, reason: str) -> GameState:
    scores = compute_scores(state)
    ranking = compute_ranking(state, scores)
    return state.model_copy(
        update={
            "phase": "finished",
            "currentPlayerId": None,
            "result": GameResult(reason=reason, ranking=ranking, scores=scores),  # type: ignore[arg-type]
        }
    )


def _advance(state: GameState) -> GameState:
    """다음 차례로 넘긴다. 둘 사람이 없으면 종료."""
    active = [p for p in state.players if p.surrenderedOrder is None]
    if len(active) <= 1 and len(state.players) > 1:
        return _finish_game(state, "last-standing")
    order = sorted(state.players, key=lambda p: p.seat)
    cur = get_player(state, state.currentPlayerId)
    cur_seat = cur.seat if cur is not None else -1
    for k in range(1, len(order) + 1):
        nxt = order[(cur_seat + k) % len(order)]
        if not _can_act(nxt):
            continue
        wrapped = nxt.seat <= cur_seat
        return state.model_copy(
            update={
                "currentPlayerId": nxt.id,
                "turn": state.turn + 1,
                "round": state.round + (1 if wrapped else 0),
            }
        )
    return _finish_game(state, "complete")


def _spend_card(state: GameState, player_id: str, species: str) -> GameState:
    """손패에서 한 장을 빼고 덱 맨 앞에서 한 장 뽑는다."""
    me = get_player(state, player_id)
    assert me is not None
    hand = list(me.hand)
    hand.remove(species)
    deck = list(me.deck)
    if deck:
        hand.append(deck.pop(0))
    return _update_player(state, player_id, hand=hand, deck=deck)


def validate_plant(state: GameState, a: PlantAction) -> Optional[str]:
    if state.phase != "playing":
        return "진행 중인 게임이 아닙니다"
    if state.currentPlayerId != a.playerId:
        return "내 차례가 아닙니다"
    me = get_player(state, a.playerId)
    if me is None:
        return "없는 플레이어입니다"
    if a.species not in load_specs().species or a.species not in me.hand:
        return "손패에 없는 카드입니다"
    sp = species_spec(a.species)
    idx = board_index(require_board(state))
    c = idx.at(a.pos.q, a.pos.r)
    if c < 0 or c not in legal_plant_cell_indices(state, a.playerId, a.species, idx=idx):
        return "심을 수 없는 칸입니다"
    if sp["line"]:
        if a.direction is None or a.direction not in legal_directions(state, a.pos):
            return "칡 방향이 올바르지 않습니다"
    elif a.direction is not None:
        return "이 식물은 방향이 없습니다"
    if a.seed is not None:
        if not sp["seed"]:
            return "이 식물은 씨앗을 날리지 않습니다"
        if hex_distance(a.seed, a.pos) > 2 or not any(
            p.q == a.seed.q and p.r == a.seed.r for p in legal_seed_cells(state, a.pos)
        ):
            return "씨앗은 심는 칸에서 거리 2 이내 빈 칸에만 놓을 수 있습니다"
    return None


def apply_plant_unchecked(state: GameState, a: PlantAction) -> GameState:
    """검증 없이 심기를 적용한다 (탐색이 이미 합법 수만 만든 경우)."""
    sp = species_spec(a.species)
    plant = Plant(
        id=f"p{len(state.plants) + 1}",
        species=a.species,
        ownerId=a.playerId,
        pos=Position(q=a.pos.q, r=a.pos.r),
        direction=a.direction if sp["line"] else None,
    )
    seeds = state.seeds
    if a.seed is not None and sp["seed"]:
        seeds = [*state.seeds, Seed(ownerId=a.playerId, pos=Position(q=a.seed.q, r=a.seed.r))]
    s = state.model_copy(update={"plants": [*state.plants, plant], "seeds": seeds})
    s = _spend_card(s, a.playerId, a.species)
    return _advance(s)


def apply_action(state: GameState, action: Action) -> tuple[GameState, Optional[str]]:
    """TS applyAction 과 같은 상태 전이. (새 상태, 거부 사유) — 거부 시 상태는 입력 그대로."""
    if isinstance(action, DraftAction):
        if state.phase != "drafting":
            return state, "드래프트 중이 아닙니다"
        if state.currentPlayerId != action.playerId:
            return state, "내가 고를 차례가 아닙니다"
        if action.species not in draft_options(state, action.playerId):
            return state, "고를 수 없는 종입니다"
        me = get_player(state, action.playerId)
        assert me is not None
        s = _update_player(state, action.playerId, drafted=[*me.drafted, action.species])
        next_index = s.draftIndex + 1
        if next_index >= len(s.draftOrder):
            return _finish_draft(s.model_copy(update={"draftIndex": next_index})), None
        return s.model_copy(update={"draftIndex": next_index, "currentPlayerId": s.draftOrder[next_index]}), None
    if isinstance(action, PlantAction):
        err = validate_plant(state, action)
        if err:
            return state, err
        return apply_plant_unchecked(state, action), None
    if isinstance(action, DiscardAction):
        if state.phase != "playing":
            return state, "진행 중인 게임이 아닙니다"
        if state.currentPlayerId != action.playerId:
            return state, "내 차례가 아닙니다"
        me = get_player(state, action.playerId)
        if me is None or action.species not in me.hand:
            return state, "손패에 없는 카드입니다"
        if has_any_plant(state, action.playerId):
            return state, "심을 수 있는 칸이 있으면 버릴 수 없습니다"
        return _advance(_spend_card(state, action.playerId, action.species)), None
    if isinstance(action, SurrenderAction):
        if state.phase != "playing":
            return state, "진행 중에만 기권할 수 있습니다"
        me = get_player(state, action.playerId)
        if me is None or me.surrenderedOrder is not None:
            return state, "기권할 수 없습니다"
        order = sum(1 for p in state.players if p.surrenderedOrder is not None)
        s = _update_player(state, action.playerId, surrenderedOrder=order)
        if s.currentPlayerId == action.playerId:
            return _advance(s), None
        if sum(1 for p in s.players if p.surrenderedOrder is None) <= 1:
            return _finish_game(s, "last-standing"), None
        return s, None
    # READY(로비)는 탐색에서 쓰지 않는다. 보드 조립까지 옮기지 않았으므로 거부한다
    return state, "시뮬레이션이 지원하지 않는 행동입니다"
