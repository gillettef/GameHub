"""
shared/src/types/index.ts 와 1:1로 맞추는 Pydantic 모델.
TS 쪽 필드를 추가하면 여기도 함께 갱신한다.
"""

from typing import Literal

from pydantic import BaseModel, Field

PlayerKind = Literal["human", "ai"]
GamePhase = Literal["lobby", "deck-building", "playing", "finished"]


class Position(BaseModel):
    x: int
    y: int


class PlayerState(BaseModel):
    id: str
    nickname: str
    kind: PlayerKind
    resources: int
    mana: int


class Board(BaseModel):
    width: int
    height: int


class GameLogEntry(BaseModel):
    turn: int
    message: str


class GameState(BaseModel):
    roomId: str
    phase: GamePhase
    turn: int
    currentPlayerId: str | None
    players: list[PlayerState]
    board: Board
    log: list[GameLogEntry] = Field(default_factory=list)


class EndTurnAction(BaseModel):
    type: Literal["END_TURN"]
    playerId: str


Action = EndTurnAction


class DecideRequest(BaseModel):
    state: GameState
    playerId: str
    timeLimitMs: int = 2000


class DecideResponse(BaseModel):
    action: Action
    depth: int
    elapsedMs: int
