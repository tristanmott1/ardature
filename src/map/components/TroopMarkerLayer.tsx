import type { MapPoint } from "../mapTypes";

export type TroopMarker = {
  territoryId: string;
  center: MapPoint;
  count: number;
};

export function TroopMarkerLayer({ markers = [] }: { markers?: readonly TroopMarker[] }) {
  return (
    <g className="troop-marker-layer">
      {markers.map((marker) => (
        <g className="troop-marker" data-troop-marker={marker.territoryId} key={marker.territoryId} transform={`translate(${marker.center.x} ${marker.center.y})`}>
          <circle r="128" />
          <text dominantBaseline="central" textAnchor="middle">
            {marker.count}
          </text>
        </g>
      ))}
    </g>
  );
}
