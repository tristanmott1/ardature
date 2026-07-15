import type { MapPoint } from "../mapTypes";

export type MapWeatherMarker = {
  center: MapPoint;
  href: string;
  id: string;
  size: number;
};

export function MapWeatherLayer({ markers = [] }: { markers?: readonly MapWeatherMarker[] }) {
  return (
    <g aria-hidden="true" className="map-weather-layer">
      {markers.map((marker) => (
        <image
          data-weather-marker={marker.id}
          height={marker.size}
          href={marker.href}
          key={marker.id}
          width={marker.size}
          x={marker.center.x - marker.size / 2}
          y={marker.center.y - marker.size / 2}
        />
      ))}
    </g>
  );
}
