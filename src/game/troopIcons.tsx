import type { CSSProperties } from "react";
import type { GamePlayer, PlayerColor, TroopType } from "./gameTypes";
import { colorCss, isLightColor } from "./playerColors";

export function troopIconSrc(color: PlayerColor | null, troopType: TroopType) {
  return troopIconAssetUrl(TROOP_ICON_BY_SIDE[troopSide(color)][troopType]);
}

export function spyIconSrc(color: PlayerColor | null, captured = false) {
  const name = isLightColor(color) ? "smeagul" : "crow";
  return troopIconAssetUrl(`${name}${captured ? "-captured" : ""}`);
}

export function ghostSoldierIconSrc() {
  return troopIconAssetUrl("ghost");
}

export function preloadTroopIcons() {
  if (troopIconPreloadStarted || typeof window === "undefined") {
    return;
  }

  troopIconPreloadStarted = true;

  for (const src of troopIconSources()) {
    const image = new Image();

    image.decoding = "async";
    image.src = src;
    preloadedTroopIcons.push(image);

    if (image.decode) {
      image.decode().catch(() => undefined);
    }
  }
}

export function troopIconSources() {
  return TROOP_ICON_NAMES.map(troopIconAssetUrl);
}

export function troopName(color: PlayerColor | null, troopType: TroopType) {
  return TROOP_NAME_BY_SIDE[troopSide(color)][troopType];
}

export function TroopIconCount({
  className,
  count,
  disabled = false,
  label,
  player,
  troopType,
}: {
  className?: string;
  count: number | string;
  disabled?: boolean;
  label?: string;
  player: Pick<GamePlayer, "color">;
  troopType: TroopType;
}) {
  const name = troopName(player.color, troopType);
  const muted = disabled || count === 0 || count === "?";

  return (
    <span className={`troop-icon-count${className ? ` ${className}` : ""}`} data-muted={muted ? "true" : undefined} aria-label={label ?? `${name}: ${count}`}>
      <TroopIconImage ownerColor={player.color} src={troopIconSrc(player.color, troopType)} />
      <span className="troop-count-bubble">{count}</span>
    </span>
  );
}

export function TroopIconImage({ ownerColor, src }: { ownerColor: PlayerColor | null; src: string }) {
  return (
    <span className="troop-icon-frame" style={{ "--owner-color": colorCss(ownerColor) } as CSSProperties}>
      <img alt="" decoding="async" draggable={false} loading="eager" src={src} />
    </span>
  );
}

function troopSide(color: PlayerColor | null) {
  return isLightColor(color) ? "light" : "dark";
}

function troopIconAssetUrl(name: string) {
  const baseUrl = import.meta.env.BASE_URL || "./";
  const path = `${baseUrl}troops/icons/${name}.png`;

  if (typeof window === "undefined") {
    return path;
  }

  return new URL(path, window.location.href).toString();
}

let troopIconPreloadStarted = false;
const preloadedTroopIcons: HTMLImageElement[] = [];

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

const TROOP_ICON_NAMES = [
  "crow",
  "crow-captured",
  "dwarf",
  "elf",
  "ghost",
  "ghost-head",
  "orc",
  "rohirrim",
  "smeagul",
  "smeagul-captured",
  "uruk-hai",
  "warg",
  "witch-king",
  "wizard",
] as const;
