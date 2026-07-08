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
  clientX: number;
  clientY: number;
};

type ViewportPoint = {
  x: number;
  y: number;
};

const MIN_FOCUS_ANIMATION_MS = 120;
const MAX_FOCUS_ANIMATION_MS = 600;
const FOCUS_DURATION_PER_SCORE = 260;
const FOCUS_SKIP_THRESHOLD = 0.01;
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

    const bounds = svg.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return null;
    }

    const current = viewportRef.current;
    return {
      x: current.x + ((clientX - bounds.left) / bounds.width) * current.width,
      y: current.y + ((clientY - bounds.top) / bounds.height) * current.height,
    };
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
    pointersRef.current.set(event.pointerId, { id: event.pointerId, clientX: event.clientX, clientY: event.clientY });
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (isAnimatingRef.current || !pointersRef.current.has(event.pointerId)) {
      return;
    }

    const before = orderedPointers();
    const beforePoints = viewportPoints(before);

    pointersRef.current.set(event.pointerId, { id: event.pointerId, clientX: event.clientX, clientY: event.clientY });
    const after = orderedPointers();
    const afterPoints = viewportPoints(after);

    if (!beforePoints || !afterPoints) {
      return;
    }

    if (before.length === 1 && after.length === 1) {
      const dx = beforePoints[0].x - afterPoints[0].x;
      const dy = beforePoints[0].y - afterPoints[0].y;
      const current = viewportRef.current;

      if (Math.hypot(before[0].clientX - after[0].clientX, before[0].clientY - after[0].clientY) > 4) {
        suppressClickRef.current = true;
      }

      setViewport({ ...current, x: current.x + dx, y: current.y + dy });
      return;
    }

    if (before.length >= 2 && after.length >= 2) {
      suppressClickRef.current = true;
      const previousCenter = midpoint(beforePoints[0], beforePoints[1]);
      const nextCenter = midpoint(afterPoints[0], afterPoints[1]);
      const previousDistance = screenDistance(before[0], before[1]);
      const nextDistance = screenDistance(after[0], after[1]);

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

    zoomAt(focus, focus, wheelZoomFactor(event));
  }

  function zoomAt(previousFocus: ViewportPoint, nextFocus: ViewportPoint, factor: number) {
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
      animationFrameRef.current = null;
    }

    const startViewport = viewportRef.current;
    const duration = focusAnimationDuration(startViewport, targetViewport);
    pointersRef.current.clear();

    if (duration === 0) {
      suppressClickRef.current = false;
      setViewport(targetViewport);
      setIsAnimating(false);
      return;
    }

    const startTime = performance.now();
    suppressClickRef.current = true;
    setIsAnimating(true);

    // Ease the visible viewBox into the selected territory bounds.
    function step(now: number) {
      const progress = Math.min(1, (now - startTime) / duration);
      setViewport(lerpViewport(startViewport, targetViewport, easeInOutCubic(progress)));

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

  function viewportPoints(points: PointerPoint[]) {
    const result: ViewportPoint[] = [];

    // Convert all active touches through the same current viewBox.
    for (const point of points) {
      const mapped = viewportPoint(point.clientX, point.clientY);

      if (!mapped) {
        return null;
      }

      result.push(mapped);
    }

    return result;
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

function focusAnimationDuration(start: MapViewport, target: MapViewport) {
  const startCenter = viewportCenter(start);
  const targetCenter = viewportCenter(target);
  const centerDistanceRatio = Math.hypot(targetCenter.x - startCenter.x, targetCenter.y - startCenter.y) / viewportDiagonal(start);
  const zoomDistance = Math.abs(Math.log(target.width / start.width));
  const motionScore = Math.max(centerDistanceRatio, zoomDistance);

  if (motionScore < FOCUS_SKIP_THRESHOLD) {
    return 0;
  }

  return Math.max(
    MIN_FOCUS_ANIMATION_MS,
    Math.min(MAX_FOCUS_ANIMATION_MS, motionScore * FOCUS_DURATION_PER_SCORE),
  );
}

function viewportCenter(viewport: MapViewport): ViewportPoint {
  return {
    x: viewport.x + viewport.width / 2,
    y: viewport.y + viewport.height / 2,
  };
}

function viewportDiagonal(viewport: MapViewport) {
  return Math.hypot(viewport.width, viewport.height);
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

function easeInOutCubic(progress: number) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function wheelZoomFactor(event: WheelEvent<SVGSVGElement>) {
  const pageScale = typeof window === "undefined" ? 800 : window.innerHeight;
  const delta = event.deltaMode === 1
    ? event.deltaY * 16
    : event.deltaMode === 2
      ? event.deltaY * pageScale
      : event.deltaY;

  return Math.max(0.75, Math.min(1.35, Math.exp(-delta * 0.0012)));
}

function screenDistance(first: PointerPoint, second: PointerPoint) {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function midpoint(first: ViewportPoint, second: ViewportPoint): ViewportPoint {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}
