import type { GeneratedMapData } from "../mapTypes";

export function HitTargetLayer({
  mapData,
  onTerritoryPress,
}: {
  mapData: GeneratedMapData;
  onTerritoryPress: (territoryId: string) => void;
}) {
  return (
    <g className="hit-target-layer">
      {mapData.territories.map((territory) => (
        <g
          aria-label={territory.name}
          data-territory-hit={territory.id}
          key={territory.id}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onTerritoryPress(territory.id);
            }
          }}
          role="button"
          tabIndex={0}
        >
          {territory.hitPaths.map((path, index) => (
            <path className="territory-hit-target" d={path} key={index} />
          ))}
        </g>
      ))}
    </g>
  );
}
