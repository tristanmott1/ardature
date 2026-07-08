import { type PointerEvent as ReactPointerEvent, type WheelEvent, useEffect, useRef, useState } from "react";
import { HitTargetLayer } from "./HitTargetLayer";
import { StaticMapInk } from "./StaticMapInk";
import { TerritoryFillLayer } from "./TerritoryFillLayer";
import { TroopMarkerLayer } from "./TroopMarkerLayer";
import type { GeneratedMapData, TerritoryState } from "../mapTypes";

type MapTransform = {
  scale: number;
  x: number;
  y: number;
};

type PointerPoint = {
  id: number;
  x: number;
  y: number;
};

const MIN_SCALE = 1;
const MAX_SCALE = 8;

export function MapView({
  mapData,
  onTerritoryPress,
  territoryStates,
}: {
  mapData: GeneratedMapData;
  onTerritoryPress: (territoryId: string) => void;
  territoryStates: Record<string, TerritoryState>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pointersRef = useRef(new Map<number, PointerPoint>());
  const suppressClickRef = useRef(false);
  const transformRef = useRef<MapTransform>({ scale: 1, x: 0, y: 0 });
  const [transform, setTransformState] = useState<MapTransform>(transformRef.current);

  function setTransform(nextTransform: MapTransform) {
    const next = clampTransform(nextTransform, mapData.width, mapData.height);
    transformRef.current = next;
    setTransformState(next);
  }

  function svgPoint(clientX: number, clientY: number) {
    const svg = svgRef.current;

    if (!svg) {
      return null;
    }

    const matrix = svg.getScreenCTM();
    if (!matrix) {
      return null;
    }

    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const mapped = point.matrixTransform(matrix.inverse());
    return { x: mapped.x, y: mapped.y };
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const point = svgPoint(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { id: event.pointerId, ...point });
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }

    const point = svgPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    const before = orderedPointers();
    pointersRef.current.set(event.pointerId, { id: event.pointerId, ...point });
    const after = orderedPointers();

    if (before.length === 1 && after.length === 1) {
      const dx = after[0].x - before[0].x;
      const dy = after[0].y - before[0].y;
      const current = transformRef.current;

      if (Math.hypot(dx, dy) > 4) {
        suppressClickRef.current = true;
      }

      setTransform({ ...current, x: current.x + dx, y: current.y + dy });
      return;
    }

    if (before.length >= 2 && after.length >= 2) {
      suppressClickRef.current = true;
      const previousCenter = midpoint(before[0], before[1]);
      const nextCenter = midpoint(after[0], after[1]);
      const previousDistance = distance(before[0], before[1]);
      const nextDistance = distance(after[0], after[1]);

      if (previousDistance > 0 && nextDistance > 0) {
        zoomAt(previousCenter, nextCenter, nextDistance / previousDistance);
      }
    }
  }

  function handlePointerEnd(event: ReactPointerEvent<SVGSVGElement>) {
    pointersRef.current.delete(event.pointerId);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    window.setTimeout(() => {
      suppressClickRef.current = false;
    });
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    const focus = svgPoint(event.clientX, event.clientY);

    if (!focus) {
      return;
    }

    event.preventDefault();
    zoomAt(focus, focus, event.deltaY > 0 ? 0.9 : 1.1);
  }

  function zoomAt(previousFocus: PointerPoint | { x: number; y: number }, nextFocus: PointerPoint | { x: number; y: number }, factor: number) {
    const current = transformRef.current;
    const scale = clampScale(current.scale * factor);
    const mapX = (previousFocus.x - current.x) / current.scale;
    const mapY = (previousFocus.y - current.y) / current.scale;

    setTransform({
      scale,
      x: nextFocus.x - mapX * scale,
      y: nextFocus.y - mapY * scale,
    });
  }

  function orderedPointers() {
    return [...pointersRef.current.values()].sort((left, right) => left.id - right.id);
  }

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  return (
    <div className="map-shell">
      <svg
        aria-label="Ardature map"
        className="map-svg"
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onWheel={handleWheel}
        preserveAspectRatio="xMidYMid meet"
        ref={svgRef}
        viewBox={`0 0 ${mapData.width} ${mapData.height}`}
      >
        <rect
          className="background-piece"
          data-background-piece="true"
          fill={mapData.backgroundColor}
          height={mapData.height}
          width={mapData.width}
          x="0"
          y="0"
        />
        <g className="map-content" data-map-content="true" transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
          <TerritoryFillLayer mapData={mapData} territoryStates={territoryStates} />
          <StaticMapInk ink={mapData.staticInk} />
          <TroopMarkerLayer />
          <HitTargetLayer
            isClickSuppressed={() => suppressClickRef.current}
            mapData={mapData}
            onTerritoryPress={onTerritoryPress}
          />
        </g>
      </svg>
    </div>
  );
}

function clampScale(scale: number) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

function clampTransform(transform: MapTransform, width: number, height: number): MapTransform {
  const scale = clampScale(transform.scale);
  const minX = width - width * scale;
  const minY = height - height * scale;

  return {
    scale,
    x: Math.max(minX, Math.min(0, transform.x)),
    y: Math.max(minY, Math.min(0, transform.y)),
  };
}

function distance(first: PointerPoint, second: PointerPoint) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function midpoint(first: PointerPoint, second: PointerPoint): PointerPoint {
  return {
    id: first.id,
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}
