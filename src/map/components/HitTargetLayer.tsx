import { type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useRef } from "react";
import type { GeneratedMapData } from "../mapTypes";

export function HitTargetLayer({
  isImmediatePress,
  isClickSuppressed,
  mapData,
  onTerritoryPress,
}: {
  isImmediatePress?: () => boolean;
  isClickSuppressed?: () => boolean;
  mapData: GeneratedMapData;
  onTerritoryPress: (territoryId: string) => void;
}) {
  const skipClickRef = useRef(false);

  function pressImmediately(event: ReactMouseEvent<SVGGElement> | ReactPointerEvent<SVGGElement>, territoryId: string) {
    if (skipClickRef.current || !isImmediatePress?.() || isClickSuppressed?.()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    skipClickRef.current = true;
    window.setTimeout(() => {
      skipClickRef.current = false;
    });
    onTerritoryPress(territoryId);
  }

  return (
    <g className="hit-target-layer">
      {mapData.territories.map((territory) => (
        <g
          aria-label={territory.name}
          data-territory-hit={territory.id}
          key={territory.id}
          onClick={() => {
            if (skipClickRef.current) {
              return;
            }

            if (!isClickSuppressed?.()) {
              onTerritoryPress(territory.id);
            }
          }}
          onMouseDown={(event) => pressImmediately(event, territory.id)}
          onPointerDown={(event) => pressImmediately(event, territory.id)}
          onKeyDown={(event) => {
            if (isClickSuppressed?.()) {
              return;
            }

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
