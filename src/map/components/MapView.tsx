import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { HitTargetLayer } from "./HitTargetLayer";
import { StaticMapInk } from "./StaticMapInk";
import { TerritoryFillLayer } from "./TerritoryFillLayer";
import { TroopMarkerLayer } from "./TroopMarkerLayer";
import type { GeneratedMapData, MapBounds, TerritoryState } from "../mapTypes";

type MapViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PointerPoint = {
  id: number;
  x: number;
  y: number;
};

const FOCUS_ANIMATION_MS = 500;
const MIN_VIEWPORT_SIZE = 400;

export function MapView({
  mapData,
  onAnimationChange,
  onTerritoryPress,
  selectedTerritoryId,
  territoryStates,
}: {
  mapData: GeneratedMapData;
  onAnimationChange: (isAnimating: boolean) => void;
  onTerritoryPress: (territoryId: string) => void;
  selectedTerritoryId: string | null;
  territoryStates: Record<string, TerritoryState>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pointersRef = useRef(new Map<number, PointerPoint>());
  const suppressClickRef = useRef(false);
  const isAnimatingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const previousSelectedTerritoryIdRef = useRef<string | null>(null);
  const viewportRef = useRef<MapViewport>({ x: 0, y: 0, width: mapData.width, height: mapData.height });
  const [isAnimating, setIsAnimatingState] = useState(false);
  const [viewport, setViewportState] = useState<MapViewport>(viewportRef.current);

  function setViewport(nextViewport: MapViewport) {
    const next = normalizeViewport(nextViewport);
    viewportRef.current = next;
    setViewportState(next);
  }

  function setIsAnimating(nextIsAnimating: boolean) {
    isAnimatingRef.current = nextIsAnimating;
    setIsAnimatingState(nextIsAnimating);
    onAnimationChange(nextIsAnimating);
  }

  function viewportPoint(clientX: number, clientY: number) {
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
    if (isAnimatingRef.current) {
      return;
    }

    const point = viewportPoint(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { id: event.pointerId, ...point });
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (isAnimatingRef.current || !pointersRef.current.has(event.pointerId)) {
      return;
    }

    const point = viewportPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    const before = orderedPointers();
    pointersRef.current.set(event.pointerId, { id: event.pointerId, ...point });
    const after = orderedPointers();

    if (before.length === 1 && after.length === 1) {
      const dx = before[0].x - after[0].x;
      const dy = before[0].y - after[0].y;
      const current = viewportRef.current;

      if (Math.hypot(dx, dy) > 4) {
        suppressClickRef.current = true;
      }

      setViewport({ ...current, x: current.x + dx, y: current.y + dy });
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
    event.preventDefault();

    if (isAnimatingRef.current) {
      return;
    }

    const focus = viewportPoint(event.clientX, event.clientY);

    if (!focus) {
      return;
    }

    zoomAt(focus, focus, event.deltaY > 0 ? 0.9 : 1.1);
  }

  function zoomAt(previousFocus: PointerPoint | { x: number; y: number }, nextFocus: PointerPoint | { x: number; y: number }, factor: number) {
    const current = viewportRef.current;
    const width = current.width / factor;
    const height = current.height / factor;
    const ratioX = (nextFocus.x - current.x) / current.width;
    const ratioY = (nextFocus.y - current.y) / current.height;
    const nextViewport = normalizeViewport({
      width,
      height,
      x: previousFocus.x - ratioX * width,
      y: previousFocus.y - ratioY * height,
    });

    setViewport(nextViewport);
  }

  function startFocusAnimation(targetViewport: MapViewport) {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }

    const startViewport = viewportRef.current;
    const startTime = performance.now();
    pointersRef.current.clear();
    suppressClickRef.current = true;
    setIsAnimating(true);

    // Linearly interpolate the visible viewBox into the selected territory bounds.
    function step(now: number) {
      const progress = Math.min(1, (now - startTime) / FOCUS_ANIMATION_MS);
      setViewport(lerpViewport(startViewport, targetViewport, progress));

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(step);
        return;
      }

      animationFrameRef.current = null;
      setViewport(targetViewport);
      suppressClickRef.current = false;
      setIsAnimating(false);
    }

    animationFrameRef.current = window.requestAnimationFrame(step);
  }

  function orderedPointers() {
    return [...pointersRef.current.values()].sort((left, right) => left.id - right.id);
  }

  useLayoutEffect(() => {
    const svg = svgRef.current;

    if (!svg) {
      return;
    }

    const bounds = svg.getBoundingClientRect();
    const aspect = bounds.width > 0 && bounds.height > 0
      ? bounds.width / bounds.height
      : mapData.width / mapData.height;

    setViewport(fitBoundsToAspect({ minX: 0, minY: 0, maxX: mapData.width, maxY: mapData.height }, aspect));
  }, [mapData.height, mapData.width]);

  useEffect(() => {
    const previousSelectedTerritoryId = previousSelectedTerritoryIdRef.current;
    previousSelectedTerritoryIdRef.current = selectedTerritoryId;

    if (!selectedTerritoryId || selectedTerritoryId === previousSelectedTerritoryId) {
      return;
    }

    const selectedTerritory = mapData.territories.find((territory) => territory.id === selectedTerritoryId);
    const svg = svgRef.current;

    if (!selectedTerritory || !svg) {
      return;
    }

    const bounds = svg.getBoundingClientRect();
    const aspect = bounds.width > 0 && bounds.height > 0
      ? bounds.width / bounds.height
      : mapData.width / mapData.height;

    startFocusAnimation(fitBoundsToAspect(selectedTerritory.focusBounds, aspect));
  }, [mapData, selectedTerritoryId]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }

      onAnimationChange(false);
    };
  }, [onAnimationChange]);

  return (
    <div className="map-shell">
      <svg
        aria-label="Ardature map"
        className="map-svg"
        data-map-animating={isAnimating ? "true" : "false"}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onWheel={handleWheel}
        ref={svgRef}
        viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
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
        <g className="map-content" data-map-content="true">
          <TerritoryFillLayer mapData={mapData} territoryStates={territoryStates} />
          <StaticMapInk ink={mapData.staticInk} />
          <TroopMarkerLayer />
          <HitTargetLayer
            isClickSuppressed={() => isAnimatingRef.current || suppressClickRef.current}
            mapData={mapData}
            onTerritoryPress={onTerritoryPress}
          />
        </g>
      </svg>
    </div>
  );
}

function fitBoundsToAspect(bounds: MapBounds, aspect: number): MapViewport {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const boundsAspect = width / height;

  if (aspect > boundsAspect) {
    const targetWidth = height * aspect;
    return {
      x: centerX - targetWidth / 2,
      y: bounds.minY,
      width: targetWidth,
      height,
    };
  }

  const targetHeight = width / aspect;
  return {
    x: bounds.minX,
    y: centerY - targetHeight / 2,
    width,
    height: targetHeight,
  };
}

function normalizeViewport(viewport: MapViewport): MapViewport {
  const scale = Math.max(
    MIN_VIEWPORT_SIZE / viewport.width,
    MIN_VIEWPORT_SIZE / viewport.height,
    1,
  );

  if (scale === 1) {
    return viewport;
  }

  const width = viewport.width * scale;
  const height = viewport.height * scale;
  return {
    width,
    height,
    x: viewport.x - (width - viewport.width) / 2,
    y: viewport.y - (height - viewport.height) / 2,
  };
}

function lerpViewport(start: MapViewport, end: MapViewport, progress: number): MapViewport {
  return {
    x: lerp(start.x, end.x, progress),
    y: lerp(start.y, end.y, progress),
    width: lerp(start.width, end.width, progress),
    height: lerp(start.height, end.height, progress),
  };
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
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
