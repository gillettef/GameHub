"""
shared/fixtures/*.json (TS 엔진 출력) 을 읽어 Python 모델·규칙이 TS 와 일치하는지 검증한다.
픽스처가 바뀌면 `npx tsx shared/scripts/write-fixtures.ts` 로 다시 생성한다.
"""

import json
from pathlib import Path

import pytest

from astral_ai.models import GameState
from astral_ai.rules import compute_production, compute_scores, compute_territory, load_specs

FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def started() -> GameState:
    return GameState.model_validate(_load("started-state.json"))


@pytest.fixture
def after_end_turn() -> GameState:
    return GameState.model_validate(_load("after-end-turn.json"))


def test_started_state_matches_ts_schema(started: GameState) -> None:
    # extra="forbid" 이므로 TS 에만 있는 필드가 생기면 여기서 실패한다
    assert started.phase == "playing"
    assert started.turn == 1
    assert len(started.players) == 2
    assert len(started.buildings) == 2
    assert [b.specId for b in started.buildings] == ["main-base", "main-base"]


def test_roundtrip_is_lossless(started: GameState) -> None:
    raw = _load("started-state.json")
    assert started.model_dump(mode="json") == raw


def test_specs_load_and_cover_deck(started: GameState) -> None:
    specs = load_specs()
    for p in started.players:
        for card in p.hand + p.deck:
            table = {"building": specs.buildings, "unit": specs.units, "magic": specs.magics}[card.type]
            assert card.specId in table, f"{card.type}:{card.specId} 스펙 없음"


def test_production_matches_ts(started: GameState, after_end_turn: GameState) -> None:
    """한 바퀴 뒤 2턴 진입 시 TS 가 p1 에게 더해 준 생산량 == Python 계산. 1턴에는 생산이 없다."""
    assert after_end_turn.turn == 2
    assert after_end_turn.currentPlayerId == "p1"
    before = next(p for p in started.players if p.id == "p1")
    after = next(p for p in after_end_turn.players if p.id == "p1")
    prod = compute_production(started, "p1")
    assert after.resources - before.resources == prod.resources
    assert after.mana - before.mana == prod.mana
    assert len(after.hand) == len(before.hand) + 1
    assert prod.resources == 1 and prod.mana == 1  # 메인 기지만 보유
    # ai-1 은 아직 2턴 시작 전이므로 시작 자원 그대로
    ai_after = next(p for p in after_end_turn.players if p.id == "ai-1")
    assert ai_after.resources == 10 and ai_after.mana == 5


def test_territory_and_scores(started: GameState) -> None:
    territory = compute_territory(started)
    assert len(territory["p1"]) == 9
    assert len(territory["ai-1"]) == 9
    scores = compute_scores(started)
    assert scores["p1"] == {"territory": 9, "buildings": 0, "total": 9}
    assert scores["ai-1"] == scores["p1"]


def test_rejects_unknown_field() -> None:
    raw = _load("started-state.json")
    raw["unexpected"] = 1
    with pytest.raises(Exception):
        GameState.model_validate(raw)
