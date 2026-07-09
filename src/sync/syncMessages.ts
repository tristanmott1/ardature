import type { GameState, PlayerAllocation, PlayerColor } from "../game/gameTypes";

export type ArdatureSyncMessage =
  | {
      type: "gameState";
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
      type: "hostQuit";
    };

export function isArdatureSyncMessage(value: unknown): value is ArdatureSyncMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<ArdatureSyncMessage>;
  return message.type === "gameState" ||
    message.type === "profileUpdate" ||
    message.type === "draftConfirm" ||
    message.type === "allocationUpdate" ||
    message.type === "quit" ||
    message.type === "hostQuit";
}
