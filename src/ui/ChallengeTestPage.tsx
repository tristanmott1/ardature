import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";

const AIM_SENSITIVITY = 4.9;
const AIM_MAX_SPEED = 1000;
const AIM_MIN_DRAW_MS = 500;
const AIM_PROGRESS_DELAY_MS = 3000;
const AIM_PROGRESS_FILL_MS = 5000;
const SHOT_ANIMATION_MS = 500;
const WIND_POWER_MAX = 5;
const TARGET_RING_COUNT = 10;

const TARGET_RINGS = [
  "#b72432",
  "#f0ca45",
  "#245f9f",
  "#f1e3bc",
  "#b72432",
  "#245f9f",
  "#f0ca45",
  "#f1e3bc",
  "#b72432",
  "#245f9f",
  "#f0ca45",
  "#7d4a24",
];

type Point = {
  x: number;
  y: number;
};

type Wind = {
  angle: number;
  power: number;
};

type AimView = {
  cursor: Point;
  progress: number;
  progressVisible: boolean;
};

type ShotView = {
  from: Point;
  to: Point;
  startedAt: number;
};

function capVector(point: Point, maxMagnitude: number): Point {
  const magnitude = Math.hypot(point.x, point.y);

  if (magnitude <= maxMagnitude || magnitude === 0) {
    return point;
  }

  return {
    x: (point.x / magnitude) * maxMagnitude,
    y: (point.y / magnitude) * maxMagnitude,
  };
}

function clampPoint(point: Point, width: number, height: number): Point {
  return {
    x: Math.min(Math.max(point.x, 0), width),
    y: Math.min(Math.max(point.y, 0), height),
  };
}

function sampleWind(): Wind {
  return {
    angle: Math.random() * Math.PI * 2,
    power: Math.random() * WIND_POWER_MAX,
  };
}

export function ChallengeTestPage({ onExit }: { onExit: () => void }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<SVGSVGElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef<number | null>(null);
  const aimingRef = useRef(false);
  const startedAtRef = useRef(0);
  const initialPointerRef = useRef<Point>({ x: 0, y: 0 });
  const cursorRef = useRef<Point>({ x: 0, y: 0 });
  const velocityRef = useRef<Point>({ x: 0, y: 0 });
  const shotRef = useRef<ShotView | null>(null);
  const windRef = useRef<Wind>(sampleWind());

  const [attempts, setAttempts] = useState(0);
  const [squaredDistanceSum, setSquaredDistanceSum] = useState(0);
  const [wind, setWind] = useState(windRef.current);
  const [aimView, setAimView] = useState<AimView | null>(null);
  const [shot, setShot] = useState<ShotView | null>(null);
  const [latestHit, setLatestHit] = useState<Point | null>(null);

  const sigma = useMemo(() => {
    if (attempts === 0) {
      return "0";
    }

    return Math.sqrt(squaredDistanceSum / attempts).toFixed(1);
  }, [attempts, squaredDistanceSum]);

  useEffect(() => {
    windRef.current = wind;
  }, [wind]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  function stagePoint(event: ReactPointerEvent<HTMLDivElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function targetMetrics() {
    const stage = stageRef.current;
    const target = targetRef.current;

    if (!stage || !target) {
      return null;
    }

    const stageRect = stage.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const radius = Math.min(targetRect.width, targetRect.height) / 2;

    return {
      center: {
        x: targetRect.left - stageRect.left + targetRect.width / 2,
        y: targetRect.top - stageRect.top + targetRect.height / 2,
      },
      radius,
      ringSpacing: radius / TARGET_RING_COUNT,
      stageHeight: stageRect.height,
      stageWidth: stageRect.width,
    };
  }

  function stopAnimationIfIdle() {
    if (!aimingRef.current && !shotRef.current) {
      animationFrameRef.current = null;
      lastFrameAtRef.current = null;
      return true;
    }

    return false;
  }

  function completeShot() {
    if (!shotRef.current) {
      return;
    }

    setLatestHit(shotRef.current.to);
    shotRef.current = null;
    setShot(null);
    const nextWind = sampleWind();
    windRef.current = nextWind;
    setWind(nextWind);
  }

  function fireShot(now: number) {
    const metrics = targetMetrics();

    if (!aimingRef.current || !metrics) {
      return;
    }

    aimingRef.current = false;
    velocityRef.current = { x: 0, y: 0 };
    setAimView(null);

    const windOffset = windRef.current.power * metrics.ringSpacing;
    const hit = {
      x: cursorRef.current.x + Math.cos(windRef.current.angle) * windOffset,
      y: cursorRef.current.y + Math.sin(windRef.current.angle) * windOffset,
    };
    const distanceRings = Math.hypot(hit.x - metrics.center.x, hit.y - metrics.center.y) / metrics.ringSpacing;
    const nextShot = {
      from: { x: metrics.stageWidth / 2, y: metrics.stageHeight },
      to: hit,
      startedAt: now,
    };

    shotRef.current = nextShot;
    setShot(nextShot);
    setAttempts((current) => current + 1);
    setSquaredDistanceSum((current) => current + distanceRings * distanceRings);
  }

  function tick(now: number) {
    const stage = stageRef.current;
    const previousFrameAt = lastFrameAtRef.current ?? now;
    const dtSeconds = (now - previousFrameAt) / 1000;
    lastFrameAtRef.current = now;

    if (stage && aimingRef.current) {
      const elapsed = now - startedAtRef.current;
      const rect = stage.getBoundingClientRect();
      const nextCursor = clampPoint(
        {
          x: cursorRef.current.x + velocityRef.current.x * dtSeconds,
          y: cursorRef.current.y + velocityRef.current.y * dtSeconds,
        },
        rect.width,
        rect.height,
      );
      const progressElapsed = elapsed - AIM_PROGRESS_DELAY_MS;
      const progress = Math.min(Math.max(progressElapsed / AIM_PROGRESS_FILL_MS, 0), 1);

      cursorRef.current = nextCursor;
      setAimView({
        cursor: nextCursor,
        progress,
        progressVisible: progressElapsed >= 0,
      });

      if (progress >= 1) {
        fireShot(now);
      }
    }

    if (shotRef.current && now - shotRef.current.startedAt >= SHOT_ANIMATION_MS) {
      completeShot();
    }

    if (!stopAnimationIfIdle()) {
      animationFrameRef.current = requestAnimationFrame(tick);
    }
  }

  function startAnimation() {
    if (animationFrameRef.current === null) {
      lastFrameAtRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(tick);
    }
  }

  function cancelAim() {
    aimingRef.current = false;
    velocityRef.current = { x: 0, y: 0 };
    setAimView(null);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const stage = stageRef.current;

    if (!stage || aimingRef.current || shotRef.current) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const rect = stage.getBoundingClientRect();
    const cursor = { x: rect.width / 2, y: rect.height / 2 };

    aimingRef.current = true;
    startedAtRef.current = performance.now();
    initialPointerRef.current = stagePoint(event);
    cursorRef.current = cursor;
    velocityRef.current = { x: 0, y: 0 };
    setAimView({ cursor, progress: 0, progressVisible: false });
    startAnimation();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!aimingRef.current) {
      return;
    }

    event.preventDefault();
    const point = stagePoint(event);
    velocityRef.current = capVector(
      {
        x: (point.x - initialPointerRef.current.x) * AIM_SENSITIVITY,
        y: (point.y - initialPointerRef.current.y) * AIM_SENSITIVITY,
      },
      AIM_MAX_SPEED,
    );
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!aimingRef.current) {
      return;
    }

    event.preventDefault();

    const now = performance.now();

    if (now - startedAtRef.current < AIM_MIN_DRAW_MS) {
      cancelAim();
      return;
    }

    fireShot(now);
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (!aimingRef.current) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    cancelAim();
  }

  function restartChallenge() {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    aimingRef.current = false;
    shotRef.current = null;
    lastFrameAtRef.current = null;
    velocityRef.current = { x: 0, y: 0 };
    setAttempts(0);
    setSquaredDistanceSum(0);
    setAimView(null);
    setShot(null);
    setLatestHit(null);
    const nextWind = sampleWind();
    windRef.current = nextWind;
    setWind(nextWind);
  }

  return (
    <section className="challenge-test-page">
      <header className="challenge-test-topbar">
        <button className="icon-button" type="button" onClick={onExit} aria-label="Return home">
          <X size={20} />
        </button>
        <button className="icon-button" type="button" onClick={restartChallenge} aria-label="Restart challenge">
          <RotateCcw size={20} />
        </button>
      </header>
      <div
        className="challenge-test-stage"
        ref={stageRef}
        aria-label="Challenge test area"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <ChallengeTarget targetRef={targetRef} />
        <WindIndicator wind={wind} />
        {aimView ? <AimCursor aimView={aimView} /> : null}
        {shot ? <ShotLine shot={shot} /> : null}
        {latestHit ? <HitMark point={latestHit} /> : null}
      </div>
      <footer className="challenge-test-scorebar">
        <div className="challenge-score-item">
          <span>Attempts</span>
          <strong>{attempts}</strong>
        </div>
        <div className="challenge-score-item">
          <span>Sigma</span>
          <strong>{sigma}</strong>
        </div>
      </footer>
    </section>
  );
}

function ChallengeTarget({ targetRef }: { targetRef: RefObject<SVGSVGElement | null> }) {
  const ringCount = TARGET_RINGS.length;

  return (
    <svg ref={targetRef} className="challenge-target" viewBox="0 0 200 200" role="img" aria-label="Challenge target">
      {TARGET_RINGS.map((fill, index) => (
        <circle key={`${fill}-${index}`} cx="100" cy="100" r={96 - index * (90 / ringCount)} fill={fill} />
      ))}
      <circle cx="100" cy="100" r="96" fill="none" stroke="#2f1d12" strokeWidth="3" />
      <circle cx="100" cy="100" r="7" fill="#b72432" stroke="#2f1d12" strokeWidth="1.5" />
    </svg>
  );
}

function WindIndicator({ wind }: { wind: Wind }) {
  return (
    <div className="challenge-wind" aria-label={`Wind power ${wind.power.toFixed(1)}`}>
      <svg className="challenge-wind-arrow" viewBox="0 0 24 24" style={{ transform: `rotate(${wind.angle}rad)` }} aria-hidden="true">
        <path d="M3 12h15" />
        <path d="M13 6l6 6-6 6" />
      </svg>
      <span>{wind.power.toFixed(1)}</span>
    </div>
  );
}

function AimCursor({ aimView }: { aimView: AimView }) {
  const circumference = Math.PI * 68;

  return (
    <>
      <div className="challenge-aim-cursor" style={{ left: aimView.cursor.x, top: aimView.cursor.y }} aria-hidden="true">
        <span />
        <span />
      </div>
      {aimView.progressVisible ? (
        <svg className="challenge-progress-ring" viewBox="0 0 80 80" style={{ left: aimView.cursor.x, top: aimView.cursor.y }} aria-hidden="true">
          <circle className="challenge-progress-track" cx="40" cy="40" r="34" />
          <circle
            className="challenge-progress-fill"
            cx="40"
            cy="40"
            r="34"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - aimView.progress)}
          />
        </svg>
      ) : null}
    </>
  );
}

function ShotLine({ shot }: { shot: ShotView }) {
  return (
    <svg className="challenge-shot-layer" aria-hidden="true">
      <line x1={shot.from.x} y1={shot.from.y} x2={shot.to.x} y2={shot.to.y} />
    </svg>
  );
}

function HitMark({ point }: { point: Point }) {
  return (
    <div className="challenge-hit-mark" style={{ left: point.x, top: point.y }} aria-hidden="true">
      <span />
      <span />
    </div>
  );
}
