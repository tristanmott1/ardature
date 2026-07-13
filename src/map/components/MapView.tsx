import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Crosshair, Maximize } from "lucide-react";
import { HitTargetLayer } from "./HitTargetLayer";
import { StaticMapInk } from "./StaticMapInk";
import { TerritoryFillLayer } from "./TerritoryFillLayer";
import { TroopMarkerLayer, type TroopMarker } from "./TroopMarkerLayer";
import type { GeneratedMapData, MapBounds, MapViewport, TerritoryState } from "../mapTypes";

type PointerPoint = {
  id: number;
  pointerType: string;
  startClientX: number;
  startClientY: number;
  clientX: number;
  clientY: number;
  moved: boolean;
  territoryId: string | null;
};

type PanSample = {
  clientX: number;
  clientY: number;
  time: number;
};

type PanVelocity = {
  x: number;
  y: number;
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
const PRESS_MOVE_THRESHOLD = 5;
const PAN_MOMENTUM_SAMPLE_MS = 100;
const PAN_MOMENTUM_MIN_SPEED = 0.1;
const PAN_MOMENTUM_MAX_SPEED = 2.5;
const PAN_MOMENTUM_STOP_SPEED = 0.02;
const PAN_MOMENTUM_DECAY_MS = 300;
const PAN_MOMENTUM_MAX_MS = 900;

export function MapView({
  frozen = false,
  mapData,
  onMapPress,
  onTerritoryPress,
  resetCameraKey = 0,
  selectedTerritoryId,
  autoFocusEnabled = false,
  onAutoFocusChange,
  showCameraControls = true,
  territoryStates,
  troopMarkers = [],
}: {
  frozen?: boolean;
  mapData: GeneratedMapData;
  onMapPress?: () => void;
  onTerritoryPress?: (territoryId: string) => void;
  resetCameraKey?: number;
  selectedTerritoryId: string | null;
  autoFocusEnabled?: boolean;
  onAutoFocusChange?: (enabled: boolean) => void;
  showCameraControls?: boolean;
  territoryStates: Record<string, TerritoryState>;
  troopMarkers?: readonly TroopMarker[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pointersRef = useRef(new Map<number, PointerPoint>());
  const hadMultiplePointersRef = useRef(false);
  const panSamplesRef = useRef<PanSample[]>([]);
  const momentumFrameRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const previousSelectedTerritoryIdRef = useRef<string | null>(null);
  const viewportRef = useRef<MapViewport>(mapData.homeViewport);
  const [isAnimating, setIsAnimatingState] = useState(false);
  const [viewport, setViewportState] = useState<MapViewport>(viewportRef.current);

  function setViewport(nextViewport: MapViewport) {
    const next = constrainViewport(nextViewport, mapData.width, mapData.height);
    viewportRef.current = next;
    setViewportState(next);
    return next;
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
    if (frozen) {
      return;
    }

    stopPanMomentum();

    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    if (pointersRef.current.size > 0) {
      hadMultiplePointersRef.current = true;
      panSamplesRef.current = [];
    }

    pointersRef.current.set(event.pointerId, {
      id: event.pointerId,
      pointerType: event.pointerType,
      startClientX: event.clientX,
      startClientY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      moved: false,
      territoryId: territoryIdFromTarget(event.target),
    });

    if (event.pointerType === "touch" && pointersRef.current.size === 1 && !isAnimatingRef.current) {
      addPanSample(event.clientX, event.clientY);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (frozen) {
      return;
    }

    const pointer = pointersRef.current.get(event.pointerId);

    if (!pointer) {
      return;
    }

    const before = orderedPointers();
    const beforePoints = viewportPoints(before);
    const moved = pointer.moved || Math.hypot(
      event.clientX - pointer.startClientX,
      event.clientY - pointer.startClientY,
    ) > PRESS_MOVE_THRESHOLD;

    pointersRef.current.set(event.pointerId, {
      ...pointer,
      clientX: event.clientX,
      clientY: event.clientY,
      moved,
    });

    if (isAnimatingRef.current) {
      return;
    }

    const after = orderedPointers();
    const afterPoints = viewportPoints(after);

    if (pointer.pointerType === "touch" && after.length === 1 && !hadMultiplePointersRef.current) {
      addPanSample(event.clientX, event.clientY);
    }

    if (!beforePoints || !afterPoints) {
      return;
    }

    if (before.length === 1 && after.length === 1) {
      const dx = beforePoints[0].x - afterPoints[0].x;
      const dy = beforePoints[0].y - afterPoints[0].y;
      const current = viewportRef.current;

      setViewport({ ...current, x: current.x + dx, y: current.y + dy });
      return;
    }

    if (before.length >= 2 && after.length >= 2) {
      const previousCenter = midpoint(beforePoints[0], beforePoints[1]);
      const nextCenter = midpoint(afterPoints[0], afterPoints[1]);
      const previousDistance = screenDistance(before[0], before[1]);
      const nextDistance = screenDistance(after[0], after[1]);

      if (previousDistance > 0 && nextDistance > 0) {
        zoomAt(previousCenter, nextCenter, nextDistance / previousDistance);
      }
    }
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (frozen) {
      return;
    }

    const pointer = pointersRef.current.get(event.pointerId);

    if (!pointer) {
      return;
    }

    const moved = pointer.moved || Math.hypot(
      event.clientX - pointer.startClientX,
      event.clientY - pointer.startClientY,
    ) > PRESS_MOVE_THRESHOLD;
    const shouldPress = !moved && !hadMultiplePointersRef.current;
    const momentum = moved && pointer.pointerType === "touch" && !hadMultiplePointersRef.current && !isAnimatingRef.current
      ? panVelocity(event.clientX, event.clientY)
      : null;

    pointersRef.current.delete(event.pointerId);
    resetGestureWhenComplete();

    if (!shouldPress) {
      if (momentum) {
        startPanMomentum(momentum);
      }

      return;
    }

    if (pointer.territoryId) {
      onTerritoryPress?.(pointer.territoryId);
      return;
    }

    onMapPress?.();
  }

  function handlePointerCancel(event: ReactPointerEvent<SVGSVGElement>) {
    stopPanMomentum();
    panSamplesRef.current = [];
    pointersRef.current.delete(event.pointerId);
    resetGestureWhenComplete();
  }

  function handleLostPointerCapture(event: ReactPointerEvent<SVGSVGElement>) {
    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }

    stopPanMomentum();
    panSamplesRef.current = [];
    pointersRef.current.delete(event.pointerId);
    resetGestureWhenComplete();
  }

  function resetGestureWhenComplete() {
    if (pointersRef.current.size === 0) {
      hadMultiplePointersRef.current = false;
      panSamplesRef.current = [];
    }
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();

    if (frozen) {
      return;
    }

    stopPanMomentum();

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

  function returnToMapView() {
    startFocusAnimation(mapData.homeViewport);
  }

  function toggleAutoFocus() {
    onAutoFocusChange?.(!autoFocusEnabled);
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
      setIsAnimating(false);
    }

    animationFrameRef.current = window.requestAnimationFrame(step);
  }

  function stopFocusAnimation() {
    stopPanMomentum();

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    pointersRef.current.clear();
    hadMultiplePointersRef.current = false;
    setIsAnimating(false);
  }

  function addPanSample(clientX: number, clientY: number) {
    const time = performance.now();
    const cutoff = time - PAN_MOMENTUM_SAMPLE_MS;
    panSamplesRef.current.push({ clientX, clientY, time });
    panSamplesRef.current = panSamplesRef.current.filter((sample) => sample.time >= cutoff);
  }

  function panVelocity(clientX: number, clientY: number) {
    addPanSample(clientX, clientY);
    const first = panSamplesRef.current[0];
    const last = panSamplesRef.current[panSamplesRef.current.length - 1];
    const duration = last.time - first.time;

    if (duration <= 0) {
      return null;
    }

    let x = (last.clientX - first.clientX) / duration;
    let y = (last.clientY - first.clientY) / duration;
    const speed = Math.hypot(x, y);

    if (speed < PAN_MOMENTUM_MIN_SPEED) {
      return null;
    }

    if (speed > PAN_MOMENTUM_MAX_SPEED) {
      const scale = PAN_MOMENTUM_MAX_SPEED / speed;
      x *= scale;
      y *= scale;
    }

    return { x, y };
  }

  function startPanMomentum(velocity: PanVelocity) {
    stopPanMomentum();
    const startTime = performance.now();
    let previousTime = startTime;
    let velocityX = velocity.x;
    let velocityY = velocity.y;

    // Continue the released touch pan with frame-rate-independent friction.
    function step(now: number) {
      const svg = svgRef.current;

      if (!svg || svg.clientWidth <= 0 || svg.clientHeight <= 0 || now - startTime >= PAN_MOMENTUM_MAX_MS) {
        stopPanMomentum();
        return;
      }

      const elapsed = Math.min(32, Math.max(0, now - previousTime));
      const current = viewportRef.current;
      const requested = {
        ...current,
        x: current.x - velocityX * (current.width / svg.clientWidth) * elapsed,
        y: current.y - velocityY * (current.height / svg.clientHeight) * elapsed,
      };
      const next = setViewport(requested);

      if (Math.abs(next.x - requested.x) > 0.001) {
        velocityX = 0;
      }

      if (Math.abs(next.y - requested.y) > 0.001) {
        velocityY = 0;
      }

      const decay = Math.exp(-elapsed / PAN_MOMENTUM_DECAY_MS);
      velocityX *= decay;
      velocityY *= decay;
      previousTime = now;

      if (Math.hypot(velocityX, velocityY) < PAN_MOMENTUM_STOP_SPEED) {
        stopPanMomentum();
        return;
      }

      momentumFrameRef.current = window.requestAnimationFrame(step);
    }

    momentumFrameRef.current = window.requestAnimationFrame(step);
  }

  function stopPanMomentum() {
    if (momentumFrameRef.current !== null) {
      window.cancelAnimationFrame(momentumFrameRef.current);
      momentumFrameRef.current = null;
    }
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
    stopPanMomentum();
    setViewport(mapData.homeViewport);
  }, [mapData.homeViewport]);

  useEffect(() => {
    const previousSelectedTerritoryId = previousSelectedTerritoryIdRef.current;
    previousSelectedTerritoryIdRef.current = selectedTerritoryId;

    if (!selectedTerritoryId) {
      if (previousSelectedTerritoryId || isAnimatingRef.current) {
        stopFocusAnimation();
      }

      return;
    }

    if (!autoFocusEnabled) {
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
  }, [autoFocusEnabled, mapData, selectedTerritoryId]);

  useEffect(() => {
    if (resetCameraKey > 0) {
      returnToMapView();
    }
  }, [resetCameraKey]);

  useEffect(() => {
    if (frozen || !showCameraControls) {
      stopPanMomentum();
    }

    if (frozen) {
      pointersRef.current.clear();
      hadMultiplePointersRef.current = false;
      panSamplesRef.current = [];
    }
  }, [frozen, showCameraControls]);

  useEffect(() => {
    function stopForResize() {
      stopPanMomentum();
    }

    window.addEventListener("resize", stopForResize);
    return () => window.removeEventListener("resize", stopForResize);
  }, []);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }

      if (momentumFrameRef.current !== null) {
        window.cancelAnimationFrame(momentumFrameRef.current);
      }

    };
  }, []);

  return (
    <div className="map-shell">
      <svg
        aria-label="Ardatúrë map"
        className="map-svg"
        data-map-animating={isAnimating ? "true" : "false"}
        onLostPointerCapture={handleLostPointerCapture}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
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
          <TroopMarkerLayer markers={troopMarkers} />
          {onTerritoryPress ? (
            <HitTargetLayer
              mapData={mapData}
              onTerritoryPress={onTerritoryPress}
            />
          ) : null}
        </g>
      </svg>
      {showCameraControls && !isAnimating ? (
        <>
          <button
            aria-label="Return to map view"
            className="map-camera-control map-zoom-out"
            onClick={returnToMapView}
            type="button"
          >
            <Maximize size={34} strokeWidth={2.2} />
          </button>
          <button
            aria-label={autoFocusEnabled ? "Disable automatic focus" : "Enable automatic focus"}
            aria-pressed={autoFocusEnabled}
            className="map-camera-control map-auto-focus"
            data-enabled={autoFocusEnabled ? "true" : "false"}
            onClick={toggleAutoFocus}
            type="button"
          >
            <Crosshair size={31} strokeWidth={2.2} />
          </button>
        </>
      ) : null}
    </div>
  );
}

function territoryIdFromTarget(target: EventTarget) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest("[data-territory-hit]")?.getAttribute("data-territory-hit") ?? null;
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
