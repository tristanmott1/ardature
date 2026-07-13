import type { CSSProperties } from "react";
import type { GamePlayer, PlayerColor, TroopType } from "./gameTypes";

export function isLightColor(color: PlayerColor | null) {
  return color === "green" || color === "blue" || color === "yellow";
}

export function troopIconSrc(color: PlayerColor | null, troopType: TroopType) {
  return `./troops/icons/${TROOP_ICON_BY_SIDE[troopSide(color)][troopType]}.png`;
}

export function spyIconSrc(color: PlayerColor | null, captured = false) {
  const name = isLightColor(color) ? "smeagul" : "crow";
  return `./troops/icons/${name}${captured ? "-captured" : ""}.png`;
}

export function troopName(color: PlayerColor | null, troopType: TroopType) {
  return TROOP_NAME_BY_SIDE[troopSide(color)][troopType];
}

export function TroopIconCount({
  className,
  count,
  label,
  player,
  troopType,
}: {
  className?: string;
  count: number | string;
  label?: string;
  player: Pick<GamePlayer, "color">;
  troopType: TroopType;
}) {
  const name = troopName(player.color, troopType);

  return (
    <span className={`troop-icon-count${className ? ` ${className}` : ""}`} aria-label={label ?? `${name}: ${count}`}>
      <TroopIconImage ownerColor={player.color} src={troopIconSrc(player.color, troopType)} />
      <span className="troop-count-bubble">{count}</span>
    </span>
  );
}

export function TroopIconImage({ ownerColor, src }: { ownerColor: PlayerColor | null; src: string }) {
  return (
    <span className="troop-icon-frame" style={{ "--owner-color": colorCss(ownerColor) } as CSSProperties}>
      <img alt="" draggable={false} src={src} />
    </span>
  );
}

function troopSide(color: PlayerColor | null) {
  return isLightColor(color) ? "light" : "dark";
}

function colorCss(color: PlayerColor | null) {
  if (!color) {
    return "#efe9d9";
  }

  return `var(--player-${color})`;
}

const TROOP_ICON_BY_SIDE = {
  light: {
    heavy: "dwarf",
    cavalry: "rohirrim",
    elite: "elf",
    leader: "wizard",
  },
  dark: {
    heavy: "orc",
    cavalry: "warg",
    elite: "uruk-hai",
    leader: "witch-king",
  },
} as const;

const TROOP_NAME_BY_SIDE = {
  light: {
    heavy: "Dwarf",
    cavalry: "Rohirrim",
    elite: "Elf",
    leader: "Wizard",
  },
  dark: {
    heavy: "Orc",
    cavalry: "Warg",
    elite: "Uruk-hai",
    leader: "Witch-king",
  },
} as const;
