import { useRef } from "react";
import { Check } from "lucide-react";
import { armyCountsForMarker } from "../game/armyBuild";
import type { ArmyMarker, GamePlayer, GameState, TroopCounts } from "../game/gameTypes";
import { colorCss } from "../game/playerColors";
import { troopIconSrc } from "../game/troopIcons";
import { TroopCountRow } from "./TroopControls";

export function ArmyBuildModal({
  allocation,
  marker,
  onArmyMarkerChange,
  onSubmitBuild,
  player,
  projectedTroops,
}: {
  allocation?: GameState["allocation"];
  marker?: ArmyMarker;
  onArmyMarkerChange: (marker: ArmyMarker) => void;
  onSubmitBuild: () => void;
  player: GamePlayer;
  projectedTroops?: TroopCounts | null;
}) {
  const playerAllocation = allocation?.playerAllocations[player.id] ?? null;
  const modalMarker = marker ?? playerAllocation?.marker ?? null;
  const modalTroops = projectedTroops ?? (playerAllocation ? armyCountsForMarker(playerAllocation.marker, player.color, allocation?.originalPlayerCount ?? 2) : null);

  return (
    <div className="modal-scrim army-build-scrim">
      <section className="modal-panel army-build-modal" role="dialog" aria-label="Build army">
        {modalTroops ? <TroopCountRow counts={modalTroops} player={player} variant="large" /> : null}
        {modalMarker ? <ArmyTriangle marker={modalMarker} onChange={onArmyMarkerChange} player={player} /> : null}
        <button className="primary icon-text-button wide-button" type="button" onClick={onSubmitBuild} aria-label="Confirm army">
          <Check size={20} />
        </button>
      </section>
    </div>
  );
}

function ArmyTriangle({ marker, onChange, player }: { marker: ArmyMarker; onChange: (marker: ArmyMarker) => void; player: GamePlayer }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const corners = {
    heavy: { x: 100, y: 24 },
    cavalry: { x: 24, y: 158 },
    elite: { x: 176, y: 158 },
  };
  const iconSize = 42;
  const iconRingWidth = 4;
  const iconOuterSize = iconSize + iconRingWidth * 2;
  const markerPoint = markerToTrianglePoint(marker);

  function updateFromPointer(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    const bounds = svg.getBoundingClientRect();
    const point = {
      x: ((clientX - bounds.left) / bounds.width) * 200,
      y: ((clientY - bounds.top) / bounds.height) * 184,
    };
    onChange(pointToMarker(point));
  }

  return (
    <svg
      className="army-triangle"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPointer(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          updateFromPointer(event.clientX, event.clientY);
        }
      }}
      ref={svgRef}
      viewBox="0 0 200 184"
    >
      <path d={`M ${corners.heavy.x} ${corners.heavy.y} L ${corners.elite.x} ${corners.elite.y} L ${corners.cavalry.x} ${corners.cavalry.y} Z`} />
      {(["heavy", "cavalry", "elite"] as const).map((troopType) => (
        <g className="army-triangle-icon" key={troopType}>
          <circle cx={corners[troopType].x} cy={corners[troopType].y} r={iconOuterSize / 2 - iconRingWidth / 2} style={{ fill: "#ffffff", stroke: colorCss(player.color), strokeWidth: iconRingWidth }} />
          <image
            height={iconSize}
            href={troopIconSrc(player.color, troopType)}
            width={iconSize}
            x={corners[troopType].x - iconSize / 2}
            y={corners[troopType].y - iconSize / 2}
          />
        </g>
      ))}
      <g className="army-triangle-marker">
        <circle className="army-triangle-marker-halo" cx={markerPoint.x} cy={markerPoint.y} r="16" />
        <circle className="army-triangle-marker-handle" cx={markerPoint.x} cy={markerPoint.y} r="10" />
        <circle className="army-triangle-marker-dot" cx={markerPoint.x} cy={markerPoint.y} r="3" />
      </g>
    </svg>
  );
}

function markerToTrianglePoint(marker: ArmyMarker) {
  const corners = {
    heavy: { x: 100, y: 24 },
    cavalry: { x: 24, y: 158 },
    elite: { x: 176, y: 158 },
  };

  return {
    x: marker.heavy * corners.heavy.x + marker.cavalry * corners.cavalry.x + marker.elite * corners.elite.x,
    y: marker.heavy * corners.heavy.y + marker.cavalry * corners.cavalry.y + marker.elite * corners.elite.y,
  };
}

function pointToMarker(point: { x: number; y: number }): ArmyMarker {
  const a = { x: 100, y: 24 };
  const b = { x: 24, y: 158 };
  const c = { x: 176, y: 158 };
  const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  const heavy = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / denominator;
  const cavalry = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / denominator;
  const elite = 1 - heavy - cavalry;
  const clamped = {
    heavy: Math.max(0, heavy),
    cavalry: Math.max(0, cavalry),
    elite: Math.max(0, elite),
  };
  const total = clamped.heavy + clamped.cavalry + clamped.elite;

  return {
    heavy: clamped.heavy / total,
    cavalry: clamped.cavalry / total,
    elite: clamped.elite / total,
  };
}
