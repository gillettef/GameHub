"""
Rootbound GameState / Action Pydantic 모델. `shared/src/types/index.ts` 와 필드명·타입을 1:1 로 맞춘다.
서버가 보내는 가려진 상태(타인 손패·덱이 빈 배열, `handCount`/`deckCount` 추가 필드)도 받도록
추가 필드를 허용한다.
"""

from __future__ import annotations

from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

PlayerId = str
SpeciesId = Literal[
    "grass",
    "oak",
    "cactus",
    "vine",
    "fern",
    "dandelion",
    "sunflower",
    "lotus",
    "ivy",
    "bamboo",
    "mushroom",
    "rose",
]
GoalId = str
Terrain = Literal["empty", "fertile", "pond", "rock"]
GamePhase = Literal["lobby", "drafting", "playing", "finished"]
LogKind = Literal["system", "draft", "plant", "discard", "flip", "turn", "surrender", "result"]
PlayerKind = Literal["human", "ai"]
GameResultReason = Literal["complete", "last-standing"]


class _Model(BaseModel):
    """TS 쪽에 필드가 더 붙어도(가린 상태의 handCount 등) 받아들인다."""

    model_config = ConfigDict(extra="allow")


class Position(_Model):
    q: int
    r: int


class Cell(_Model):
    q: int
    r: int
    terrain: Terrain
    # 이 칸이 속한 정원 조각 번호 (0 = 가운데 조각)
    tile: int


class Board(_Model):
    # 칸 목록. 항상 r → q 오름차순
    cells: list[Cell]
    # 좌석별 입구 위치
    entrances: list[Position]
    tileCount: int


class Plant(_Model):
    id: str
    species: SpeciesId
    ownerId: PlayerId
    pos: Position
    # 덩굴의 방향. 그 외 None
    direction: Optional[int] = None


class Seed(_Model):
    ownerId: PlayerId
    pos: Position


class PlayerState(_Model):
    id: PlayerId
    nickname: str
    kind: PlayerKind
    seat: int
    isReady: bool
    drafted: list[SpeciesId] = Field(default_factory=list)
    deck: list[SpeciesId] = Field(default_factory=list)
    hand: list[SpeciesId] = Field(default_factory=list)
    surrenderedOrder: Optional[int] = None


class GameLogEntry(_Model):
    turn: int
    round: int
    playerId: Optional[PlayerId] = None
    kind: LogKind
    message: str


class Score(_Model):
    land: int
    goals: int
    goalBreakdown: list[int]
    bloom: int
    komi: int
    total: int


class GameResult(_Model):
    reason: GameResultReason
    ranking: list[PlayerId]
    scores: dict[PlayerId, Score]


class GameState(_Model):
    roomId: str
    phase: GamePhase
    board: Optional[Board] = None
    goals: list[GoalId] = Field(default_factory=list)
    draftOrder: list[PlayerId] = Field(default_factory=list)
    draftIndex: int = 0
    round: int = 0
    turn: int = 0
    currentPlayerId: Optional[PlayerId] = None
    players: list[PlayerState] = Field(default_factory=list)
    plants: list[Plant] = Field(default_factory=list)
    seeds: list[Seed] = Field(default_factory=list)
    rngSeed: int = 0
    # 덱 셔플 전용 시드 (TS GameState.deckSeed). 서버가 가려서 보내므로 AI 쪽에서는 보통 0 이다
    deckSeed: int = 0
    result: Optional[GameResult] = None
    log: list[GameLogEntry] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# 액션 (type 으로 구분)
# ---------------------------------------------------------------------------


class ReadyAction(_Model):
    type: Literal["READY"] = "READY"
    playerId: PlayerId


class DraftAction(_Model):
    type: Literal["DRAFT"] = "DRAFT"
    playerId: PlayerId
    species: SpeciesId


class PlantAction(_Model):
    """direction 은 덩굴만, seed 는 민들레만(생략 가능). 직렬화할 때 None 은 빼야 TS 검증을 통과한다."""

    type: Literal["PLANT"] = "PLANT"
    playerId: PlayerId
    species: SpeciesId
    pos: Position
    direction: Optional[int] = None
    seed: Optional[Position] = None


class DiscardAction(_Model):
    type: Literal["DISCARD"] = "DISCARD"
    playerId: PlayerId
    species: SpeciesId


class SurrenderAction(_Model):
    type: Literal["SURRENDER"] = "SURRENDER"
    playerId: PlayerId


Action = Annotated[
    Union[ReadyAction, DraftAction, PlantAction, DiscardAction, SurrenderAction],
    Field(discriminator="type"),
]


class DecideRequest(BaseModel):
    state: GameState
    playerId: PlayerId
    timeLimitMs: int = 2000


class DecideResponse(BaseModel):
    action: Action
    depth: int
    elapsedMs: int
