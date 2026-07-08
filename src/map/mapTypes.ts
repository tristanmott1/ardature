export type MapSkin =
  | "background"
  | "blue"
  | "green"
  | "red"
  | "yellow"
  | "black"
  | "purple";

export type TerritoryStatus = "unselected" | "selected";

export type TerritoryState = {
  skin: MapSkin;
  status: TerritoryStatus;
};

export type MapPoint = {
  x: number;
  y: number;
};

export type GeneratedTerritoryData = {
  id: string;
  name: string;
  regionId: string;
  center: MapPoint;
  fillPaths: readonly string[];
  hitPaths: readonly string[];
  skins: Record<MapSkin, string>;
};

export type GeneratedStaticInkData = {
  borderPaths: readonly string[];
  borderStroke: string;
  borderOpacity: number;
  borderStrokeWidth: number;
  landmarkPath: string;
  landmarkFill: string;
  landmarkOpacity: number;
};

export type GeneratedMapData = {
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  backgroundColor: string;
  skins: readonly MapSkin[];
  territories: readonly GeneratedTerritoryData[];
  staticInk: GeneratedStaticInkData;
};
