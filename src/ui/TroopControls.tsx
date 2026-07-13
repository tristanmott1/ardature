import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { TROOP_TYPES } from "../game/gameState";
import type { GamePlayer, TroopCounts, TroopType } from "../game/gameTypes";
import { spyIconSrc, troopName, TroopIconCount, TroopIconImage } from "../game/troopIcons";

export function TroopPlacementRows({
  canAddType,
  canRemoveType,
  onAdjustTroop,
  player,
  remaining,
  selectedTroops,
  territoryName,
}: {
  canAddType: (troopType: TroopType) => boolean;
  canRemoveType: (troopType: TroopType) => boolean;
  onAdjustTroop: (troopType: TroopType, delta: 1 | -1) => void;
  player: GamePlayer;
  remaining: TroopCounts;
  selectedTroops: TroopCounts;
  territoryName: string;
}) {
  const canAddAny = TROOP_TYPES.some(canAddType);
  const canRemoveAny = TROOP_TYPES.some(canRemoveType);

  return (
    <>
      <TroopActionRow
        actionLabel="Add"
        canUseAny={canAddAny}
        canUseType={canAddType}
        counts={remaining}
        delta={1}
        icon={<Plus size={17} />}
        labelNoun="remaining"
        onAdjustTroop={onAdjustTroop}
        player={player}
      />
      <div className="allocation-target">
        <strong>{territoryName}</strong>
      </div>
      <TroopActionRow
        actionLabel="Remove"
        canUseAny={canRemoveAny}
        canUseType={canRemoveType}
        counts={selectedTroops}
        delta={-1}
        icon={<Minus size={17} />}
        labelNoun="on territory"
        onAdjustTroop={onAdjustTroop}
        player={player}
      />
    </>
  );
}

function TroopActionRow({
  actionLabel,
  canUseAny,
  canUseType,
  counts,
  delta,
  icon,
  labelNoun,
  onAdjustTroop,
  player,
}: {
  actionLabel: "Add" | "Remove";
  canUseAny: boolean;
  canUseType: (troopType: TroopType) => boolean;
  counts: TroopCounts;
  delta: 1 | -1;
  icon: ReactNode;
  labelNoun: string;
  onAdjustTroop: (troopType: TroopType, delta: 1 | -1) => void;
  player: GamePlayer;
}) {
  return (
    <div className="troop-action-row">
      <span className="troop-row-spacer" aria-hidden="true" />
      <span className="troop-row-affordance" data-muted={canUseAny ? undefined : "true"} aria-hidden="true">
        {icon}
      </span>
      <div className="troop-action-icons">
        {TROOP_TYPES.map((troopType) => (
          <button className="troop-icon-button" type="button" key={troopType} onClick={() => onAdjustTroop(troopType, delta)} disabled={!canUseType(troopType)} aria-label={`${actionLabel} ${troopType}`}>
            <TroopIconCount
              count={counts[troopType]}
              label={`${troopName(player.color, troopType)} ${labelNoun}: ${counts[troopType]}`}
              player={player}
              troopType={troopType}
            />
          </button>
        ))}
      </div>
      <span className="troop-row-spacer" aria-hidden="true" />
    </div>
  );
}

export function TroopCountRow({ counts, player, troopTypes = TROOP_TYPES, variant = "compact" }: { counts: TroopCounts; player: GamePlayer; troopTypes?: TroopType[]; variant?: "compact" | "large" }) {
  return (
    <div className={`troop-count-row ${variant}`}>
      {troopTypes.map((troopType) => (
        <TroopIconCount count={counts[troopType]} key={troopType} player={player} troopType={troopType} />
      ))}
    </div>
  );
}

export function UnknownTroopCountRow({ player, troopTypes = TROOP_TYPES }: { player: GamePlayer; troopTypes?: TroopType[] }) {
  return (
    <div className="troop-count-row compact">
      {troopTypes.map((troopType) => (
        <TroopIconCount count="?" disabled key={troopType} label={`${troopName(player.color, troopType)}: unknown`} player={player} troopType={troopType} />
      ))}
    </div>
  );
}

export function CapturedSpyRow({ players, spies }: { players: GamePlayer[]; spies: { ownerPlayerId: string }[] }) {
  if (spies.length === 0) {
    return null;
  }

  return (
    <div className="captured-spy-row" aria-label="Captured spies">
      {spies.map((spy) => {
        const owner = players.find((player) => player.id === spy.ownerPlayerId);
        if (!owner) {
          return null;
        }

        return (
          <span className="captured-spy-icon" key={spy.ownerPlayerId} aria-label={`${owner.name}'s captured spy`}>
            <TroopIconImage ownerColor={owner.color} src={spyIconSrc(owner.color, true)} />
          </span>
        );
      })}
    </div>
  );
}
