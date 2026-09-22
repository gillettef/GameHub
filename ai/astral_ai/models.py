"""
shared/src/types/index.ts 와 1:1로 맞추는 Pydantic 모델.
TS 쪽 필드를 추가하면 여기도 함께 갱신한다. 일치 여부는 tests/test_fixtures.py 가 검증한다.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

PlayerKind = Literal["human", "ai"]
GamePhase = Literal["lobby", "playing", "finished"]
CardType = Literal["building", "unit", "magic"]
BuildingKind = Literal["main-base", "resource", "mana", "defense"]
LogKind = Literal["system", "production", "place", "move", "combat", "magic", "turn", "result"]
GameResultReason = Literal["base-destroyed", "deck-exhausted", "turn-limit"]


class Strict(BaseModel):
    """TS 타입에 없는 필드가 들어오면 실패시켜 스키마 드리프트를 잡는다."""

    model_config = ConfigDict(extra="forbid")


class Position(Strict):
    x: int
    y: int


# --- 카드 스펙 -------------------------------------------------------------


class Cost(Strict):
    resources: int
    mana: int


class Production(Strict):
    resources: int
    mana: int


class BuildingSpec(Strict):
    id: str
    name: str
    kind: BuildingKind
    special: bool
    cost: Cost
    hp: int
    defense: int
    production: Production
    score: int
    description: str


class UnitSpec(Strict):
    id: str
    name: str
    special: bool
    cost: Cost
    hp: int
    attack: int
    defense: int
    moveRange: int
    attackRange: int
    description: str


class DamageEffect(Strict):
    type: Literal["damage"]
    amount: int
    radius: int


class HealEffect(Strict):
    type: Literal["heal"]
    amount: int


class GainEffect(Strict):
    type: Literal["gain"]
    resources: int
    mana: int


class BuffAttackEffect(Strict):
    type: Literal["buff-attack"]
    amount: int
    durationTurns: int


MagicEffect = Annotated[DamageEffect | HealEffect | GainEffect | BuffAttackEffect, Field(discriminator="type")]


class MagicSpec(Strict):
    id: str
    name: str
    special: bool
    cost: Cost
    effect: MagicEffect
    description: str


class CardRef(Strict):
    type: CardType
    specId: str


class DeckChoice(Strict):
    buildingId: str
    unitId: str
    magicId: str


# --- 보드 개체 -------------------------------------------------------------


class BuildingInstance(Strict):
    id: str
    specId: str
    ownerId: str
    pos: Position
    hp: int


class AttackBuff(Strict):
    amount: int
    remainingTurns: int


class UnitInstance(Strict):
    id: str
    specId: str
    ownerId: str
    pos: Position
    hp: int
    hasActed: bool
    attackBuff: AttackBuff | None


# --- 플레이어 · 게임 상태 --------------------------------------------------


class PlayerState(Strict):
    id: str
    nickname: str
    kind: PlayerKind
    isReady: bool
    deckChoice: DeckChoice | None
    resources: int
    mana: int
    deck: list[CardRef]
    hand: list[CardRef]
    discard: list[CardRef]
    mainBaseId: str | None


class Board(Strict):
    width: int
    height: int


class GameLogEntry(Strict):
    turn: int
    kind: LogKind
    message: str


class Score(Strict):
    territory: int
    buildings: int
    total: int


class GameResult(Strict):
    winnerId: str | None
    reason: GameResultReason
    scores: dict[str, Score]


class GameState(Strict):
    roomId: str
    phase: GamePhase
    turn: int
    turnLimit: int
    currentPlayerId: str | None
    players: list[PlayerState]
    board: Board
    buildings: list[BuildingInstance]
    units: list[UnitInstance]
    rngSeed: int
    result: GameResult | None
    log: list[GameLogEntry] = Field(default_factory=list)


# --- 액션 -------------------------------------------------------------------


class SelectDeckAction(Strict):
    type: Literal["SELECT_DECK"]
    playerId: str
    choice: DeckChoice


class ReadyAction(Strict):
    type: Literal["READY"]
    playerId: str


class PlaceBuildingAction(Strict):
    type: Literal["PLACE_BUILDING"]
    playerId: str
    handIndex: int
    pos: Position


class PlaceUnitAction(Strict):
    type: Literal["PLACE_UNIT"]
    playerId: str
    handIndex: int
    pos: Position


class MoveUnitAction(Strict):
    type: Literal["MOVE_UNIT"]
    playerId: str
    unitId: str
    to: Position


class AttackAction(Strict):
    type: Literal["ATTACK"]
    playerId: str
    unitId: str
    targetId: str


class CastMagicAction(Strict):
    type: Literal["CAST_MAGIC"]
    playerId: str
    handIndex: int
    target: Position | str | None


class EndTurnAction(Strict):
    type: Literal["END_TURN"]
    playerId: str


Action = Annotated[
    SelectDeckAction
    | ReadyAction
    | PlaceBuildingAction
    | PlaceUnitAction
    | MoveUnitAction
    | AttackAction
    | CastMagicAction
    | EndTurnAction,
    Field(discriminator="type"),
]


# --- API --------------------------------------------------------------------


class DecideRequest(Strict):
    state: GameState
    playerId: str
    timeLimitMs: int = 2000


class DecideResponse(Strict):
    action: Action
    depth: int
    elapsedMs: int
