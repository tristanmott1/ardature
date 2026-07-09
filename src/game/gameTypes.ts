export type PlayMode = "local" | "sync";

export type AppPhase = "home" | "setup" | "draft" | "allocation" | "allocationHandoff" | "allocationWaiting" | "paused" | "gameMap";

export type PlayerColor = "green" | "blue" | "yellow" | "red" | "purple" | "black";

export type DraftStyle = "random" | "roundRobin" | "snake";

export type PickTimeLimit = 0 | 5 | 10 | 15;

export type TroopAllocationTimeLimit = 0 | 60 | 120 | 180 | 240 | 300;

export type PlayerConnectionStatus = "connected" | "disconnected" | "reconnecting";

export type GamePlayer = {
  id: string;
  name: string;
  color: PlayerColor | null;
  nameLocked: boolean;
  colorLocked: boolean;
  connectionStatus: PlayerConnectionStatus;
};

export type GameConfig = {
  draftStyle: DraftStyle;
  pickTimeLimit: PickTimeLimit;
  troopAllocationTimeLimit: TroopAllocationTimeLimit;
};

export type TerritoryOwnerMap = Record<string, string | null>;

export type TroopType = "heavy" | "cavalry" | "elite" | "leader";

export type TroopCounts = Record<TroopType, number>;

export type ArmyMarker = {
  heavy: number;
  cavalry: number;
  elite: number;
};

export type DraftState = {
  originalTurnOrder: string[];
  startIndex: number;
  step: number;
  ownership: TerritoryOwnerMap;
  pendingTerritoryId: string | null;
  resultTerritoryId: string | null;
  resultPlayerId: string | null;
  timerRemainingMs: number | null;
  timerEndsAt: number | null;
};

export type PlayerAllocation = {
  marker: ArmyMarker;
  buildSubmitted: boolean;
  baseTroops: TroopCounts;
  inheritedTroops: TroopCounts;
  territories: Record<string, TroopCounts>;
  ready: boolean;
  randomCompleted: boolean;
};

export type AllocationState = {
  originalPlayerCount: number;
  order: string[];
  currentIndex: number;
  selectedTerritoryId: string | null;
  timerRemainingMs: number | null;
  timerEndsAt: number | null;
  playerAllocations: Record<string, PlayerAllocation>;
};

export type GameState = {
  phase: AppPhase;
  mode: PlayMode;
  players: GamePlayer[];
  config: GameConfig;
  draft: DraftState | null;
  allocation: AllocationState | null;
};
