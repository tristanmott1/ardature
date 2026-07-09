import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ZoomOut } from "lucide-react";
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

const MIN_FOCUS_ANIMATION_MS = 180;
const MAX_FOCUS_ANIMATION_MS = 850;
const FOCUS_DURATION_PER_DISTANCE = 900;
const FOCUS_SKIP_THRESHOLD = 0.01;
const MIN_VIEWPORT_SIZE = 400;

export function MapView({
  mapData,
  onTerritoryPress,
  resetCameraKey = 0,
  selectedTerritoryId,
  showZoomOutControl = true,
  territoryStates,
}: {
  mapData: GeneratedMapData;
  onTerritoryPress?: (territoryId: string) => void;
  resetCameraKey?: number;
  selectedTerritoryId: string | null;
  showZoomOutControl?: boolean;
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
    const next = constrainViewport(nextViewport, mapData.width, mapData.height);
    viewportRef.current = next;
    setViewportState(next);
  }

  function setIsAnimating(nextIsAnimating: boolean) {
    isAnimatingRef.current = nextIsAnimating;
    setIsAnimatingState(nextIsAnimating);
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
    return {
      x: mapped.x,
      y: mapped.y,
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
    const nextViewport = {
      width,
      height,
      x: previousFocus.x - ratioX * width,
      y: previousFocus.y - ratioY * height,
    };

    setViewport(nextViewport);
  }

  function zoomOutToFullMap() {
    startFocusAnimation(fullMapViewport(mapData.width, mapData.height));
  }

  function startFocusAnimation(targetViewport: MapViewport) {
    stopFocusAnimation();

    const target = constrainViewport(targetViewport, mapData.width, mapData.height);
    const startViewport = viewportRef.current;
    const duration = focusAnimationDuration(startViewport, target);

    if (duration === 0) {
      setViewport(target);
      return;
    }

    const startTime = performance.now();
    setIsAnimating(true);

    // Ease the visible viewBox into the selected territory bounds.
    function step(now: number) {
      const progress = Math.min(1, (now - startTime) / duration);
      setViewport(lerpViewport(startViewport, target, easeInOutCubic(progress)));

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(step);
        return;
      }

      animationFrameRef.current = null;
      setViewport(target);
      suppressClickRef.current = false;
      setIsAnimating(false);
    }

    animationFrameRef.current = window.requestAnimationFrame(step);
  }

  function stopFocusAnimation() {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    pointersRef.current.clear();
    suppressClickRef.current = false;
    setIsAnimating(false);
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
    setViewport(fullMapViewport(mapData.width, mapData.height));
  }, [mapData.height, mapData.width]);

  useEffect(() => {
    const previousSelectedTerritoryId = previousSelectedTerritoryIdRef.current;
    previousSelectedTerritoryIdRef.current = selectedTerritoryId;

    if (!selectedTerritoryId) {
      if (previousSelectedTerritoryId || isAnimatingRef.current) {
        stopFocusAnimation();
      }

      return;
    }

    if (selectedTerritoryId === previousSelectedTerritoryId) {
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
    if (resetCameraKey > 0) {
      zoomOutToFullMap();
    }
  }, [resetCameraKey]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }

    };
  }, []);

  return (
    <div className="map-shell">
      <svg
        aria-label="Ardatúrë map"
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
          {onTerritoryPress ? (
            <HitTargetLayer
              isClickSuppressed={() => suppressClickRef.current}
              isImmediatePress={() => isAnimatingRef.current}
              mapData={mapData}
              onTerritoryPress={onTerritoryPress}
            />
          ) : null}
        </g>
      </svg>
      {showZoomOutControl ? (
        <button className="map-zoom-out" type="button" onClick={zoomOutToFullMap} aria-label="Zoom out">
          <ZoomOut size={34} strokeWidth={2.2} />
        </button>
      ) : null}
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

function fullMapViewport(mapWidth: number, mapHeight: number): MapViewport {
  return {
    x: 0,
    y: 0,
    width: mapWidth,
    height: mapHeight,
  };
}

function constrainViewport(viewport: MapViewport, mapWidth: number, mapHeight: number): MapViewport {
  if (
    !Number.isFinite(viewport.x) ||
    !Number.isFinite(viewport.y) ||
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return fullMapViewport(mapWidth, mapHeight);
  }

  const center = viewportCenter(viewport);
  const minimumScale = Math.max(
    MIN_VIEWPORT_SIZE / viewport.width,
    MIN_VIEWPORT_SIZE / viewport.height,
    1,
  );
  let width = viewport.width * minimumScale;
  let height = viewport.height * minimumScale;

  // Let each dimension reach the map edge so the whole map can be viewed.
  width = clamp(width, Math.min(MIN_VIEWPORT_SIZE, mapWidth), mapWidth);
  height = clamp(height, Math.min(MIN_VIEWPORT_SIZE, mapHeight), mapHeight);

  return {
    width,
    height,
    x: clamp(center.x - width / 2, 0, Math.max(0, mapWidth - width)),
    y: clamp(center.y - height / 2, 0, Math.max(0, mapHeight - height)),
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function focusAnimationDuration(start: MapViewport, target: MapViewport) {
  const distance = viewportTransitionDistance(start, target);

  if (distance < FOCUS_SKIP_THRESHOLD) {
    return 0;
  }

  return Math.max(
    MIN_FOCUS_ANIMATION_MS,
    Math.min(MAX_FOCUS_ANIMATION_MS, distance * FOCUS_DURATION_PER_DISTANCE),
  );
}

function viewportTransitionDistance(start: MapViewport, target: MapViewport) {
  const halfwayWidth = (start.width + target.width) / 2;
  const halfwayHeight = (start.height + target.height) / 2;
  const halfwayDiagonal = Math.hypot(halfwayWidth, halfwayHeight);

  if (halfwayDiagonal <= 0) {
    return 0;
  }

  // Normalize pan and zoom against the same halfway viewport diagonal.
  const startCenter = viewportCenter(start);
  const targetCenter = viewportCenter(target);
  const zoomValue = Math.hypot(
    Math.abs(start.width - target.width) / 2,
    Math.abs(start.height - target.height) / 2,
  ) / halfwayDiagonal;
  const panValue = Math.hypot(
    targetCenter.x - startCenter.x,
    targetCenter.y - startCenter.y,
  ) / halfwayDiagonal;

  return Math.hypot(zoomValue, panValue);
}

function viewportCenter(viewport: MapViewport): ViewportPoint {
  return {
    x: viewport.x + viewport.width / 2,
    y: viewport.y + viewport.height / 2,
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
