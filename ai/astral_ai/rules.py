"""
탐색용 규칙 시뮬레이션. shared/src/engine 의 사본이며 반드시 같은 결과를 내야 한다
(로그는 만들지 않는다. 비교는 log 를 제외하고 한다 — tests/test_fixtures.py).

공개 함수는 입력 상태를 변이하지 않는다. `_` 로 시작하는 내부 함수는 작업 사본을 변이한다.
기준표는 shared/fixtures/specs.json 을 읽어 TS 와 같은 값을 쓴다.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .models import (
    Action,
    CardSpec,
    GameResult,
    GameState,
    MapDef,
    Marker,
    PassAction,
    PlaceAction,
    PlacementErrorCode,
    PlayerState,
    Position,
    Score,
    SurrenderAction,
)

_FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures"


@dataclass(frozen=True)
class Specs:
    constants: dict[str, int]
    cards: dict[str, CardSpec]  # 코어 포함
    maps: dict[str, MapDef]

    def spec(self, card_id: str) -> CardSpec:
        return self.cards[card_id]


@lru_cache(maxsize=1)
def load_specs() -> Specs:
    raw = json.loads((_FIXTURES / "specs.json").read_text(encoding="utf-8"))
    cards = [CardSpec.model_validate(raw["core"])] + [CardSpec.model_validate(c) for c in raw["cards"]]
    return Specs(
        constants=dict(raw["constants"]),
        cards={c.id: c for c in cards},
        maps={m.id: m for m in (MapDef.model_validate(x) for x in raw["maps"])},
    )


def spec(card_id: str) -> CardSpec:
    return load_specs().spec(card_id)


def const(name: str) -> int:
    return load_specs().constants[name]


# --- 기하 · 시야 · 영토 (sight.ts) -------------------------------------------
# 보드는 odd-r 오프셋 육각 좌표계다. 거리는 큐브 좌표로 바꿔 계산한다 (Rules.md 3절).


def _to_cube(p: Position) -> tuple[int, int, int]:
    q = p.x - ((p.y - (p.y & 1)) >> 1)
    r = p.y
    return q, r, -q - r


def hex_distance(a: Position, b: Position) -> int:
    aq, ar, as_ = _to_cube(a)
    bq, br, bs = _to_cube(b)
    return max(abs(aq - bq), abs(ar - br), abs(as_ - bs))


def in_bounds(state: GameState, p: Position) -> bool:
    return 0 <= p.x < state.board.width and 0 <= p.y < state.board.height


def terrain_at(state: GameState, p: Position) -> str:
    if any(a.x == p.x and a.y == p.y for a in state.board.asteroids):
        return "asteroid"
    if any(v.x == p.x and v.y == p.y for v in state.board.veins):
        return "vein"
    return "space"


def marker_at(state: GameState, p: Position) -> Marker | None:
    for m in state.markers:
        if m.pos.x == p.x and m.pos.y == p.y:
            return m
    return None


def sort_markers(markers: list[Marker]) -> list[Marker]:
    """y → x 오름차순 (Rules.md 13절)"""
    return sorted(markers, key=lambda m: (m.pos.y, m.pos.x))


def markers_of(state: GameState, player_id: str) -> list[Marker]:
    return sort_markers([m for m in state.markers if m.ownerId == player_id])


def is_in_sight(state: GameState, player_id: str, p: Position) -> bool:
    return any(
        m.ownerId == player_id and hex_distance(m.pos, p) <= spec(m.specId).sight for m in state.markers
    )


def cells_in_radius(state: GameState, center: Position, radius: int) -> list[Position]:
    out: list[Position] = []
    for y in range(center.y - radius, center.y + radius + 1):
        for x in range(center.x - radius, center.x + radius + 1):
            p = Position(x=x, y=y)
            if in_bounds(state, p) and hex_distance(center, p) <= radius:
                out.append(p)
    return out


def compute_sight_area(state: GameState, player_id: str) -> list[Position]:
    seen: set[tuple[int, int]] = set()
    for m in markers_of(state, player_id):
        for p in cells_in_radius(state, m.pos, spec(m.specId).sight):
            seen.add((p.x, p.y))
    return [Position(x=x, y=y) for (x, y) in sorted(seen, key=lambda t: (t[1], t[0]))]


@dataclass(frozen=True)
class Territory:
    owners: list[list[str | None]]  # owners[y][x]
    counts: dict[str, int]


def compute_territory(state: GameState) -> Territory:
    claims: dict[tuple[int, int], set[str]] = {}
    for m in state.markers:
        for p in cells_in_radius(state, m.pos, spec(m.specId).sight):
            claims.setdefault((p.x, p.y), set()).add(m.ownerId)
    asteroid = {(a.x, a.y) for a in state.board.asteroids}
    marker_owner = {(m.pos.x, m.pos.y): m.ownerId for m in state.markers}
    counts: dict[str, int] = {p.id: 0 for p in state.players}
    owners: list[list[str | None]] = []
    for y in range(state.board.height):
        row: list[str | None] = []
        for x in range(state.board.width):
            owner: str | None = None
            if (x, y) in asteroid:
                owner = None
            elif (x, y) in marker_owner:
                owner = marker_owner[(x, y)]
            else:
                s = claims.get((x, y))
                if s and len(s) == 1:
                    owner = next(iter(s))
            row.append(owner)
            if owner is not None:
                counts[owner] = counts.get(owner, 0) + 1
        owners.append(row)
    return Territory(owners=owners, counts=counts)


# --- 점수 · 순위 · 수입 (scoring.ts) -----------------------------------------


def alive_players(state: GameState) -> list[PlayerState]:
    return sorted((p for p in state.players if p.alive), key=lambda p: p.seat)


def get_player(state: GameState, player_id: str) -> PlayerState:
    for p in state.players:
        if p.id == player_id:
            return p
    raise KeyError(player_id)


def compute_scores(state: GameState) -> dict[str, Score]:
    territory = compute_territory(state)
    per_cell = const("SCORE_PER_TERRITORY")
    scores: dict[str, Score] = {}
    for p in state.players:
        if not p.alive:
            scores[p.id] = Score(territory=0, markers=0, total=0)
            continue
        t = territory.counts.get(p.id, 0) * per_cell
        m = sum(spec(mk.specId).score for mk in markers_of(state, p.id))
        scores[p.id] = Score(territory=t, markers=m, total=t + m)
    return scores


def compute_ranking(state: GameState, scores: dict[str, Score] | None = None) -> list[str]:
    sc = scores or compute_scores(state)
    alive = sorted((p for p in state.players if p.alive), key=lambda p: (-sc[p.id].total, -p.seat))
    dead = sorted((p for p in state.players if not p.alive), key=lambda p: -(p.eliminatedOrder or 0))
    return [p.id for p in alive] + [p.id for p in dead]


def compute_income(state: GameState, player_id: str) -> int:
    total = 0
    bonus = const("VEIN_PRODUCTION_BONUS")
    for m in markers_of(state, player_id):
        sp = spec(m.specId)
        if m.kind == "core":
            total += sp.production
        elif m.kind == "building":
            total += sp.production + (bonus if terrain_at(state, m.pos) == "vein" else 0)
    return total


# --- 배치 검증 (placement.ts) -------------------------------------------------


def validate_card(state: GameState, player_id: str, card_id: str) -> PlacementErrorCode | None:
    if state.phase != "playing":
        return "not-playing"
    if not any(p.id == player_id for p in state.players):
        return "unknown-player"
    player = get_player(state, player_id)
    if state.currentPlayerId != player_id or not player.alive:
        return "not-your-turn"
    if card_id not in load_specs().cards or card_id not in player.hand:
        return "not-in-hand"
    if player.energy < spec(card_id).cost:
        return "not-enough-energy"
    return None


def validate_cell(state: GameState, player_id: str, card_id: str, pos: Position) -> PlacementErrorCode | None:
    if not in_bounds(state, pos):
        return "out-of-bounds"
    if terrain_at(state, pos) == "asteroid":
        return "asteroid"
    if marker_at(state, pos) is not None:
        return "occupied"
    sp = spec(card_id)
    infiltrate = "infiltrate" in sp.keywords and any(
        m.ownerId != player_id and hex_distance(m.pos, pos) <= const("INFILTRATE_RANGE") for m in state.markers
    )
    if not infiltrate and not is_in_sight(state, player_id, pos):
        return "out-of-sight"
    return None


def validate_placement(state: GameState, player_id: str, card_id: str, pos: Position) -> PlacementErrorCode | None:
    return validate_card(state, player_id, card_id) or validate_cell(state, player_id, card_id, pos)


def legal_cells(state: GameState, player_id: str, card_id: str) -> list[Position]:
    out: list[Position] = []
    for y in range(state.board.height):
        for x in range(state.board.width):
            p = Position(x=x, y=y)
            if validate_cell(state, player_id, card_id, p) is None:
                out.append(p)
    return out


def legal_actions(state: GameState, player_id: str) -> list[Action]:
    """PLACE 후보(손패 종류별 × 놓을 수 있는 칸) + PASS. 결정적 순서."""
    actions: list[Action] = []
    if state.phase != "playing" or state.currentPlayerId != player_id:
        return actions
    player = get_player(state, player_id)
    for card_id in sorted(set(player.hand), key=player.hand.index):
        if validate_card(state, player_id, card_id) is not None:
            continue
        for p in legal_cells(state, player_id, card_id):
            actions.append(PlaceAction(type="PLACE", playerId=player_id, cardId=card_id, pos=p))
    actions.append(PassAction(type="PASS", playerId=player_id))
    return actions


# --- 상태 변이 (작업 사본에만) -------------------------------------------------


def _player(state: GameState, player_id: str) -> PlayerState:
    return get_player(state, player_id)


def _set_markers(state: GameState, markers: list[Marker]) -> None:
    state.markers = sort_markers(markers)


def _eliminate(state: GameState, player_id: str) -> None:
    order = sum(1 for p in state.players if not p.alive)
    p = _player(state, player_id)
    p.alive = False
    p.eliminatedOrder = order
    _set_markers(state, [m for m in state.markers if m.ownerId != player_id])


def _remove_destroyed(state: GameState) -> None:
    destroyed = sort_markers([m for m in state.markers if m.hp <= 0])
    if not destroyed:
        return
    _set_markers(state, [m for m in state.markers if m.hp > 0])
    owners = sorted((get_player(state, m.ownerId) for m in destroyed if m.kind == "core"), key=lambda p: p.seat)
    for p in owners:
        if _player(state, p.id).alive:
            _eliminate(state, p.id)


def _resolve_combat(state: GameState, player_id: str) -> None:
    attackers = [m for m in markers_of(state, player_id) if spec(m.specId).attack > 0]
    if not attackers:
        return
    enemies = [m for m in state.markers if m.ownerId != player_id]
    damage: dict[str, int] = {}
    for a in attackers:
        sp = spec(a.specId)
        cands = [e for e in enemies if hex_distance(a.pos, e.pos) <= sp.range]
        if not cands:
            continue
        target = min(cands, key=lambda e: (hex_distance(a.pos, e.pos), e.hp, e.pos.y, e.pos.x))
        damage[target.id] = damage.get(target.id, 0) + sp.attack
    if not damage:
        return
    for m in state.markers:
        if m.id in damage:
            m.hp -= damage[m.id]
    _remove_destroyed(state)


def _apply_repair(state: GameState, player_id: str) -> None:
    repairers = [m for m in markers_of(state, player_id) if "repair" in spec(m.specId).keywords]
    if not repairers:
        return
    radius, amount = const("REPAIR_RADIUS"), const("REPAIR_AMOUNT")
    heal: dict[str, int] = {}
    for r in repairers:
        for m in markers_of(state, player_id):
            if hex_distance(r.pos, m.pos) <= radius and m.hp < spec(m.specId).hp:
                heal[m.id] = heal.get(m.id, 0) + amount
    for m in state.markers:
        if m.id in heal:
            m.hp = min(spec(m.specId).hp, m.hp + heal[m.id])


def _expire_persistent(state: GameState, player_id: str) -> None:
    keep: list[Marker] = []
    for m in state.markers:
        if m.ownerId != player_id or m.remainingTurns is None:
            keep.append(m)
            continue
        m.remainingTurns -= 1
        if m.remainingTurns > 0:
            keep.append(m)
    _set_markers(state, keep)


def _draw(state: GameState, player_id: str) -> None:
    p = _player(state, player_id)
    limit = const("HAND_LIMIT")
    if len(p.hand) >= limit or not p.deck:
        return
    n = min(const("DRAW_PER_TURN"), limit - len(p.hand), len(p.deck))
    p.hand.extend(p.deck[:n])
    p.deck = p.deck[n:]


def _finish(state: GameState, reason: str) -> None:
    scores = compute_scores(state)
    state.phase = "finished"
    state.currentPlayerId = None
    state.result = GameResult(reason=reason, ranking=compute_ranking(state, scores), scores=scores)  # type: ignore[arg-type]


def _begin_turn(state: GameState) -> None:
    pid = state.currentPlayerId
    if state.phase != "playing" or pid is None:
        return
    _resolve_combat(state, pid)
    if len(alive_players(state)) <= 1:
        _finish(state, "last-survivor")
        return
    _apply_repair(state, pid)
    _expire_persistent(state, pid)
    p = _player(state, pid)
    p.energy = min(p.energy + compute_income(state, pid), const("ENERGY_CAP"))
    _draw(state, pid)


def _advance_turn(state: GameState) -> None:
    if state.phase != "playing" or state.currentPlayerId is None:
        return
    alive = alive_players(state)
    if len(alive) <= 1:
        _finish(state, "last-survivor")
        return
    if all(p.passed for p in alive):
        _finish(state, "all-pass")
        return
    current = _player(state, state.currentPlayerId)
    nxt = next((p for p in alive if p.seat > current.seat), alive[0])
    if nxt.seat <= current.seat:
        if state.round >= state.roundLimit:
            _finish(state, "round-limit")
            return
        state.round += 1
    state.turn += 1
    state.currentPlayerId = nxt.id
    _begin_turn(state)


def _apply_placement(state: GameState, player_id: str, card_id: str, pos: Position) -> None:
    sp = spec(card_id)
    p = _player(state, player_id)
    p.hand.remove(card_id)  # 첫 번째 것 하나만
    p.discard.append(card_id)
    p.energy -= sp.cost
    eff = sp.effect
    if sp.kind == "magic" and eff is not None and eff.kind != "persistent":
        if eff.kind == "damage":
            for m in state.markers:
                if m.ownerId != player_id and hex_distance(pos, m.pos) <= eff.radius:
                    m.hp -= eff.amount
        elif eff.kind == "heal":
            for m in state.markers:
                if m.ownerId == player_id and hex_distance(pos, m.pos) <= eff.radius:
                    m.hp = min(spec(m.specId).hp, m.hp + eff.amount)
        elif eff.kind == "energy":
            p.energy = min(p.energy + eff.amount, const("ENERGY_CAP"))
    else:
        marker = Marker(
            id=f"m{state.nextMarkerId}",
            specId=card_id,
            kind=sp.kind,
            ownerId=player_id,
            pos=pos,
            hp=sp.hp,
            remainingTurns=eff.durationTurns if eff is not None and eff.kind == "persistent" else None,
        )
        state.nextMarkerId += 1
        _set_markers(state, state.markers + [marker])
    _remove_destroyed(state)


def _check_turn(state: GameState, player_id: str) -> str | None:
    if state.phase != "playing":
        return "not-playing"
    if not any(p.id == player_id for p in state.players):
        return "unknown-player"
    if state.currentPlayerId != player_id or not _player(state, player_id).alive:
        return "not-your-turn"
    return None


# --- 공개 API ----------------------------------------------------------------


def apply_action(state: GameState, action: Action) -> GameState:
    """TS applyAction 과 같은 결과(로그 제외). 불법이면 ValueError."""
    s = state.model_copy(deep=True)
    if isinstance(action, PlaceAction):
        err = validate_placement(s, action.playerId, action.cardId, action.pos)
        if err:
            raise ValueError(err)
        _apply_placement(s, action.playerId, action.cardId, action.pos)
        for p in s.players:
            p.passed = False
        _advance_turn(s)
    elif isinstance(action, PassAction):
        err = _check_turn(s, action.playerId)
        if err:
            raise ValueError(err)
        _player(s, action.playerId).passed = True
        _advance_turn(s)
    elif isinstance(action, SurrenderAction):
        err = _check_turn(s, action.playerId)
        if err:
            raise ValueError(err)
        _eliminate(s, action.playerId)
        _advance_turn(s)
    else:
        raise ValueError("로비 액션은 시뮬레이션하지 않습니다")
    return s


def strip_log(state: GameState) -> dict:
    """비교용: log 를 뺀 JSON 직렬화"""
    d = state.model_dump(mode="json")
    d.pop("log", None)
    return d
