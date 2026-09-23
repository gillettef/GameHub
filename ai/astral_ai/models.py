"""
shared/src/types/index.ts 와 1:1로 맞추는 Pydantic 모델 (규칙 v2).
TS 쪽 필드를 추가하면 여기도 함께 갱신한다. 일치 여부는 tests/test_fixtures.py 가 검증한다.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

PlayerKind = Literal["human", "ai"]
GamePhase = Literal["lobby", "playing", "finished"]
CardType = Literal["building", "unit", "magic"]
MarkerKind = Literal["core", "building", "unit", "magic"]
Keyword = Literal["infiltrate", "repair", "overclock"]
RaceId = Literal["coalition", "swarm", "automata"]
Terrain = Literal["space", "asteroid", "vein"]
LogKind = Literal[
    "system", "turn", "combat", "repair", "expire", "income", "draw",
    "place", "magic", "destroy", "eliminate", "pass", "surrender", "result",
]
GameResultReason = Literal["last-survivor", "all-pass", "round-limit"]
PlacementErrorCode = Literal[
    "not-playing", "unknown-player", "not-your-turn", "already-placed", "not-in-hand", "not-enough-energy",
    "out-of-bounds", "asteroid", "occupied", "out-of-sight",
]


class Strict(BaseModel):
    """TS 타입에 없는 필드가 들어오면 실패시켜 스키마 드리프트를 잡는다."""

    model_config = ConfigDict(extra="forbid")


class Position(Strict):
    x: int
    y: int


# --- 카드 기준표 -------------------------------------------------------------


class DamageEffect(Strict):
    kind: Literal["damage"]
    amount: int
    radius: int


class HealEffect(Strict):
    kind: Literal["heal"]
    amount: int
    radius: int


class EnergyEffect(Strict):
    kind: Literal["energy"]
    amount: int


class PersistentEffect(Strict):
    kind: Literal["persistent"]
    durationTurns: int


MagicEffect = Annotated[
    DamageEffect | HealEffect | EnergyEffect | PersistentEffect, Field(discriminator="kind")
]


class CardSpec(Strict):
    id: str
    name: str
    kind: MarkerKind
    race: RaceId | None
    special: bool
    cost: int
    sight: int
    hp: int
    attack: int
    range: int
    production: int
    score: int
    keywords: list[Keyword]
    effect: MagicEffect | None
    copies: int
    description: str


class DeckChoice(Strict):
    race: RaceId
    buildingId: str
    unitId: str
    magicId: str


# --- 맵 -----------------------------------------------------------------------


class MapDef(Strict):
    id: str
    name: str
    players: int
    size: int
    roundLimit: int
    corePositions: list[Position]
    asteroids: list[Position]
    veins: list[Position]
    description: str


class Board(Strict):
    width: int
    height: int
    asteroids: list[Position]
    veins: list[Position]


# --- 마커 · 플레이어 · 상태 ---------------------------------------------------


class Marker(Strict):
    id: str
    specId: str
    kind: MarkerKind
    ownerId: str
    pos: Position
    hp: int
    remainingTurns: int | None


class PlayerState(Strict):
    id: str
    nickname: str
    kind: PlayerKind
    seat: int
    isReady: bool
    deckChoice: DeckChoice | None
    energy: int
    deck: list[str]
    hand: list[str]
    discard: list[str]
    alive: bool
    eliminatedOrder: int | None
    passed: bool
    actedThisTurn: bool


class GameLogEntry(Strict):
    turn: int
    round: int
    playerId: str | None
    kind: LogKind
    message: str


class Score(Strict):
    territory: int
    markers: int
    komi: int
    total: int


class GameResult(Strict):
    reason: GameResultReason
    ranking: list[str]
    scores: dict[str, Score]


class GameState(Strict):
    roomId: str
    phase: GamePhase
    mapId: str
    board: Board
    roundLimit: int
    round: int
    turn: int
    currentPlayerId: str | None
    players: list[PlayerState]
    markers: list[Marker]
    nextMarkerId: int
    rngSeed: int
    result: GameResult | None
    log: list[GameLogEntry]


# --- 액션 ---------------------------------------------------------------------


class SelectDeckAction(Strict):
    type: Literal["SELECT_DECK"]
    playerId: str
    choice: DeckChoice


class ReadyAction(Strict):
    type: Literal["READY"]
    playerId: str


class PlaceAction(Strict):
    type: Literal["PLACE"]
    playerId: str
    cardId: str
    pos: Position


class PassAction(Strict):
    type: Literal["PASS"]
    playerId: str


class SurrenderAction(Strict):
    type: Literal["SURRENDER"]
    playerId: str


Action = Annotated[
    SelectDeckAction | ReadyAction | PlaceAction | PassAction | SurrenderAction,
    Field(discriminator="type"),
]


# --- HTTP 요청·응답 (CLAUDE.md "AI 서비스") ------------------------------------


class DecideRequest(Strict):
    state: GameState
    playerId: str
    timeLimitMs: int = 2000


class DecideResponse(Strict):
    action: Action
    depth: int
    elapsedMs: int
