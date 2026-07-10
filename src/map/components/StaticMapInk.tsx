import type { GeneratedStaticInkData } from "../mapTypes";

export function StaticMapInk({ ink }: { ink: GeneratedStaticInkData }) {
  return (
    <g className="static-map-ink" data-static-map-ink="true">
      {ink.territoryBorderPaths.map((path, index) => (
        <path
          className="territory-border-ink"
          d={path}
          fill="none"
          key={`territory-${index}`}
          stroke={ink.borderStroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={ink.borderOpacity}
          strokeWidth={ink.territoryBorderStrokeWidth}
        />
      ))}
      {ink.regionBorderPaths.map((path, index) => (
        <path
          className="region-border-ink"
          d={path}
          fill="none"
          key={`region-${index}`}
          stroke={ink.borderStroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={ink.borderOpacity}
          strokeWidth={ink.regionBorderStrokeWidth}
        />
      ))}
      {ink.shipRoutePaths.map((path, index) => (
        <path
          className="ship-route-ink"
          d={path}
          fill="none"
          key={`ship-route-${index}`}
          stroke={ink.shipRouteStroke}
          strokeDasharray={ink.shipRouteDashArray}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={ink.shipRouteOpacity}
          strokeWidth={ink.shipRouteStrokeWidth}
        />
      ))}
      <path d={ink.landmarkPath} fill={ink.landmarkFill} fillOpacity={ink.landmarkOpacity} fillRule="evenodd" />
    </g>
  );
}
