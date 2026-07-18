import { type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const ASSET_ROOT = `${import.meta.env.BASE_URL}challenge/open-pigeon`;

const AIM_SENSITIVITY = 4.9;
const AIM_MAX_SPEED = 1000;
const AIM_ZOOM_FOV = 41.5;
const AIM_PROGRESS_DELAY_MS = 3000;
const AIM_PROGRESS_FILL_MS = 5000;
const ARROW_TRAVEL_MS = 500;
const TARGET_Z = -14.433;
const TARGET_POSITION = new THREE.Vector3(0, 1.362, TARGET_Z);
const TARGET_RADIUS = 0.75;
const TARGET_BASE_RADIUS = 0.0808;
const TARGET_SEGMENTS = 10;
const RING_SPACING = TARGET_RADIUS / TARGET_SEGMENTS;
const ARROW_SPAWN = new THREE.Vector3(0.086, 1.586, 1.373);
const MISS_Z_OFFSET = -10;

const CAMERA_DEFAULT_POS = new THREE.Vector3(0, 1.718, 1.616);
const CAMERA_DEFAULT_FOV = 50;
const CAMERA_FOLLOW_DISTANCE_Z = 3.5;
const CAMERA_FOLLOW_Y_OFFSET = 0.5;
const CAMERA_LOOK_AT_Y_OFFSET = 0.55;
const CAMERA_FOLLOW_FOV = 50;
const CAMERA_FOLLOW_LERP_MS = 700;

type Point = {
  x: number;
  y: number;
};

type Wind = {
  angle: number;
  power: number;
  color: string;
};

type AimView = {
  cursor: Point;
  progress: number;
  progressVisible: boolean;
};

type ChallengeMetrics = {
  attempts: number;
  sigma: string;
  stuckArrows: number;
};

type ChallengeCallbacks = {
  onAim: (aim: AimView | null) => void;
  onMetrics: (metrics: ChallengeMetrics) => void;
  onWind: (wind: Wind) => void;
};

type CameraTween = {
  startedAt: number;
  durationMs: number;
  fromFov: number;
  fromPosition: THREE.Vector3;
  toFov: number;
  toPosition: THREE.Vector3;
  onComplete?: () => void;
};

type ArrowFlight = {
  arrow: THREE.Object3D;
  from: THREE.Vector3;
  missedTarget: boolean;
  startedAt: number;
  to: THREE.Vector3;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function easeOutSine(value: number) {
  return Math.sin((value * Math.PI) / 2);
}

function colorForWind(power: number) {
  const t = clamp(power / 5, 0, 1);
  const green = new THREE.Color(0.792, 0.792, 0.792);
  const yellow = new THREE.Color(1, 0.9, 0.1);
  const red = new THREE.Color(0.95, 0.1, 0.1);

  if (t < 0.5) {
    return green.lerp(yellow, t * 2).getStyle();
  }

  return yellow.lerp(red, (t - 0.5) * 2).getStyle();
}

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

function orientArrow(arrow: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  const direction = to.clone().sub(from).normalize();
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
}

function cloneObject(source: THREE.Object3D) {
  const clone = source.clone(true);

  clone.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return clone;
}

class ChallengeArcheryScene {
  private aimCursor: Point = { x: 0, y: 0 };
  private aimProgressStartedAt: number | null = null;
  private arrowFlight: ArrowFlight | null = null;
  private arrowTemplate: THREE.Object3D | null = null;
  private bowFullyDrawn = false;
  private camera: THREE.PerspectiveCamera;
  private cameraTween: CameraTween | null = null;
  private currentArrow: THREE.Object3D | null = null;
  private currentWind: Wind;
  private disposed = false;
  private frameId: number | null = null;
  private highlightRing: THREE.Mesh | null = null;
  private initialPointer: Point = { x: 0, y: 0 };
  private isAiming = false;
  private lastFrameAt = performance.now();
  private metrics: ChallengeMetrics = { attempts: 0, sigma: "0", stuckArrows: 0 };
  private raycaster = new THREE.Raycaster();
  private renderer: THREE.WebGLRenderer;
  private resizeObserver: ResizeObserver;
  private scene = new THREE.Scene();
  private squaredDistanceSum = 0;
  private stuckArrows: THREE.Object3D[] = [];
  private velocity: Point = { x: 0, y: 0 };

  constructor(private container: HTMLDivElement, private callbacks: ChallengeCallbacks) {
    this.camera = new THREE.PerspectiveCamera(CAMERA_DEFAULT_FOV, 1, 0.01, 200);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.domElement.className = "challenge-scene-canvas";
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.resetCameraImmediately();
    this.currentWind = this.sampleWind();
    this.callbacks.onWind(this.currentWind);
    this.callbacks.onMetrics(this.metrics);
    void this.load();
    this.start();
  }

  dispose() {
    this.disposed = true;
    this.resizeObserver.disconnect();

    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
    }

    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  pointerDown(point: Point) {
    if (!this.currentArrow || this.arrowFlight || this.isAiming) {
      return;
    }

    this.isAiming = true;
    this.bowFullyDrawn = false;
    this.aimCursor = this.stageCenter();
    this.initialPointer = point;
    this.velocity = { x: 0, y: 0 };
    this.aimProgressStartedAt = performance.now() + AIM_PROGRESS_DELAY_MS;
    this.callbacks.onAim({ cursor: this.aimCursor, progress: 0, progressVisible: false });
    this.tweenCamera(this.camera.position, AIM_ZOOM_FOV, 500, () => {
      if (this.isAiming) {
        this.bowFullyDrawn = true;
      }
    });
  }

  pointerMove(point: Point) {
    if (!this.isAiming) {
      return;
    }

    this.velocity = capVector(
      {
        x: (point.x - this.initialPointer.x) * AIM_SENSITIVITY,
        y: (point.y - this.initialPointer.y) * AIM_SENSITIVITY,
      },
      AIM_MAX_SPEED,
    );
  }

  pointerUp() {
    if (!this.isAiming) {
      return;
    }

    if (!this.bowFullyDrawn) {
      this.cancelAim();
      return;
    }

    this.shoot();
  }

  restart() {
    this.isAiming = false;
    this.bowFullyDrawn = false;
    this.velocity = { x: 0, y: 0 };
    this.arrowFlight = null;
    this.cameraTween = null;
    this.aimProgressStartedAt = null;
    this.callbacks.onAim(null);

    if (this.currentArrow) {
      this.scene.remove(this.currentArrow);
      this.currentArrow = null;
    }

    this.stuckArrows.forEach((arrow) => this.scene.remove(arrow));
    this.stuckArrows = [];
    this.squaredDistanceSum = 0;
    this.metrics = { attempts: 0, sigma: "0", stuckArrows: 0 };
    this.callbacks.onMetrics(this.metrics);
    this.currentWind = this.sampleWind();
    this.callbacks.onWind(this.currentWind);
    this.hideHighlight();
    this.resetCameraImmediately();
    this.spawnReadyArrow();
  }

  private async load() {
    const textureLoader = new THREE.TextureLoader();
    const gltfLoader = new GLTFLoader();
    const [targetTexture, grass12, grass14, sky, woodTexture, arrowGltf] = await Promise.all([
      textureLoader.loadAsync(`${ASSET_ROOT}/target_board_final.jpg`),
      textureLoader.loadAsync(`${ASSET_ROOT}/grass12.png`),
      textureLoader.loadAsync(`${ASSET_ROOT}/grass14.png`),
      textureLoader.loadAsync(`${ASSET_ROOT}/sky1.png`),
      textureLoader.loadAsync(`${ASSET_ROOT}/background2.jpeg`),
      gltfLoader.loadAsync(`${ASSET_ROOT}/arrow/scene.gltf`),
    ]);

    if (this.disposed) {
      return;
    }

    [targetTexture, grass12, grass14, sky, woodTexture].forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
    });
    grass12.wrapS = THREE.RepeatWrapping;
    grass12.wrapT = THREE.RepeatWrapping;
    grass12.repeat.set(100, 100);
    grass14.wrapS = THREE.RepeatWrapping;
    grass14.wrapT = THREE.RepeatWrapping;
    grass14.repeat.set(66.66, 0.667);

    this.buildEnvironment(grass12, grass14, sky);
    this.buildTarget(targetTexture, woodTexture);
    this.arrowTemplate = arrowGltf.scene;
    this.prepareArrowTemplate();
    this.spawnReadyArrow();
  }

  private buildEnvironment(grass12: THREE.Texture, grass14: THREE.Texture, sky: THREE.Texture) {
    this.scene.background = new THREE.Color("#9fc8f2");

    const light = new THREE.DirectionalLight(0xffffff, 2.6);
    light.position.set(0, 4.55696, -7.42851);
    light.castShadow = true;
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));

    const floorMaterial = new THREE.MeshStandardMaterial({ map: grass12, roughness: 0.9 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.02, -48.3);
    floor.receiveShadow = true;
    this.scene.add(floor);

    const stripMaterial = new THREE.MeshStandardMaterial({ map: grass14, roughness: 0.9 });
    for (let z = 0; z >= -37.5; z -= 3) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(100, 1.5), stripMaterial);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, -0.01, z);
      strip.receiveShadow = true;
      this.scene.add(strip);
    }

    const skyMaterial = new THREE.MeshBasicMaterial({ map: sky });
    const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(100, 63.605), skyMaterial);
    skyPlane.position.set(0.387032, 34.176815, -128.65393);
    this.scene.add(skyPlane);

    const hedge = new THREE.Mesh(new THREE.PlaneGeometry(100, 2), stripMaterial);
    hedge.position.set(0, 1.0026485, -73.4091);
    this.scene.add(hedge);
  }

  private buildTarget(targetTexture: THREE.Texture, woodTexture: THREE.Texture) {
    const targetMaterial = new THREE.MeshStandardMaterial({ map: targetTexture, roughness: 0.75, side: THREE.DoubleSide });
    const target = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), targetMaterial);
    target.name = "OpenPigeon target";
    target.position.copy(TARGET_POSITION);
    target.receiveShadow = true;
    this.scene.add(target);

    const legMaterial = new THREE.MeshStandardMaterial({ map: woodTexture, roughness: 0.75 });
    const legGeometry = new THREE.BoxGeometry(0.109375, 1, 0.0849609);
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.824727, TARGET_POSITION.y - 1.11989, TARGET_POSITION.z - 0.0496893);
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.811327, TARGET_POSITION.y - 1.11989, TARGET_POSITION.z - 0.0496893);
    this.scene.add(leftLeg, rightLeg);

    const ringGeometry = new THREE.RingGeometry(0.001, TARGET_BASE_RADIUS, 72);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      opacity: 0.62,
      side: THREE.DoubleSide,
      transparent: true,
    });
    this.highlightRing = new THREE.Mesh(ringGeometry, ringMaterial);
    this.highlightRing.position.set(TARGET_POSITION.x, TARGET_POSITION.y, TARGET_POSITION.z + 0.006);
    this.highlightRing.visible = false;
    this.scene.add(this.highlightRing);
  }

  private prepareArrowTemplate() {
    if (!this.arrowTemplate) {
      return;
    }

    this.arrowTemplate.scale.setScalar(0.01);
    this.arrowTemplate.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  private spawnReadyArrow() {
    if (!this.arrowTemplate || this.currentArrow || this.disposed) {
      return;
    }

    const arrow = cloneObject(this.arrowTemplate);
    arrow.position.copy(ARROW_SPAWN);
    orientArrow(arrow, ARROW_SPAWN, TARGET_POSITION);
    arrow.visible = false;
    this.currentArrow = arrow;
    this.scene.add(arrow);
  }

  private sampleWind(): Wind {
    const shotIndex = this.metrics.attempts;
    const angle = Math.random() * Math.PI * 2;
    let power = 0.5 + Math.random() * 0.3;

    if (shotIndex === 1) {
      power = 1 + Math.random() * 0.5;
    } else if (shotIndex >= 2) {
      power = 1.5 + Math.random() * 1.5;
    }

    return {
      angle,
      power,
      color: colorForWind(power),
    };
  }

  private cancelAim() {
    this.isAiming = false;
    this.bowFullyDrawn = false;
    this.velocity = { x: 0, y: 0 };
    this.aimProgressStartedAt = null;
    this.callbacks.onAim(null);
    this.tweenCamera(CAMERA_DEFAULT_POS, CAMERA_DEFAULT_FOV, 500);
  }

  private shoot() {
    if (!this.currentArrow) {
      return;
    }

    const baseShot = this.projectCursorToTarget();
    const windVector = this.windVector();
    const shotPosition = baseShot.clone().add(new THREE.Vector3(windVector.x, windVector.y, 0));
    const missedTarget = shotPosition.x < -0.9 || shotPosition.x > 0.9 || shotPosition.y < 0.45 || shotPosition.y > 2.26;

    if (missedTarget) {
      shotPosition.z = TARGET_Z + MISS_Z_OFFSET;
    }

    const arrow = this.currentArrow;
    arrow.visible = true;
    this.currentArrow = null;
    this.isAiming = false;
    this.bowFullyDrawn = false;
    this.velocity = { x: 0, y: 0 };
    this.callbacks.onAim(null);
    this.arrowFlight = {
      arrow,
      from: arrow.position.clone(),
      missedTarget,
      startedAt: performance.now(),
      to: shotPosition,
    };
    orientArrow(arrow, this.arrowFlight.from, shotPosition);
    this.followArrow();
  }

  private projectCursorToTarget() {
    const rect = this.container.getBoundingClientRect();
    const pointer = new THREE.Vector2((this.aimCursor.x / rect.width) * 2 - 1, -(this.aimCursor.y / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(pointer, this.camera);
    const origin = this.raycaster.ray.origin;
    const direction = this.raycaster.ray.direction;
    const distance = (TARGET_Z - origin.z) / direction.z;

    return origin.clone().add(direction.clone().multiplyScalar(distance));
  }

  private windVector() {
    return {
      x: Math.sin(this.currentWind.angle) * this.currentWind.power * RING_SPACING,
      y: -Math.cos(this.currentWind.angle) * this.currentWind.power * RING_SPACING,
    };
  }

  private completeShot(flight: ArrowFlight) {
    const distance = Math.hypot(flight.to.x - TARGET_POSITION.x, flight.to.y - TARGET_POSITION.y);
    const distanceRings = distance / RING_SPACING;
    this.metrics.attempts += 1;
    this.squaredDistanceSum += distanceRings * distanceRings;
    this.metrics.sigma = Math.sqrt(this.squaredDistanceSum / this.metrics.attempts).toFixed(1);

    if (flight.missedTarget) {
      this.scene.remove(flight.arrow);
      this.hideHighlight();
    } else {
      this.stuckArrows.push(flight.arrow);
      this.metrics.stuckArrows = this.stuckArrows.length;
      this.showHighlight(distance);
    }

    this.callbacks.onMetrics({ ...this.metrics });
    this.currentWind = this.sampleWind();
    this.callbacks.onWind(this.currentWind);
    window.setTimeout(() => {
      if (this.disposed) {
        return;
      }

      this.resetCamera(() => this.spawnReadyArrow());
    }, 1000);
  }

  private showHighlight(distance: number) {
    if (!this.highlightRing) {
      return;
    }

    const segment = distance === 0 ? 1 : Math.ceil(distance / TARGET_BASE_RADIUS);

    if (segment < 1 || segment > TARGET_SEGMENTS) {
      this.hideHighlight();
      return;
    }

    this.scene.remove(this.highlightRing);
    const innerRadius = Math.max((segment - 1) * 0.079, 0.001);
    const outerRadius = segment * 0.079;
    this.highlightRing.geometry.dispose();
    this.highlightRing.geometry = new THREE.RingGeometry(innerRadius, outerRadius, 72);
    this.highlightRing.position.set(TARGET_POSITION.x, TARGET_POSITION.y, TARGET_POSITION.z + 0.006);
    this.highlightRing.visible = true;
    this.scene.add(this.highlightRing);
  }

  private hideHighlight() {
    if (this.highlightRing) {
      this.highlightRing.visible = false;
    }
  }

  private followArrow() {
    const center = TARGET_POSITION;
    const cameraPosition = new THREE.Vector3(center.x, center.y + CAMERA_FOLLOW_Y_OFFSET, TARGET_Z + CAMERA_FOLLOW_DISTANCE_Z);
    this.tweenCamera(cameraPosition, CAMERA_FOLLOW_FOV, CAMERA_FOLLOW_LERP_MS);
  }

  private resetCamera(onComplete?: () => void) {
    this.tweenCamera(CAMERA_DEFAULT_POS, CAMERA_DEFAULT_FOV, 500, onComplete);
  }

  private resetCameraImmediately() {
    this.camera.position.copy(CAMERA_DEFAULT_POS);
    this.camera.fov = CAMERA_DEFAULT_FOV;
    this.camera.updateProjectionMatrix();
    this.lookAtTarget();
  }

  private tweenCamera(toPosition: THREE.Vector3, toFov: number, durationMs: number, onComplete?: () => void) {
    this.cameraTween = {
      durationMs,
      fromFov: this.camera.fov,
      fromPosition: this.camera.position.clone(),
      onComplete,
      startedAt: performance.now(),
      toFov,
      toPosition: toPosition.clone(),
    };
  }

  private updateCameraTween(now: number) {
    if (!this.cameraTween) {
      return;
    }

    const tween = this.cameraTween;
    const t = clamp((now - tween.startedAt) / tween.durationMs, 0, 1);
    const eased = easeOutSine(t);
    this.camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
    this.camera.fov = THREE.MathUtils.lerp(tween.fromFov, tween.toFov, eased);
    this.camera.updateProjectionMatrix();
    this.lookAtTarget();

    if (t >= 1) {
      this.cameraTween = null;
      tween.onComplete?.();
    }
  }

  private lookAtTarget() {
    this.camera.lookAt(TARGET_POSITION.clone().sub(new THREE.Vector3(0, CAMERA_LOOK_AT_Y_OFFSET, 0)));
  }

  private start() {
    const step = (now: number) => {
      if (this.disposed) {
        return;
      }

      const dtSeconds = (now - this.lastFrameAt) / 1000;
      this.lastFrameAt = now;
      this.updateCameraTween(now);
      this.updateAim(now, dtSeconds);
      this.updateArrowFlight(now);
      this.renderer.render(this.scene, this.camera);
      this.frameId = requestAnimationFrame(step);
    };

    this.frameId = requestAnimationFrame(step);
  }

  private updateAim(now: number, dtSeconds: number) {
    if (!this.isAiming) {
      return;
    }

    const rect = this.container.getBoundingClientRect();
    this.aimCursor = {
      x: clamp(this.aimCursor.x + this.velocity.x * dtSeconds, 0, rect.width),
      y: clamp(this.aimCursor.y + this.velocity.y * dtSeconds, 0, rect.height),
    };

    const progressElapsed = this.aimProgressStartedAt === null ? -1 : now - this.aimProgressStartedAt;
    const progress = clamp(progressElapsed / AIM_PROGRESS_FILL_MS, 0, 1);
    this.callbacks.onAim({
      cursor: this.aimCursor,
      progress,
      progressVisible: progressElapsed >= 0,
    });

    if (progress >= 1) {
      this.shoot();
    }
  }

  private updateArrowFlight(now: number) {
    if (!this.arrowFlight) {
      return;
    }

    const flight = this.arrowFlight;
    const t = clamp((now - flight.startedAt) / ARROW_TRAVEL_MS, 0, 1);
    flight.arrow.position.lerpVectors(flight.from, flight.to, t);

    if (t >= 1) {
      this.arrowFlight = null;
      this.completeShot(flight);
    }
  }

  private resize() {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private stageCenter() {
    const rect = this.container.getBoundingClientRect();

    return {
      x: rect.width / 2,
      y: rect.height / 2,
    };
  }
}

export function ChallengeTestPage({ onExit }: { onExit: () => void }) {
  const sceneControllerRef = useRef<ChallengeArcheryScene | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [aimView, setAimView] = useState<AimView | null>(null);
  const [metrics, setMetrics] = useState<ChallengeMetrics>({ attempts: 0, sigma: "0", stuckArrows: 0 });
  const [wind, setWind] = useState<Wind>({ angle: 0, color: colorForWind(0), power: 0 });

  useEffect(() => {
    if (!stageRef.current) {
      return;
    }

    const controller = new ChallengeArcheryScene(stageRef.current, {
      onAim: setAimView,
      onMetrics: setMetrics,
      onWind: setWind,
    });
    sceneControllerRef.current = controller;

    return () => {
      controller.dispose();
      sceneControllerRef.current = null;
    };
  }, []);

  function pointForEvent(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    sceneControllerRef.current?.pointerDown(pointForEvent(event));
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    sceneControllerRef.current?.pointerMove(pointForEvent(event));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    sceneControllerRef.current?.pointerUp();
  }

  function restartChallenge() {
    sceneControllerRef.current?.restart();
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
        data-stuck-arrows={metrics.stuckArrows}
        ref={stageRef}
        aria-label="Challenge test area"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <WindIndicator wind={wind} />
        {aimView ? <AimCursor aimView={aimView} /> : null}
      </div>
      <footer className="challenge-test-scorebar">
        <div className="challenge-score-item">
          <span>Attempts</span>
          <strong>{metrics.attempts}</strong>
        </div>
        <div className="challenge-score-item">
          <span>Sigma</span>
          <strong>{metrics.sigma}</strong>
        </div>
      </footer>
    </section>
  );
}

function WindIndicator({ wind }: { wind: Wind }) {
  return (
    <div className="challenge-wind" style={{ color: wind.color }} aria-label={`Wind power ${wind.power.toFixed(1)}`}>
      <img className="challenge-wind-circle" src={`${ASSET_ROOT}/wind_arrow_circle.png`} alt="" aria-hidden="true" />
      <img className="challenge-wind-arrow" src={`${ASSET_ROOT}/wind_arrow.png`} style={{ transform: `rotate(${wind.angle}rad)` }} alt="" aria-hidden="true" />
      <span className="challenge-wind-label">Wind {wind.power.toFixed(1)}</span>
    </div>
  );
}

function AimCursor({ aimView }: { aimView: AimView }) {
  return (
    <div className="challenge-aim-cursor" style={{ left: aimView.cursor.x, top: aimView.cursor.y }} aria-hidden="true">
      <img className="challenge-aim-cursor-image" src={`${ASSET_ROOT}/cursor.png`} alt="" />
      {aimView.progressVisible ? (
        <span className="challenge-progress-textures" style={{ "--challenge-progress": `${aimView.progress * 100}%` } as CSSProperties}>
          <img className="challenge-progress-under" src={`${ASSET_ROOT}/progress_under.png`} alt="" />
          <span className="challenge-progress-over" style={{ backgroundImage: `url(${ASSET_ROOT}/progress_over.png)` }} />
        </span>
      ) : null}
    </div>
  );
}
