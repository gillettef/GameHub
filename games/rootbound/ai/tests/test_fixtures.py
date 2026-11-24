"""
shared/fixtures/*.json (TS 엔진 출력) 을 읽어 Python 모델·규칙이 TS 와 일치하는지 검증한다.
픽스처가 바뀌면 `npm run fixtures` 로 다시 생성한다.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import pytest
from pydantic import TypeAdapter

from astral_ai.models import Action, ConfirmAction, GameState, SurrenderAction, TakeAction
from astral_ai.rules import (
    apply_action,
    auto_action,
    compute_owners,
    compute_ranking,
    compute_scores,
    legal_plant_cells,
    load_specs,
    next_round_start,
    rules_for,
    supply_left,
    next_random,
    shuffle,
)

FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures"
ACTION: TypeAdapter[Any] = TypeAdapter(Action)


@lru_cache(maxsize=1)
def _scenarios() -> list[dict[str, Any]]:
    return json.loads((FIXTURES / "scenario.json").read_text(encoding="utf-8"))


def _strip_log(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if k != "log"}


def test_specs_load() -> None:
    specs = load_specs()
    assert len(specs.species_ids) == 9
    assert len(specs.goal_species) == 16
    assert all(s["roots"][0]["dq"] == 0 and s["roots"][0]["dr"] == 0 for s in specs.species.values())
    assert specs.constants["START_HAND"] == 1
    assert "HAND_SIZE" not in specs.constants
    assert set(specs.player_count_rules) == {2, 3, 4}


def test_rng_is_deterministic() -> None:
    # mulberry32 는 32비트 정수 연산이라 결과가 항상 같아야 한다
    v1, s1 = next_random(12345)
    v2, s2 = next_random(12345)
    assert (v1, s1) == (v2, s2)
    assert 0 <= v1 < 1
    items, _ = shuffle(list(range(10)), 7)
    assert sorted(items) == list(range(10))


@pytest.mark.parametrize("which", [0, 1, 2])
def test_scenario_replay_matches_ts(which: int) -> None:
    sc = _scenarios()[which]
    state = GameState.model_validate(sc["initial"])
    checked_states = 0
    for i, step in enumerate(sc["steps"]):
        action = ACTION.validate_python(step["action"])
        state, err = apply_action(state, action)
        assert err is None, f"{sc['players']}인 {i}단계: {err}"

        if step["state"] is not None:
            mine = _strip_log(state.model_dump(mode="json"))
            assert mine == _strip_log(step["state"]), f"{sc['players']}인 {i}단계 상태 불일치"
            checked_states += 1

        if step["rootSeat"] is not None:
            assert state.rootSeat == step["rootSeat"], f"{sc['players']}인 {i}단계 큐브 색 불일치"
            assert state.rootCount == step["rootCount"], f"{sc['players']}인 {i}단계 큐브 수 불일치"
            assert compute_owners(state) == step["owners"], f"{sc['players']}인 {i}단계 땅 불일치"
            scores = {pid: s.model_dump() for pid, s in compute_scores(state).items()}
            assert scores == step["scores"], f"{sc['players']}인 {i}단계 점수 불일치"

        if step["legal"] is not None:
            pid = state.currentPlayerId
            assert pid is not None
            for sp, cells in step["legal"].items():
                mine_cells = [p.model_dump() for p in legal_plant_cells(state, pid, sp)]
                assert mine_cells == cells, f"{sc['players']}인 {i}단계 {sp} 심을 수 있는 칸 불일치"

        if step["auto"] is not None:
            pid = state.currentPlayerId
            assert pid is not None
            auto = auto_action(state, pid)
            assert auto is not None
            assert auto.model_dump(exclude_none=True) == step["auto"], f"{sc['players']}인 {i}단계 자동 수 불일치"

    assert state.phase == "finished"
    assert checked_states >= 2
    assert state.result is not None
    assert compute_ranking(state) == state.result.ranking


def _confirmed(sc: dict[str, Any]) -> GameState:
    """공개 단계에서 사람 둘이 확인해 1라운드 가져오기 단계가 된 상태."""
    state = GameState.model_validate(sc["initial"])
    for p in state.players:
        if not p.isReady:
            state, err = apply_action(state, ConfirmAction(playerId=p.id))
            assert err is None
    assert state.phase == "playing" and state.stage == "take" and state.round == 1
    return state


def test_reveal_waits_for_every_confirm() -> None:
    for sc in _scenarios():
        state = GameState.model_validate(sc["initial"])
        assert state.phase == "reveal" and state.round == 0 and state.currentPlayerId is None
        start_hand = load_specs().constants["START_HAND"]
        assert all(len(p.hand) == start_hand for p in state.players)
        # AI 는 처음부터 확인함, 사람(자리 0·1)은 아직
        assert [p.isReady for p in state.players] == [p.kind == "ai" for p in state.players]
        assert auto_action(state, "p0") == ConfirmAction(playerId="p0")
        # 공개 단계에서는 가져오기·심기를 받지 않는다
        _, err = apply_action(state, TakeAction(playerId="p0", take=0))
        assert err is not None
        one, err = apply_action(state, ConfirmAction(playerId="p0"))
        assert err is None and one.phase == "reveal"
        # 두 번 확인은 거부, 확인한 사람의 자동 수는 없다
        _, err = apply_action(one, ConfirmAction(playerId="p0"))
        assert err is not None
        assert auto_action(one, "p0") is None
        both, err = apply_action(one, ConfirmAction(playerId="p1"))
        assert err is None
        assert both.phase == "playing" and both.stage == "take" and both.round == 1
        assert both.roundStart == 0 and both.currentPlayerId == "p0"
        # 마켓은 준비 때 이미 펼쳐 둔다 (Rules.md 4절 7)
        assert both.market == state.market and len(state.market) == rules_for(len(state.players))["market"]


def test_surrender_in_reveal_starts_when_rest_confirmed() -> None:
    sc = _scenarios()[2]  # 4인: 사람 둘 + AI 둘
    state = GameState.model_validate(sc["initial"])
    state, err = apply_action(state, ConfirmAction(playerId="p0"))
    assert err is None
    # 확인하지 않은 사람이 기권하면 남은 사람이 모두 확인했으므로 시작한다 (마켓은 그대로)
    state, err = apply_action(state, SurrenderAction(playerId="p1"))
    assert err is None
    assert state.phase == "playing" and len(state.market) == rules_for(4)["market"]


def test_rejects_illegal_actions() -> None:
    sc = _scenarios()[0]
    state = _confirmed(sc)
    pid = state.currentPlayerId
    assert pid is not None
    other = next(p.id for p in state.players if p.id != pid)
    me = next(p for p in state.players if p.id == pid)

    def rejected(action: dict[str, Any]) -> None:
        after, err = apply_action(state, ACTION.validate_python(action))
        assert err is not None, action
        assert after is state

    # 남의 차례 / 없는 자리
    rejected({"type": "TAKE", "playerId": other, "take": 0})
    rejected({"type": "TAKE", "playerId": pid, "take": len(state.market)})
    rejected({"type": "TAKE", "playerId": pid, "take": -1})
    # 가져오기 단계에서는 심거나 버릴 수 없다
    board = state.board
    assert board is not None
    cell = legal_plant_cells(state, pid, me.hand[0])[0]
    rejected({"type": "PLANT", "playerId": pid, "species": me.hand[0], "pos": cell.model_dump()})
    rejected({"type": "DISCARD", "playerId": pid, "species": me.hand[0]})
    # 공개 단계가 아니면 확인할 수 없다
    rejected({"type": "CONFIRM", "playerId": pid})
    # 예전 드래프트 행동은 더 이상 없다
    with pytest.raises(Exception):
        ACTION.validate_python({"type": "DRAFT", "playerId": pid, "species": "grass"})


def test_take_refills_market_then_same_player_plants() -> None:
    sc = _scenarios()[0]
    state = _confirmed(sc)
    pid = state.currentPlayerId
    assert pid is not None
    me = next(p for p in state.players if p.id == pid)
    take = len(state.market) - 1
    card = state.market[take]
    after, err = apply_action(state, TakeAction(playerId=pid, take=take))
    assert err is None
    # 가져간 자리는 더미 맨 위 카드로 채운다
    assert after.market == [*state.market[:take], state.pile[0]]
    assert after.pile == state.pile[1:]
    assert next(p for p in after.players if p.id == pid).hand == [*me.hand, card]
    # 같은 사람이 이어서 심는다. 다시 가져올 수는 없다
    assert after.stage == "plant" and after.currentPlayerId == pid
    _, err = apply_action(after, TakeAction(playerId=pid, take=0))
    assert err is not None
    planted = auto_action(after, pid)
    assert planted is not None
    nxt, err = apply_action(after, planted)
    assert err is None
    assert nxt.currentPlayerId != pid and nxt.stage == "take"


def test_new_round_lead_has_most_supply_left() -> None:
    for sc in _scenarios():
        state = GameState.model_validate(sc["initial"])
        P = len(state.players)
        rounds = 0
        for step in sc["steps"]:
            prev = state
            state, err = apply_action(state, ACTION.validate_python(step["action"]))
            assert err is None
            if state.phase == "playing" and state.round == prev.round + 1 and prev.phase == "playing":
                rounds += 1
                # 새 선 = 마지막 수를 둔 뒤 공급처에 큐브가 가장 많이 남은 사람, 동점이면 지난 선 다음 자리부터
                ended = state.model_copy(update={"roundStart": prev.roundStart})
                assert state.roundStart == next_round_start(ended)
                left = supply_left(state)
                active = [p for p in state.players if p.surrenderedOrder is None]
                most = max(left[p.seat] for p in active)
                lead = next(p for p in state.players if p.seat == state.roundStart)
                assert lead.surrenderedOrder is None and left[lead.seat] == most
                by_seat = sorted(state.players, key=lambda p: p.seat)
                order = [by_seat[(state.roundStart + k) % P] for k in range(P)]
                first = next(p for p in order if p.surrenderedOrder is None and (p.hand or state.market))
                assert state.currentPlayerId == first.id
                assert state.stage == ("take" if state.market else "plant")
        assert rounds >= 5


def test_cubes_never_exceed_supply() -> None:
    for sc in _scenarios():
        state = GameState.model_validate(sc["initial"])
        for step in sc["steps"]:
            state, err = apply_action(state, ACTION.validate_python(step["action"]))
            assert err is None
            assert all(v >= 0 for v in supply_left(state))
            # 한 칸에는 한 색만: 큐브가 없으면 색도 없다
            assert all((n > 0) == (s >= 0) for s, n in zip(state.rootSeat, state.rootCount))


def test_next_round_start_tie_breaks_clockwise() -> None:
    # 공급처가 모두 같으면(시작 직후) 지난 선 다음 자리부터 시계방향 첫 사람, 지난 선은 마지막 후보
    sc = _scenarios()[2]
    state = _confirmed(sc)
    assert len(set(supply_left(state))) == 1
    assert next_round_start(state) == 1
    # 기권자는 선이 될 수 없다
    sur = state.model_copy(update={"players": [p.model_copy(update={"surrenderedOrder": 0}) if p.seat == 1 else p for p in state.players]})
    assert next_round_start(sur) == 2
