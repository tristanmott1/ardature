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

export type MapBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type MapViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GeneratedTerritoryData = {
  id: string;
  name: string;
  regionId: string;
  center: MapPoint;
  focusBounds: MapBounds;
  fillPaths: readonly string[];
  hitPaths: readonly string[];
  skins: Record<MapSkin, string>;
};

export type GeneratedStaticInkData = {
  territoryBorderPaths: readonly string[];
  regionBorderPaths: readonly string[];
  borderStroke: string;
  borderOpacity: number;
  territoryBorderStrokeWidth: number;
  regionBorderStrokeWidth: number;
  shipRoutePaths: readonly string[];
  shipRouteStroke: string;
  shipRouteOpacity: number;
  shipRouteStrokeWidth: number;
  shipRouteDashArray: string;
  landmarkPath: string;
  landmarkFill: string;
  landmarkOpacity: number;
};

export type GeneratedMapData = {
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  homeViewport: MapViewport;
  backgroundColor: string;
  skins: readonly MapSkin[];
  territories: readonly GeneratedTerritoryData[];
  staticInk: GeneratedStaticInkData;
};
