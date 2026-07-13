import { generatedMapData } from "./generated/mapData";
import type { GeneratedTerritoryData } from "./mapTypes";

export const territoryById = new Map<string, GeneratedTerritoryData>(generatedMapData.territories.map((territory) => [territory.id, territory]));

export function territoryForId(territoryId: string | null | undefined) {
  return territoryId ? territoryById.get(territoryId) ?? null : null;
}

export function territoryName(territoryId: string) {
  return territoryForId(territoryId)?.name ?? territoryId;
}

export function territoriesInRegion(regionId: string) {
  return generatedMapData.territories.filter((territory) => territory.regionId === regionId);
}
