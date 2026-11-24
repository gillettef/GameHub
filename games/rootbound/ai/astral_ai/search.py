"""
AI 수 결정 (2026-10-16 오프라인판). 차례 = 마켓에서 1장 가져오기 → 손 2장 중 1장 심기 (Rules.md 5절).
가져오기: 마켓 카드마다 "손 카드 + 그 카드로 둘 수 있는 최선 1수 가치 + 공개 목표 연계 가산"을 매기고, 카드 더미 뒷면 1장은
아직 못 본 카드(전체 − 심은 카드 − 마켓 − 내 손) 분포로 낸 기댓값을 매겨 가장 큰 쪽을 고른다. 더미 순서는 보지 않는다.
심기: 손 카드 × 칸 × 회전(× 민들레 씨앗 상위 칸)에 대해 1수 탐욕(내 총점 − 가장 높은 상대 총점)으로 고른다.
공개 단계면 확인한다. 항상 시간 제한(F027, 기본 2초) 안에 합법 수를 돌려준다.
순수 함수: 입력 상태를 변이하지 않고, 같은 입력이면 (시간이 충분할 때) 같은 수를 고른다.
"""

from __future__ import annotations

import time
from typing import Optional

from .models import Action, DiscardAction, GameState, PlantAction, Position, ReadyAction, TakeAction
from .rules import (
    FLOWER_SPECIES,
    FOREST_SPECIES,
    BoardIndex,
    Roots,
    auto_action,
    board_index,
    get_player,
    legal_plant_cell_indices,
    legal_seed_cell_indices,
    load_specs,
    place_roots,
    plant_species_at,
    rotate_spot,
    rules_for,
    score_totals,
    species_spec,
)

# 시간 제한 중 응답 직렬화·네트워크 몫으로 남겨 두는 비율과 여유(ms)
_TIME_FRACTION = 0.6
_TIME_MARGIN_MS = 150
# 민들레 씨앗 칸을 따로 펼쳐 볼 상위 (칸, 회전) 수
_SEED_TOP = 3

# ---------------------------------------------------------------------------
# 가져오기 목표 연계 가산 (AI 휴리스틱. 규칙 수치가 아니라 AI 선호도라 여기 둔다)
# ---------------------------------------------------------------------------

_RESERVE_TAKE_BONUS = 2
_FLOWER_TAKE_BONUS = 1
_FOREST_TAKE_BONUS = 1


def take_goal_bonus(state: GameState, player_id: str, species: str) -> int:
    """공개 목표가 이 카드를 반길 때 더하는 가치. 식물은 누구의 것도 아니므로 1수 가치에 이미 대부분 들어 있다."""
    bonus = 0
    goal_species = load_specs().goal_species
    for g in state.goals:
        if goal_species.get(g) == species:
            bonus += _RESERVE_TAKE_BONUS
        elif g == "flower-bed" and species in FLOWER_SPECIES:
            bonus += _FLOWER_TAKE_BONUS
        elif g == "forest" and species in FOREST_SPECIES:
            bonus += _FOREST_TAKE_BONUS
    return bonus


class _OutOfTime(Exception):
    pass


class _Evaluator:
    """한 상태에서 여러 수를 빠르게 시험한다 (상태 객체를 복사하지 않고 큐브 배열만 바꿔 본다)."""

    def __init__(self, state: GameState, player_id: str, deadline: float) -> None:
        assert state.board is not None
        self.state = state
        self.idx: BoardIndex = board_index(state.board)
        self.player_id = player_id
        me = get_player(state, player_id)
        assert me is not None
        self.seat = me.seat
        self.P = len(state.players)
        self.plants = plant_species_at(state, self.idx)
        self.deadline = deadline
        self.rivals = [p.seat for p in state.players if p.id != player_id and p.surrenderedOrder is None]

    def value(self, species: str, c: int, rotation: int, seed_cell: Optional[int]) -> int:
        if time.perf_counter() >= self.deadline:
            raise _OutOfTime
        plants = list(self.plants)
        plants[c] = species
        buf = Roots(self.state.rootSeat, self.state.rootCount, plants, self.P)
        place_roots(buf, self.idx, self.seat, species, c, rotation, seed_cell)
        return self._margin(score_totals(self.idx, self.P, self.state.goals, buf.seat, buf.count, plants))

    def base(self) -> int:
        return self._margin(score_totals(self.idx, self.P, self.state.goals, self.state.rootSeat, self.state.rootCount, self.plants))

    def _margin(self, totals: list[int]) -> int:
        """내 총점 − 가장 높은 상대 총점."""
        return totals[self.seat] - (max(totals[s] for s in self.rivals) if self.rivals else 0)

    def best(self, species_list: list[str], with_seeds: bool) -> Optional[tuple[int, str, int, int, Optional[int]]]:
        """(가치, 종, 칸, 회전, 씨앗 칸). 심을 칸이 없으면 None. 회전은 같은 모양이면 앞 번호만 본다."""
        best: Optional[tuple[int, str, int, int, Optional[int]]] = None
        dandelion: list[tuple[int, str, int, int]] = []
        for sp in dict.fromkeys(species_list):
            rots = _distinct_rotations(sp)
            for c in legal_plant_cell_indices(self.state, self.player_id, sp, self.idx):
                for rot in rots:
                    v = self.value(sp, c, rot, None)
                    if best is None or v > best[0]:
                        best = (v, sp, c, rot, None)
                    if with_seeds and species_spec(sp)["seed"]:
                        dandelion.append((v, sp, c, rot))
        if dandelion:
            dandelion.sort(key=lambda t: -t[0])
            for _, sp, c, rot in dandelion[:_SEED_TOP]:
                for x in legal_seed_cell_indices(self.idx, c):
                    v = self.value(sp, c, rot, x)
                    if best is None or v > best[0]:
                        best = (v, sp, c, rot, x)
        return best


_ROT_CACHE: dict[str, list[int]] = {}


def _distinct_rotations(species: str) -> list[int]:
    """모양이 서로 다른 회전 번호 (예: 버섯은 0 하나)."""
    hit = _ROT_CACHE.get(species)
    if hit is not None:
        return hit
    seen: set[tuple[tuple[int, int, int], ...]] = set()
    out: list[int] = []
    for rot in range(6):
        key = tuple(sorted((*rotate_spot(s["dq"], s["dr"], rot), s["n"]) for s in species_spec(species)["roots"]))
        if key not in seen:
            seen.add(key)
            out.append(rot)
    _ROT_CACHE[species] = out
    return out


def _plant_action(player_id: str, idx: BoardIndex, sp: str, c: int, rot: int, seed_cell: Optional[int]) -> PlantAction:
    q, r = idx.coords[c]
    seed = Position(q=idx.coords[seed_cell][0], r=idx.coords[seed_cell][1]) if seed_cell is not None else None
    return PlantAction(playerId=player_id, species=sp, pos=Position(q=q, r=r), rotation=rot, seed=seed)  # type: ignore[arg-type]


def choose_plant(state: GameState, player_id: str, deadline: float) -> tuple[Action, int]:
    """(심기·버리기 행동, 탐색 깊이). 시간이 모자라면 엔진 자동 수. 심을 칸이 없으면 첫 손 카드를 버린다."""
    me = get_player(state, player_id)
    assert me is not None and state.board is not None
    ev = _Evaluator(state, player_id, deadline)
    try:
        best = ev.best(list(me.hand), with_seeds=True)
    except _OutOfTime:
        auto = auto_action(state, player_id)
        return (auto if auto is not None else DiscardAction(playerId=player_id, species=me.hand[0])), 0  # type: ignore[arg-type]
    if best is None:
        return DiscardAction(playerId=player_id, species=me.hand[0]), 1  # type: ignore[arg-type]
    _, sp, c, rot, x = best
    return _plant_action(player_id, ev.idx, sp, c, rot, x), 1


def unseen_cards(state: GameState, player_id: str) -> dict[str, int]:
    """이 사람이 아직 보지 못한 카드(카드 더미 + 남의 손) 종별 장수. 전체 − 보드에 심은 카드 − 마켓 − 내 손.
    버린 카드는 상태에 남지 않아 빼지 않는다(드물다). 남의 손 카드도 못 본 카드라 함께 센다.
    더미 순서·내용은 쓰지 않는다(사람과 같은 정보)."""
    copies = int(rules_for(len(state.players))["copies"])
    left = {sp: copies for sp in state.species}
    me = get_player(state, player_id)
    for sp in [*(p.species for p in state.plants), *state.market, *(me.hand if me else [])]:
        if sp in left:
            left[sp] -= 1
    return {sp: n for sp, n in left.items() if n > 0}


def choose_take(state: GameState, player_id: str, deadline: float) -> tuple[int | str, int]:
    """(가져올 마켓 자리 또는 "pile", 탐색 깊이). 시간 안에 다 평가하지 못하면 0번.
    후보 카드마다 "손 카드 + 그 카드 중 최선 1수 가치 + 공개 목표 연계 가산"을 매긴다(씨앗은 빼고 빠르게).
    같은 값이면 그 카드 자체의 1수 가치가 큰 쪽(남겨 두어도 쓸모), 그래도 같으면 앞 자리.
    카드 더미 뒷면은 못 본 카드 분포의 기댓값이 마켓 최선보다 클 때만 고른다."""
    me = get_player(state, player_id)
    if not state.market or me is None or state.board is None:
        return 0, 0
    ev = _Evaluator(state, player_id, deadline)
    best_i: int | str = 0
    try:
        no_move = ev.base() - 100
        hand_best = ev.best(list(me.hand), with_seeds=False)
        hand_v = hand_best[0] if hand_best else no_move
        own_cache: dict[str, float] = {}

        def card_key(sp: str) -> tuple[float, float]:
            if sp not in own_cache:
                own = ev.best([sp], with_seeds=False)
                own_cache[sp] = own[0] if own else no_move
            own_v = own_cache[sp]
            return (max(own_v, hand_v) + take_goal_bonus(state, player_id, sp), own_v)

        best_key: Optional[tuple[float, float]] = None
        for i, sp in enumerate(state.market):
            key = card_key(sp)
            if best_key is None or key > best_key:
                best_key = key
                best_i = i
        # 서버가 가린 상태는 pile 이 비고 pileCount 만 있다
        pile_n = len(state.pile) or (state.pileCount or 0)
        # 1수 탐욕 근사: 마켓 카드를 남겨 두는 손해(다음 사람이 가져감)는 보지 않는다
        unseen = unseen_cards(state, player_id) if pile_n else {}
        total = sum(unseen.values())
        if total and best_key is not None:
            keys = {sp: card_key(sp) for sp in unseen}
            expect = (
                sum(n * keys[sp][0] for sp, n in unseen.items()) / total,
                sum(n * keys[sp][1] for sp, n in unseen.items()) / total,
            )
            if expect > best_key:
                best_i = "pile"
    except _OutOfTime:
        # 더미 기댓값 도중에 끊기면 그때까지의 마켓 최선을 쓴다
        return best_i, 0
    return best_i, 1


def _fallback(state: GameState, player_id: str) -> Action:
    """내 차례가 아니거나 둘 수 없는 상태. 엔진 자동 수와 같은 수, 그것도 없으면 엔진이 거부해도 해가 없는 행동."""
    auto = auto_action(state, player_id)
    if auto is not None:
        return auto
    return ReadyAction(playerId=player_id)


def decide(state: GameState, player_id: str, time_limit_ms: int) -> tuple[Action, int, int]:
    """(행동, 깊이, 걸린 시간 ms). 항상 시간 제한 안에 돌려준다."""
    start = time.perf_counter()
    budget_ms = max(50.0, time_limit_ms * _TIME_FRACTION - _TIME_MARGIN_MS)
    deadline = start + budget_ms / 1000.0

    action: Action
    depth = 0
    me = get_player(state, player_id)
    my_turn = (
        state.currentPlayerId == player_id
        and state.phase == "playing"
        and state.board is not None
        and me is not None
        and me.surrenderedOrder is None
    )
    if my_turn and state.stage == "take" and state.market:
        take, depth = choose_take(state, player_id, deadline)
        action = TakeAction(playerId=player_id, take=take)
    elif my_turn and state.stage == "plant" and me is not None and me.hand:
        action, depth = choose_plant(state, player_id, deadline)
    else:
        action = _fallback(state, player_id)
    elapsed_ms = int((time.perf_counter() - start) * 1000)
    return action, depth, elapsed_ms
