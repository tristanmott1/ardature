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
          <circle r="187" />
          <text x="0" y="0" dy="0.08em" dominantBaseline="middle" textAnchor="middle">
            {marker.count}
          </text>
        </g>
      ))}
    </g>
  );
}
