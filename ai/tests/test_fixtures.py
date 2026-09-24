"""
shared/fixtures/*.json (TS 엔진 출력) 을 읽어 Python 모델·규칙이 TS 와 일치하는지 검증한다.
픽스처가 바뀌면 `npm run fixtures` 로 다시 생성한다.
"""

import json
from pathlib import Path

import pytest

from astral_ai.models import Action, Board, GameState, Marker, PassAction, PlaceAction, PlayerState, Position
from astral_ai.rules import (
    apply_action,
    compute_income,
    compute_ranking,
    compute_scores,
    compute_sight_area,
    compute_territory,
    legal_actions,
    load_specs,
    sort_markers,
    strip_log,
    validate_placement,
)
from pydantic import TypeAdapter

FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures"
ACTION = TypeAdapter(Action)


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def started() -> GameState:
    return GameState.model_validate(_load("started-state.json"))


@pytest.fixture
def first_turn() -> GameState:
    return GameState.model_validate(_load("first-turn.json"))


@pytest.fixture
def scenario() -> dict:
    return _load("scenario.json")


def test_specs_load(started: GameState) -> None:
    specs = load_specs()
    assert specs.constants["STARTING_ENERGY"] == 5
    assert specs.cards["core"].hp == 20
    # 5종족(coalition/swarm/automata/shade/siege) × (기본 10종 + 특수 9종) = 95
    assert len([c for c in specs.cards.values() if c.kind != "core"]) == 95
    assert len(specs.maps) == 6
    for p in started.players:
        for card in p.hand + p.deck:
            assert card in specs.cards, f"{card} 스펙 없음"


def test_started_state_matches_ts_schema(started: GameState) -> None:
    # extra="forbid" 이므로 TS 에만 있는 필드가 생기면 여기서 실패한다
    assert started.phase == "playing"
    assert started.turn == 1 and started.round == 1
    assert len(started.players) == 2
    assert [m.kind for m in started.markers] == ["core", "core"]
    for p in started.players:
        assert p.energy == 5 and len(p.hand) == 4 and len(p.deck) == 21


def test_roundtrip_is_lossless(started: GameState, first_turn: GameState) -> None:
    assert started.model_dump(mode="json") == _load("started-state.json")
    assert first_turn.model_dump(mode="json") == _load("first-turn.json")


def test_rejects_unknown_field() -> None:
    raw = _load("started-state.json")
    raw["unexpected"] = 1
    with pytest.raises(Exception):
        GameState.model_validate(raw)


def test_first_turn_has_no_automatic_effects(started: GameState, first_turn: GameState) -> None:
    """2026-09-23부터 startGame == setupGame — 자동 효과는 "턴 시작"이 아니라 그 플레이어가
    자기 턴을 끝낼 때 처리되므로, 게임 시작 시점에는 첫 플레이어에게도 아무 보너스가 없다."""
    assert first_turn.model_dump(mode="json") == started.model_dump(mode="json")


def test_pass_resolves_own_income_and_draw(started: GameState) -> None:
    """턴을 끝내면 그 순간 자기 수입·드로우가 즉시 처리된다 (Rules.md 5.2, 2026-09-23)."""
    p0_before = next(p for p in started.players if p.id == "p0")
    after = apply_action(started, PassAction(type="PASS", playerId="p0"))
    p0_after = next(p for p in after.players if p.id == "p0")
    assert p0_after.energy - p0_before.energy == compute_income(started, "p0") == 1
    assert len(p0_after.hand) == len(p0_before.hand) + 1
    assert p0_after.hand[:4] == p0_before.hand and p0_after.hand[4] == p0_before.deck[0]


def test_sight_territory_scores(started: GameState) -> None:
    # 코어 시야 1 → 육각 반경 1 = 7칸 (3r(r+1)+1)
    assert len(compute_sight_area(started, "p0")) == 7
    t = compute_territory(started)
    assert t.counts == {"p0": 7, "ai-1": 7}
    assert t.owners[2][2] == "p0" and t.owners[5][5] is None
    scores = compute_scores(started)
    assert scores["p0"].model_dump() == {"territory": 7, "markers": 0, "komi": 0, "total": 7}
    assert compute_ranking(started) == ["ai-1", "p0"]  # ai-1(좌석1)이 덤 1점 앞선다


def test_scenario_replays_identically(scenario: dict) -> None:
    """TS 가 기록한 액션 시퀀스를 Python 으로 재생하면 (로그 제외) 매 단계 같은 상태가 나온다."""
    state = GameState.model_validate(scenario["initial"])
    for i, step in enumerate(scenario["steps"]):
        action = ACTION.validate_python(step["action"])
        expected = GameState.model_validate(step["state"])
        state = apply_action(state, action)
        assert strip_log(state) == strip_log(expected), f"{i}번째 액션 {step['action']} 이후 상태 불일치"
    assert state.phase == "finished"
    assert state.result is not None and state.result.reason == "last-survivor"


def test_apply_action_is_pure(scenario: dict) -> None:
    state = GameState.model_validate(scenario["initial"])
    snapshot = state.model_dump(mode="json")
    apply_action(state, ACTION.validate_python(scenario["steps"][0]["action"]))
    assert state.model_dump(mode="json") == snapshot


def test_illegal_actions_raise(first_turn: GameState) -> None:
    with pytest.raises(ValueError):
        apply_action(first_turn, PassAction(type="PASS", playerId="ai-1"))  # p0 턴
    assert validate_placement(first_turn, "p0", "core", Position(x=3, y=3)) == "not-in-hand"
    assert validate_placement(first_turn, "p0", first_turn.players[0].hand[0], Position(x=9, y=9)) in {
        "out-of-sight", "not-enough-energy",
    }


def test_legal_actions_end_with_pass(first_turn: GameState) -> None:
    actions = legal_actions(first_turn, "p0")
    assert isinstance(actions[-1], PassAction)
    for a in actions[:-1]:
        assert isinstance(a, PlaceAction)
        assert validate_placement(first_turn, "p0", a.cardId, a.pos) is None
    assert legal_actions(first_turn, "ai-1") == []


# --- 은신(veil)·다중 포격(barrage) 대상 선택 (Rules.md 7.1, engine.test.ts '전투 (F023)' 사본) --------


def _player(pid: str, seat: int) -> PlayerState:
    return PlayerState(
        id=pid, nickname=pid, kind="human", seat=seat, isReady=True, race="coalition",
        energy=10, deck=[], hand=[], discard=[], alive=True, eliminatedOrder=None,
        passed=False, actedThisTurn=False,
    )


def _combat_state(markers: list[Marker]) -> GameState:
    """전투만 검증하는 최소 상태: p0 턴에 PASS 하면 그 자리에서 p0 마커가 자동 공격한다."""
    return GameState(
        roomId="r", phase="playing", mapId="binary-star",
        board=Board(width=10, height=10, asteroids=[], veins=[]), roundLimit=20,
        round=1, turn=1, currentPlayerId="p0",
        players=[_player("p0", 0), _player("p1", 1)],
        markers=sort_markers(markers), nextMarkerId=100, rngSeed=1, result=None, log=[],
    )


def _marker(owner: str, spec_id: str, x: int, y: int, hp: int | None = None) -> Marker:
    sp = load_specs().spec(spec_id)
    return Marker(id=f"{owner}-{spec_id}-{x}-{y}", specId=spec_id, kind=sp.kind, ownerId=owner, pos=Position(x=x, y=y), hp=hp if hp is not None else sp.hp, remainingTurns=None)


def _by_spec(state: GameState, spec_id: str) -> Marker | None:
    return next((m for m in state.markers if m.specId == spec_id), None)


def test_veil_target_excluded_while_non_veiled_candidate_remains() -> None:
    s = _combat_state([
        _marker("p0", "fighter", 5, 5),
        _marker("p1", "wisp", 6, 5),  # veil, d=1, hp1
        _marker("p1", "scout", 5, 6),  # 비은신, d=1, hp2
    ])
    t = apply_action(s, PassAction(type="PASS", playerId="p0"))
    assert _by_spec(t, "wisp") is not None  # 은신은 무사
    assert _by_spec(t, "scout") is None  # 비은신이 대신 파괴


def test_veil_all_candidates_veiled_falls_back_to_normal_priority() -> None:
    s = _combat_state([
        _marker("p0", "fighter", 5, 5),
        _marker("p1", "wisp", 6, 5),
        _marker("p1", "wisp", 5, 6),
    ])
    t = apply_action(s, PassAction(type="PASS", playerId="p0"))
    survivors = [m for m in t.markers if m.specId == "wisp"]
    assert len(survivors) == 1
    assert (survivors[0].pos.x, survivors[0].pos.y) == (5, 6)  # y 오름차순 우선 → (6,5)가 먼저 죽는다


def test_barrage_hits_primary_and_next_priority_target() -> None:
    s = _combat_state([
        _marker("p0", "howitzer", 5, 5),
        _marker("p1", "scout", 6, 5),  # d=1, hp2 → 주 표적
        _marker("p1", "cruiser", 5, 6),  # d=1, hp7 → 다음 순위
    ])
    t = apply_action(s, PassAction(type="PASS", playerId="p0"))
    assert _by_spec(t, "scout") is None
    cruiser = _by_spec(t, "cruiser")
    assert cruiser is not None and cruiser.hp == 5  # howitzer 공격력 2, 한 번 맞음


def test_barrage_with_single_candidate_hits_only_once() -> None:
    s = _combat_state([
        _marker("p0", "howitzer", 4, 3),
        _marker("p1", "cruiser", 5, 3, hp=7),  # 유일한 후보. 두 번 맞으면 hp<=3
    ])
    t = apply_action(s, PassAction(type="PASS", playerId="p0"))
    cruiser = _by_spec(t, "cruiser")
    assert cruiser is not None and cruiser.hp == 5


def test_barrage_secondary_target_also_respects_veil() -> None:
    s = _combat_state([
        _marker("p0", "howitzer", 4, 3),
        _marker("p1", "cruiser", 5, 3, hp=7),  # 비은신, 유일한 비은신 후보
        _marker("p1", "wisp", 4, 2),  # 은신 → 다음 순위에서도 제외
    ])
    t = apply_action(s, PassAction(type="PASS", playerId="p0"))
    cruiser = _by_spec(t, "cruiser")
    assert cruiser is not None and cruiser.hp == 5  # 한 번만 맞음
    wisp = _by_spec(t, "wisp")
    assert wisp is not None and wisp.hp == 1  # 은신이라 전혀 안 맞음
