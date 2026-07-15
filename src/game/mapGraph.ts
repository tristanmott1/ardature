import { generatedDirectedMapConnections } from "../map/generated/mapConnections";
import type { TerritoryOwnerMap } from "./gameTypes";

type DirectedConnectionMap = typeof generatedDirectedMapConnections;

export type DynamicEdgeState = {
  caradhrasPassState: number | null;
  pathsOfTheDeadState: number | null;
};

const CARADHRAS_PASS_MIN = 1;
const CARADHRAS_PASS_MAX = 10;
const CARADHRAS_PASS_BLOCKED_AT = 6;
const CARADHRAS_ID = "caradhras";
const RIVENDELL_ID = "rivendell";
const PASS_DRIFT_WEIGHTS = [
  { delta: -2, weight: 20 },
  { delta: -1, weight: 20 },
  { delta: 0, weight: 20 },
  { delta: 1, weight: 20 },
  { delta: 2, weight: 20 },
];
const PATHS_OF_THE_DEAD_MIN = 1;
const PATHS_OF_THE_DEAD_MAX = 5;
const PATHS_OF_THE_DEAD_OPEN_AT = 4;
const EDORAS_ID = "edoras";
const LAMEDON_ID = "lamedon";
const PATHS_OF_THE_DEAD_DRIFT_WEIGHTS = [
  { delta: -1, weight: 40 },
  { delta: 0, weight: 20 },
  { delta: 1, weight: 40 },
];

export function createCaradhrasPassState(random = Math.random) {
  return Math.floor(random() * CARADHRAS_PASS_MAX) + CARADHRAS_PASS_MIN;
}

export function driftCaradhrasPassState(currentState: number | null, random = Math.random) {
  if (currentState === null) {
    return createCaradhrasPassState(random);
  }

  const current = normalizeCaradhrasPassState(currentState);
  const choices = PASS_DRIFT_WEIGHTS
    .map((choice) => ({ state: current + choice.delta, weight: choice.weight }))
    .filter((choice) => choice.state >= CARADHRAS_PASS_MIN && choice.state <= CARADHRAS_PASS_MAX);
  const totalWeight = choices.reduce((total, choice) => total + choice.weight, 0);
  let roll = random() * totalWeight;

  // Sample after impossible out-of-range moves have been discarded.
  for (const choice of choices) {
    roll -= choice.weight;
    if (roll <= 0) {
      return choice.state;
    }
  }

  return choices[choices.length - 1]?.state ?? current;
}

export function isCaradhrasPassOpen(caradhrasPassState: number | null) {
  if (caradhrasPassState === null) {
    return true;
  }

  return normalizeCaradhrasPassState(caradhrasPassState) < CARADHRAS_PASS_BLOCKED_AT;
}

export function createPathsOfTheDeadState(random = Math.random) {
  return Math.floor(random() * PATHS_OF_THE_DEAD_MAX) + PATHS_OF_THE_DEAD_MIN;
}

export function driftPathsOfTheDeadState(currentState: number | null, random = Math.random) {
  const current = currentState === null
    ? createPathsOfTheDeadState(random)
    : normalizePathsOfTheDeadState(currentState);
  const choices = PATHS_OF_THE_DEAD_DRIFT_WEIGHTS
    .map((choice) => ({ state: current + choice.delta, weight: choice.weight }))
    .filter((choice) => choice.state >= PATHS_OF_THE_DEAD_MIN && choice.state <= PATHS_OF_THE_DEAD_MAX);
  const totalWeight = choices.reduce((total, choice) => total + choice.weight, 0);
  let roll = random() * totalWeight;

  // Sample after impossible out-of-range moves have been discarded.
  for (const choice of choices) {
    roll -= choice.weight;
    if (roll <= 0) {
      return choice.state;
    }
  }

  return choices[choices.length - 1]?.state ?? current;
}

export function isPathsOfTheDeadOpen(pathsOfTheDeadState: number | null) {
  return pathsOfTheDeadState !== null && normalizePathsOfTheDeadState(pathsOfTheDeadState) >= PATHS_OF_THE_DEAD_OPEN_AT;
}

export function baseOutgoingTerritoryIds(territoryId: string): readonly string[] {
  return generatedDirectedMapConnections[territoryId as keyof DirectedConnectionMap] ?? [];
}

export function outgoingTerritoryIds(territoryId: string, edgeState: DynamicEdgeState): readonly string[] {
  const baseIds = baseOutgoingTerritoryIds(territoryId);
  return baseIds.filter((connectedId) =>
    (isCaradhrasPassOpen(edgeState.caradhrasPassState) || !isCaradhrasPassConnection(territoryId, connectedId)) &&
    (isPathsOfTheDeadOpen(edgeState.pathsOfTheDeadState) || !isPathsOfTheDeadConnection(territoryId, connectedId)));
}

export function hasDirectedConnection(fromTerritoryId: string, toTerritoryId: string, edgeState: DynamicEdgeState) {
  return outgoingTerritoryIds(fromTerritoryId, edgeState).includes(toTerritoryId);
}

export function directedDistanceFromAny(sourceTerritoryIds: Iterable<string>, targetTerritoryId: string, edgeState: DynamicEdgeState) {
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
    for (const connectedId of outgoingTerritoryIds(current.id, edgeState)) {
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

export function directedOwnedSourcesReachingTarget(ownership: TerritoryOwnerMap, targetTerritoryId: string, playerId: string, edgeState: DynamicEdgeState) {
  const sourceIds = new Set<string>();

  for (const [territoryId, ownerId] of Object.entries(ownership)) {
    if (ownerId === playerId && territoryId !== targetTerritoryId && directedOwnedPathExists(ownership, territoryId, targetTerritoryId, playerId, edgeState)) {
      sourceIds.add(territoryId);
    }
  }

  return sourceIds;
}

function directedOwnedPathExists(ownership: TerritoryOwnerMap, sourceTerritoryId: string, targetTerritoryId: string, playerId: string, edgeState: DynamicEdgeState) {
  const queue = [sourceTerritoryId];
  const visited = new Set(queue);

  for (let index = 0; index < queue.length; index += 1) {
    const territoryId = queue[index];
    for (const connectedId of outgoingTerritoryIds(territoryId, edgeState)) {
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

function isCaradhrasPassConnection(fromTerritoryId: string, toTerritoryId: string) {
  return isCaradhrasPassTerritory(fromTerritoryId) && isCaradhrasPassTerritory(toTerritoryId);
}

function isCaradhrasPassTerritory(territoryId: string) {
  return territoryId === CARADHRAS_ID || territoryId === RIVENDELL_ID;
}

function isPathsOfTheDeadConnection(fromTerritoryId: string, toTerritoryId: string) {
  return fromTerritoryId === EDORAS_ID && toTerritoryId === LAMEDON_ID;
}

function normalizeCaradhrasPassState(value: number) {
  return Math.max(CARADHRAS_PASS_MIN, Math.min(CARADHRAS_PASS_MAX, Math.round(value)));
}

function normalizePathsOfTheDeadState(value: number) {
  return Math.max(PATHS_OF_THE_DEAD_MIN, Math.min(PATHS_OF_THE_DEAD_MAX, Math.round(value)));
}
