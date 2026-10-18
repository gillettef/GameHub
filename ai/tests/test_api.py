"""FastAPI /health, /decide 가 시간 제한 안에 합법 수를 돌려주는지 확인한다."""

from __future__ import annotations

import json
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from pydantic import TypeAdapter

from astral_ai.main import app
from astral_ai.models import Action, GameState
from astral_ai.rules import apply_action

client = TestClient(app)
FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures"
ACTION: TypeAdapter[Any] = TypeAdapter(Action)
LIMIT_MS = 2000


@lru_cache(maxsize=1)
def _scenarios() -> list[dict[str, Any]]:
    return json.loads((FIXTURES / "scenario.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _replayed_states() -> list[dict[str, Any]]:
    """시나리오를 Python 규칙으로 재생한 진행 중 상태 전부 (가져오기·심기 단계, 마켓이 빈 라운드, 기권 뒤 포함)."""
    out: list[dict[str, Any]] = []
    for sc in _scenarios():
        state = GameState.model_validate(sc["initial"])
        for step in sc["steps"]:
            if state.phase == "playing":
                out.append(state.model_dump(mode="json"))
            state, err = apply_action(state, ACTION.validate_python(step["action"]))
            assert err is None
    return out


def _stage(stage: str, market: bool | None = None) -> list[dict[str, Any]]:
    states = [s for s in _replayed_states() if s["stage"] == stage]
    if market is not None:
        states = [s for s in states if bool(s["market"]) == market]
    assert states
    return states


def _sample(states: list[dict[str, Any]], n: int) -> list[dict[str, Any]]:
    return states[:: max(1, len(states) // n)]


def _assert_legal(state: dict[str, Any], action: dict[str, Any]) -> None:
    _, err = apply_action(GameState.model_validate(state), ACTION.validate_python(action))
    assert err is None, err


def _post(state: dict[str, Any], player_id: str, limit_ms: int = LIMIT_MS) -> dict[str, Any]:
    start = time.perf_counter()
    res = client.post("/decide", json={"state": state, "playerId": player_id, "timeLimitMs": limit_ms})
    wall_ms = (time.perf_counter() - start) * 1000
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["elapsedMs"] < limit_ms
    assert wall_ms < max(limit_ms, LIMIT_MS)
    return body


def _mask_for(state: dict[str, Any], viewer: str) -> dict[str, Any]:
    """shared/src/mask.ts maskState(state, viewerId) 와 같은 모양: 시드·더미 가림, 남의 손은 장수만."""
    s = json.loads(json.dumps(state))
    s["rngSeed"] = 0
    s["deckSeed"] = []
    s["pileCount"] = len(s["pile"])
    s["pile"] = []
    for p in s["players"]:
        p["handCount"] = len(p["hand"])
        if p["id"] != viewer:
            p["hand"] = []
    return s


def test_health() -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "service": "rootbound-ai"}


def test_decide_confirms_in_reveal() -> None:
    for sc in _scenarios():
        state = sc["initial"]
        assert state["phase"] == "reveal"
        action = _post(_mask_for(state, "p0"), "p0")["action"]
        assert action == {"type": "CONFIRM", "playerId": "p0"}
        _assert_legal(state, action)


def test_decide_take_stage_returns_take() -> None:
    for state in _sample(_stage("take"), 10):
        pid = state["currentPlayerId"]
        action = _post(state, pid)["action"]
        assert action["type"] == "TAKE" and action["playerId"] == pid
        take = action["take"]
        assert (take == "pile" and bool(state["pile"])) or (isinstance(take, int) and 0 <= take < len(state["market"]))
        _assert_legal(state, action)


def test_decide_plant_stage_is_legal_and_omits_none_fields() -> None:
    states = _sample(_stage("plant", market=True), 8) + _sample(_stage("plant", market=False), 4)
    for state in states:
        pid = state["currentPlayerId"]
        action = _post(state, pid)["action"]
        assert action["playerId"] == pid
        assert action["type"] in {"PLANT", "DISCARD"}
        # 심기 단계에는 take 가 없다. TS 검증은 null 을 "값 있음"으로 보므로 None 필드는 빠져 있어야 한다
        assert "take" not in action
        if action["type"] == "PLANT":
            assert action.get("rotation", 0) in range(6)
            assert action.get("seed", {}) is not None
            if action["species"] != "dandelion":
                assert "seed" not in action
        _assert_legal(state, action)


def test_take_prefers_reserve_species() -> None:
    # 목표 연계 가산: 보호구역 종이 마켓에 있으면 다른 조건이 같을 때 그 카드를 고른다
    from astral_ai.search import take_goal_bonus

    state = GameState.model_validate(_scenarios()[0]["initial"])
    reserve = next(g for g in state.goals if g.endswith("-reserve"))
    sp = reserve[: -len("-reserve")]
    pid = state.players[0].id
    others = [x for x in state.species if x != sp]
    assert take_goal_bonus(state, pid, sp) > max(take_goal_bonus(state, pid, x) for x in others)


def test_take_counts_hand_and_candidate() -> None:
    # 가져오기 평가는 "손 카드 + 후보 카드 중 최선 1수". 같은 종 두 장이면 앞 자리만 본다
    from astral_ai.search import choose_take

    state = GameState.model_validate(_stage("take")[0])
    pid = state.currentPlayerId
    assert pid is not None
    # 카드 더미가 비면 더미 뒷면은 후보가 아니다
    dup = state.model_copy(update={"market": [state.market[0], state.market[0]], "pile": []})
    take, depth = choose_take(dup, pid, time.perf_counter() + 1.0)
    assert take == 0 and depth == 1


def test_take_pile_uses_unseen_distribution_not_pile_order() -> None:
    # 더미 뒷면 평가는 못 본 카드 분포만 쓴다: 더미 순서를 바꿔도, 가려서 pileCount 만 남겨도 고르는 수가 같다
    from astral_ai.search import choose_take, unseen_cards

    for raw in _sample(_stage("take"), 6):
        state = GameState.model_validate(raw)
        pid = state.currentPlayerId
        assert pid is not None
        me = next(p for p in state.players if p.id == pid)
        unseen = unseen_cards(state, pid)
        assert sum(unseen.values()) >= len(state.pile)
        assert all(n > 0 for n in unseen.values()) and set(unseen) <= set(state.species)
        assert all(sp in state.species for sp in me.hand)
        a, _ = choose_take(state, pid, time.perf_counter() + 1.0)
        b, _ = choose_take(state.model_copy(update={"pile": list(reversed(state.pile))}), pid, time.perf_counter() + 1.0)
        c, _ = choose_take(state.model_copy(update={"pile": [], "pileCount": len(state.pile)}), pid, time.perf_counter() + 1.0)
        assert a == b == c


def test_decide_with_server_masked_states() -> None:
    # 서버는 AI 에 maskState(state, aiId) 를 보낸다. 가져오기·심기 단계, 마켓이 빈 라운드, 기권 뒤 상태 모두 합법 수여야 한다
    states = _replayed_states()
    sample = _sample(_stage("take"), 6) + _sample(_stage("plant", market=True), 4) + _sample(_stage("plant", market=False), 3)
    assert any(p["surrenderedOrder"] is not None for s in states for p in s["players"])
    sample += [s for s in states if any(p["surrenderedOrder"] is not None for p in s["players"])][:3]
    for state in sample:
        pid = state["currentPlayerId"]
        masked = _mask_for(state, pid)
        action = _post(masked, pid)["action"]
        assert action["type"] == ("TAKE" if state["stage"] == "take" else action["type"])
        if state["stage"] == "plant":
            assert action["type"] in {"PLANT", "DISCARD"}
        # 가리지 않은 원본 상태에 적용해도 합법이다 (엔진은 원본에 적용한다)
        _assert_legal(state, action)
    # 가린 필드는 모델에 남되 직렬화에서는 빠진다
    model = GameState.model_validate(_mask_for(sample[0], sample[0]["currentPlayerId"]))
    assert model.pileCount == len(sample[0]["pile"]) and "pileCount" not in model.model_dump()


def test_decide_ignores_old_draft_fields() -> None:
    # 예전 형식 필드(drafted/deck/draftOrder)가 섞여 와도 무시한다
    state = json.loads(json.dumps(_stage("plant")[0]))
    state["draftOrder"] = ["p0"]
    state["draftIndex"] = 0
    for p in state["players"]:
        p["drafted"] = ["grass"]
        p["deck"] = ["grass"]
    body = _post(state, state["currentPlayerId"])
    _assert_legal(state, body["action"])


def test_decide_respects_tiny_time_limit() -> None:
    for state in (_stage("take")[0], _stage("plant")[len(_stage("plant")) // 2]):
        action = _post(state, state["currentPlayerId"], limit_ms=100)["action"]
        assert action["type"] == ("TAKE" if state["stage"] == "take" else action["type"])
        _assert_legal(state, action)


def test_decide_not_my_turn_falls_back_harmlessly() -> None:
    # 내 차례가 아니면 엔진이 거부해도 해가 없는 행동을 돌려준다
    state = _stage("take")[0]
    other = next(p["id"] for p in state["players"] if p["id"] != state["currentPlayerId"])
    action = _post(state, other)["action"]
    assert action["type"] in {"READY", "CONFIRM", "TAKE", "PLANT", "DISCARD"}


def test_decide_rejects_invalid_payload() -> None:
    res = client.post("/decide", json={"state": {}, "playerId": "p1"})
    assert res.status_code == 422
