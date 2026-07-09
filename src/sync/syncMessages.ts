import type { GameState, PlayerAllocation, PlayerColor, TroopCounts } from "../game/gameTypes";

export type ArdatureSyncMessage =
  | {
      type: "snapshot";
      revision: number;
      game: GameState;
    }
  | {
      type: "profileUpdate";
      name?: string;
      color?: PlayerColor | null;
    }
  | {
      type: "draftConfirm";
      territoryId: string;
    }
  | {
      type: "allocationUpdate";
      allocation: PlayerAllocation;
    }
  | {
      type: "quit";
    }
  | {
      type: "hostEnded";
    };

const PLAYER_COLORS = ["green", "blue", "yellow", "red", "purple", "black"];
const TROOP_TYPES = ["heavy", "cavalry", "elite", "leader"] as const;

export function isArdatureSyncMessage(value: unknown): value is ArdatureSyncMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<ArdatureSyncMessage>;
  if (message.type === "snapshot") {
    return Number.isInteger(message.revision) && isGameState(message.game);
  }

  if (message.type === "profileUpdate") {
    return (message.name === undefined || typeof message.name === "string") &&
      (message.color === undefined || message.color === null || isPlayerColor(message.color));
  }

  if (message.type === "draftConfirm") {
    return typeof message.territoryId === "string";
  }

  if (message.type === "allocationUpdate") {
    return isPlayerAllocation(message.allocation);
  }

  return message.type === "quit" || message.type === "hostEnded";
}

function isGameState(value: unknown): value is GameState {
  const state = value as Partial<GameState>;
  return Boolean(state) &&
    typeof state === "object" &&
    (state.mode === "local" || state.mode === "sync") &&
    (state.phase === "home" || state.phase === "setup" || state.phase === "draft" || state.phase === "allocation" || state.phase === "allocationHandoff" || state.phase === "paused" || state.phase === "gameMap") &&
    Array.isArray(state.players) &&
    Boolean(state.config);
}

function isPlayerAllocation(value: unknown): value is PlayerAllocation {
  const allocation = value as Partial<PlayerAllocation>;
  return Boolean(allocation) &&
    typeof allocation === "object" &&
    isMarker(allocation.marker) &&
    typeof allocation.buildSubmitted === "boolean" &&
    isTroopCounts(allocation.baseTroops) &&
    isTroopCounts(allocation.inheritedTroops) &&
    Boolean(allocation.territories) &&
    typeof allocation.territories === "object" &&
    typeof allocation.ready === "boolean" &&
    typeof allocation.randomCompleted === "boolean";
}

function isMarker(value: unknown) {
  const marker = value as { elite?: unknown; heavy?: unknown; cavalry?: unknown };
  return Boolean(marker) &&
    typeof marker === "object" &&
    typeof marker.heavy === "number" &&
    typeof marker.cavalry === "number" &&
    typeof marker.elite === "number";
}

function isTroopCounts(value: unknown): value is TroopCounts {
  const counts = value as Partial<TroopCounts>;
  return Boolean(counts) &&
    typeof counts === "object" &&
    TROOP_TYPES.every((troopType) => Number.isInteger(counts[troopType]));
}

function isPlayerColor(value: unknown): value is PlayerColor {
  return typeof value === "string" && PLAYER_COLORS.includes(value);
}
