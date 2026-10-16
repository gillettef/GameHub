"""
Rootbound GameState / Action Pydantic 모델. `shared/src/types/index.ts` 와 필드명·타입을 1:1 로 맞춘다.
서버가 보내는 가려진 상태(타인 손 카드·카드 더미가 빈 배열, `handCount`/`pileCount` 추가 필드)와
가리지 않은 원본 상태를 모두 받는다. 모르는 필드(예전 형식의 drafted/deck/draftOrder/seeds 등)는 버린다.
"""

from __future__ import annotations

from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator

PlayerId = str
SpeciesId = Literal[
    "grass",
    "oak",
    "pine",
    "kudzu",
    "fern",
    "dandelion",
    "lotus",
    "mushroom",
    "mugunghwa",
]
GoalId = str
Terrain = Literal["empty", "fertile", "pond", "rock"]
# lobby → reveal(이번 판 식물 공개) → playing → finished
GamePhase = Literal["lobby", "reveal", "playing", "finished"]
# 차례 안의 단계: 마켓에서 가져온 뒤 심는다
RoundStage = Literal["take", "plant"]
LogKind = Literal["system", "take", "plant", "discard", "flip", "uproot", "turn", "surrender", "result"]
PlayerKind = Literal["human", "ai"]
GameResultReason = Literal["complete", "last-standing"]


class _Model(BaseModel):
    """TS 쪽에 필드가 더 붙어도(가린 상태의 handCount, 예전 형식의 drafted 등) 오류 없이 버린다."""

    model_config = ConfigDict(extra="ignore")


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
    # 심은 사람 (기록용. 점수는 그 칸의 땅 주인이 받는다)
    ownerId: PlayerId
    pos: Position
    # 뿌리 모양 회전 0~5
    rotation: int = 0


class PlayerState(_Model):
    id: PlayerId
    nickname: str
    kind: PlayerKind
    seat: int
    # 로비: 준비 완료. 공개 단계: 확인함
    isReady: bool
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
    # 내 땅 위에 서 있는 식물 수 (동점 깨기)
    plantsOnLand: int
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
    # 이번 판에 쓰는 식물 (표 순서, 공개)
    species: list[SpeciesId] = Field(default_factory=list)
    # 펼쳐 둔 마켓 카드 (공개). 1장 가져가면 더미 맨 위로 바로 채운다
    market: list[SpeciesId] = Field(default_factory=list)
    # 카드 더미 (맨 앞이 다음 카드). 서버가 가린 상태에서는 빈 배열이고 pileCount 만 있다
    pile: list[SpeciesId] = Field(default_factory=list)
    # 가린 상태(MaskedGameState)의 더미 장수. 원본 상태에는 없다. 직렬화에서는 뺀다
    pileCount: Optional[int] = Field(default=None, exclude=True)
    # 이번 라운드의 선(첫 자리, 공개). 라운드가 끝나면 공급처에 큐브가 가장 많이 남은 사람
    roundStart: int = 0
    # 1부터 (공개 단계는 0)
    round: int = 0
    # 라운드 안의 단계 (공개 단계·종료에서는 의미 없음)
    stage: RoundStage = "take"
    turn: int = 0
    currentPlayerId: Optional[PlayerId] = None
    players: list[PlayerState] = Field(default_factory=list)
    plants: list[Plant] = Field(default_factory=list)
    # 칸별 뿌리 큐브 색(좌석, −1 없음)과 수. board.cells 순서. 한 칸에는 한 색만
    rootSeat: list[int] = Field(default_factory=list)
    rootCount: list[int] = Field(default_factory=list)
    rngSeed: int = 0
    # 카드 더미 셔플 전용 시드 (TS GameState.deckSeed, 32비트 정수 4개). 서버가 가려서 보내면 [] 이다.
    # Python 은 셔플하지 않으므로 값만 통과시킨다
    deckSeed: list[int] = Field(default_factory=list)
    result: Optional[GameResult] = None
    log: list[GameLogEntry] = Field(default_factory=list)

    @field_validator("deckSeed", mode="before")
    @classmethod
    def _old_deck_seed(cls, v: object) -> object:
        """예전 형식(정수 하나)은 버린다."""
        return [] if isinstance(v, int) else v


# ---------------------------------------------------------------------------
# 액션 (type 으로 구분)
# ---------------------------------------------------------------------------


class ReadyAction(_Model):
    type: Literal["READY"] = "READY"
    playerId: PlayerId


class ConfirmAction(_Model):
    """이번 판 식물 공개 단계에서 확인."""

    type: Literal["CONFIRM"] = "CONFIRM"
    playerId: PlayerId


class TakeAction(_Model):
    """차례 앞부분: 마켓 take 번 카드를 손에 든다."""

    type: Literal["TAKE"] = "TAKE"
    playerId: PlayerId
    take: int


class PlantAction(_Model):
    """심기. rotation 은 뿌리 모양 회전(생략 0), seed 는 민들레만(생략 가능).
    직렬화할 때 None 은 빼야 TS 검증을 통과한다."""

    type: Literal["PLANT"] = "PLANT"
    playerId: PlayerId
    species: SpeciesId
    pos: Position
    rotation: Optional[int] = None
    seed: Optional[Position] = None


class DiscardAction(_Model):
    """심기 단계. 손의 어떤 카드도 심을 칸이 없을 때만."""

    type: Literal["DISCARD"] = "DISCARD"
    playerId: PlayerId
    species: SpeciesId


class SurrenderAction(_Model):
    type: Literal["SURRENDER"] = "SURRENDER"
    playerId: PlayerId


Action = Annotated[
    Union[ReadyAction, ConfirmAction, TakeAction, PlantAction, DiscardAction, SurrenderAction],
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
