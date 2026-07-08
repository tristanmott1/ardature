import { generatedMapData } from "../map/generated/mapData";
import type { MapSkin, TerritoryState } from "../map/mapTypes";

export type TerritoryStates = Record<string, TerritoryState>;

export function createInitialTerritoryStates(): TerritoryStates {
  return Object.fromEntries(
    generatedMapData.territories.map((territory) => [
      territory.id,
      {
        skin: "background",
        status: "regular",
      },
    ]),
  );
}

export function pressTerritory(states: TerritoryStates, territoryId: string): TerritoryStates {
  const current = states[territoryId];

  if (!current) {
    return states;
  }

  if (current.status === "selected") {
    return {
      ...states,
      [territoryId]: {
        ...current,
        status: "disabled",
      },
    };
  }

  if (current.status === "disabled") {
    return {
      ...states,
      [territoryId]: {
        ...current,
        status: "regular",
      },
    };
  }

  return Object.fromEntries(
    Object.entries(states).map(([id, state]) => [
      id,
      {
        ...state,
        status: id === territoryId ? "selected" : "regular",
      },
    ]),
  );
}

export function setSelectedTerritorySkin(states: TerritoryStates, skin: MapSkin): TerritoryStates {
  const selectedId = selectedTerritoryId(states);

  if (!selectedId) {
    return states;
  }

  return {
    ...states,
    [selectedId]: {
      ...states[selectedId],
      skin,
      status: "selected",
    },
  };
}

export function selectedTerritoryId(states: TerritoryStates) {
  const selected = Object.entries(states).find(([, state]) => state.status === "selected");
  return selected?.[0] ?? null;
}
