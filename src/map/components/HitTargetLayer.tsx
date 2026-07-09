import { type PointerEvent as ReactPointerEvent, useRef } from "react";
import type { GeneratedMapData } from "../mapTypes";

type PendingPress = {
  pointerId: number;
  territoryId: string;
  clientX: number;
  clientY: number;
};

const PRESS_MOVE_THRESHOLD = 5;

export function HitTargetLayer({
  isClickSuppressed,
  mapData,
  onTerritoryPress,
}: {
  isClickSuppressed?: () => boolean;
  mapData: GeneratedMapData;
  onTerritoryPress: (territoryId: string) => void;
}) {
  const skipClickRef = useRef(false);
  const pendingPressRef = useRef<PendingPress | null>(null);

  function startPress(event: ReactPointerEvent<SVGGElement>, territoryId: string) {
    if (isClickSuppressed?.()) {
      return;
    }

    pendingPressRef.current = {
      pointerId: event.pointerId,
      territoryId,
      clientX: event.clientX,
      clientY: event.clientY,
    };
  }

  function finishPress(event: ReactPointerEvent<SVGGElement>, territoryId: string) {
    const pendingPress = pendingPressRef.current;
    pendingPressRef.current = null;

    if (!pendingPress || pendingPress.pointerId !== event.pointerId || pendingPress.territoryId !== territoryId || isClickSuppressed?.()) {
      return;
    }

    const moved = Math.hypot(event.clientX - pendingPress.clientX, event.clientY - pendingPress.clientY);

    if (moved > PRESS_MOVE_THRESHOLD) {
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
          onPointerCancel={() => {
            pendingPressRef.current = null;
          }}
          onPointerDown={(event) => startPress(event, territory.id)}
          onPointerUp={(event) => finishPress(event, territory.id)}
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
