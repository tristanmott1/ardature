export type PlayMode = "local" | "sync";

export type AppPhase = "home" | "setup" | "draft" | "allocation" | "allocationHandoff" | "paused" | "gameMap" | "turn" | "turnHandoff";

export type PlayerColor = "green" | "blue" | "yellow" | "red" | "purple" | "black";

export type DraftStyle = "random" | "roundRobin" | "snake";

export type AllocationStyle = "manual" | "random";

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
  allocationStyle: AllocationStyle;
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
  timerRemainingMs: number | null;
  timerEndsAt: number | null;
  playerAllocations: Record<string, PlayerAllocation>;
};

export type TurnStage = "reinforcementReady" | "reinforcementBuild" | "reinforcementPlace" | "actions" | "spyTarget" | "spyIntel";

export type SpyStatus = {
  status: "available" | "captured" | "dead";
  territoryId: string | null;
  custodianPlayerId: string | null;
};

export type SpyIntelState = {
  targetTerritoryId: string;
  totalTerritoryIds: string[];
};

export type ReinforcementState = {
  marker: ArmyMarker;
  buildSubmitted: boolean;
  baseTroops: TroopCounts;
  bonusTroops: TroopCounts;
  territories: Record<string, TroopCounts>;
};

export type TurnCommand =
  | {
      type: "confirmSpy";
      territoryId: string;
    }
  | {
      type: "dismissSpy";
    }
  | {
      type: "dismissNotification";
      notificationId: string;
    }
  | {
      type: "commitReinforcements";
      reinforcement: ReinforcementState;
    }
  | {
      type: "fortify";
    };

export type GameNotification =
  | {
      id: string;
      type: "spyLost";
      playerId: string;
      territoryId: string;
    }
  | {
      id: string;
      type: "spyCaptured";
      playerId: string;
      spyOwnerId: string;
      territoryId: string;
    }
  | {
      id: string;
      type: "regionGained" | "regionLost";
      playerId: string;
      regionId: string;
      delivery: "turnStart" | "immediate";
      minTurnNumber: number;
    };

export type TurnState = {
  originalTurnOrder: string[];
  currentPlayerId: string;
  turnNumber: number;
  stage: TurnStage;
  spyReturnStage: "reinforcementReady" | "actions" | null;
  spies: Record<string, SpyStatus>;
  spyIntel: SpyIntelState | null;
  reinforcement: ReinforcementState | null;
};

export type GameState = {
  phase: AppPhase;
  mode: PlayMode;
  players: GamePlayer[];
  config: GameConfig;
  draft: DraftState | null;
  allocation: AllocationState | null;
  turn: TurnState | null;
  notifications: Record<string, GameNotification[]>;
  regionControl: Record<string, string | null>;
};
