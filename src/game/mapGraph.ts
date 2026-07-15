import { generatedDirectedMapConnections } from "../map/generated/mapConnections";
import type { TerritoryOwnerMap } from "./gameTypes";

type DirectedConnectionMap = typeof generatedDirectedMapConnections;

export function outgoingTerritoryIds(territoryId: string): readonly string[] {
  return generatedDirectedMapConnections[territoryId as keyof DirectedConnectionMap] ?? [];
}

export function hasDirectedConnection(fromTerritoryId: string, toTerritoryId: string) {
  return outgoingTerritoryIds(fromTerritoryId).includes(toTerritoryId);
}

export function directedDistanceFromAny(sourceTerritoryIds: Iterable<string>, targetTerritoryId: string) {
  const queue: Array<{ id: string; distance: number }> = [];
  const visited = new Set<string>();

  for (const territoryId of sourceTerritoryIds) {
    if (territoryId === targetTerritoryId) {
      return 0;
    }

    if (!visited.has(territoryId)) {
      visited.add(territoryId);
      queue.push({ id: territoryId, distance: 0 });
    }
  }

  // Walk along outgoing gameplay edges until the target can be reached.
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const connectedId of outgoingTerritoryIds(current.id)) {
      if (visited.has(connectedId)) {
        continue;
      }

      const distance = current.distance + 1;
      if (connectedId === targetTerritoryId) {
        return distance;
      }

      visited.add(connectedId);
      queue.push({ id: connectedId, distance });
    }
  }

  return null;
}

export function directedOwnedSourcesReachingTarget(ownership: TerritoryOwnerMap, targetTerritoryId: string, playerId: string) {
  const sourceIds = new Set<string>();

  for (const [territoryId, ownerId] of Object.entries(ownership)) {
    if (ownerId === playerId && territoryId !== targetTerritoryId && directedOwnedPathExists(ownership, territoryId, targetTerritoryId, playerId)) {
      sourceIds.add(territoryId);
    }
  }

  return sourceIds;
}

function directedOwnedPathExists(ownership: TerritoryOwnerMap, sourceTerritoryId: string, targetTerritoryId: string, playerId: string) {
  const queue = [sourceTerritoryId];
  const visited = new Set(queue);

  for (let index = 0; index < queue.length; index += 1) {
    const territoryId = queue[index];
    for (const connectedId of outgoingTerritoryIds(territoryId)) {
      if (connectedId === targetTerritoryId) {
        return true;
      }

      if (visited.has(connectedId) || ownership[connectedId] !== playerId) {
        continue;
      }

      visited.add(connectedId);
      queue.push(connectedId);
    }
  }

  return false;
}
