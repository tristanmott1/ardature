import type { GeneratedStaticInkData } from "../mapTypes";

export function StaticMapInk({ ink }: { ink: GeneratedStaticInkData }) {
  return (
    <g className="static-map-ink" data-static-map-ink="true">
      {ink.borderPaths.map((path, index) => (
        <path
          d={path}
          fill="none"
          key={index}
          stroke={ink.borderStroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={ink.borderOpacity}
          strokeWidth={ink.borderStrokeWidth}
        />
      ))}
      <path d={ink.landmarkPath} fill={ink.landmarkFill} fillOpacity={ink.landmarkOpacity} fillRule="evenodd" />
    </g>
  );
}
