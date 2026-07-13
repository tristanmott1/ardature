import { PLAYER_COLORS } from "./gameState";
import type { GamePlayer } from "./gameTypes";

export function firstAvailableColor(players: GamePlayer[]) {
  const usedColors = new Set(players.map((player) => player.color).filter(Boolean));
  return PLAYER_COLORS.find((color) => !usedColors.has(color)) ?? null;
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}
