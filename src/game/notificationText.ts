import { territoryName } from "../map/territoryLookup";
import type { GameNotification, GamePlayer } from "./gameTypes";

const REGION_NAMES: Record<string, string> = {
  eriador: "Eriador",
  gondor: "Gondor",
  mordor: "Mordor",
  rhovanion: "Rhovanion",
  rhun: "Rhûn",
  rohan: "Rohan",
};

export function notificationMessage(notification: GameNotification, players: GamePlayer[]) {
  if (notification.type === "spyLost") {
    return `Your spy was captured in ${territoryName(notification.territoryId)}`;
  }

  if (notification.type === "spyCaptured") {
    const spyOwner = players.find((player) => player.id === notification.spyOwnerId);
    return `You captured ${spyOwner?.name ?? "someone"}'s spy in ${territoryName(notification.territoryId)}`;
  }

  const regionName = REGION_NAMES[notification.regionId] ?? notification.regionId;
  return notification.type === "regionGained"
    ? `You control ${regionName}`
    : `You lost ${regionName}`;
}
