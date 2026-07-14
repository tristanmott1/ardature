import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { TROOP_TYPES } from "../game/gameState";
import type { GamePlayer, TroopCounts, TroopType } from "../game/gameTypes";
import { spyIconSrc, troopName, TroopIconCount, TroopIconImage } from "../game/troopIcons";

export type CapturedSpyToken = {
  captured?: boolean;
  ownerPlayerId: string;
};

export function TroopPlacementRows({
  canAddType,
  canRemoveType,
  onAdjustTroop,
  player,
  selectedSpies = [],
  remaining,
  selectedTroops,
  territoryName,
  players = [],
}: {
  canAddType: (troopType: TroopType) => boolean;
  canRemoveType: (troopType: TroopType) => boolean;
  onAdjustTroop: (troopType: TroopType, delta: 1 | -1) => void;
  player: GamePlayer;
  players?: GamePlayer[];
  remaining: TroopCounts;
  selectedSpies?: CapturedSpyToken[];
  selectedTroops: TroopCounts;
  territoryName: string;
}) {
  return (
    <>
      <TroopActionRow
        actionLabel="Add"
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
        canUseType={canRemoveType}
        counts={selectedTroops}
        delta={-1}
        icon={<Minus size={17} />}
        labelNoun="on territory"
        onAdjustTroop={onAdjustTroop}
        player={player}
        players={players}
        spies={selectedSpies}
      />
    </>
  );
}

function TroopActionRow({
  actionLabel,
  canUseType,
  counts,
  delta,
  icon,
  labelNoun,
  onAdjustTroop,
  player,
  players = [],
  spies = [],
}: {
  actionLabel: "Add" | "Remove";
  canUseType: (troopType: TroopType) => boolean;
  counts: TroopCounts;
  delta: 1 | -1;
  icon: ReactNode;
  labelNoun: string;
  onAdjustTroop: (troopType: TroopType, delta: 1 | -1) => void;
  player: GamePlayer;
  players?: GamePlayer[];
  spies?: CapturedSpyToken[];
}) {
  const troopTypes = visibleTroopTypes(counts);
  const hasVisibleUnits = troopTypes.length > 0 || spies.length > 0;
  const canUseAny = troopTypes.some(canUseType);

  return (
    <div className="troop-action-row">
      {hasVisibleUnits ? (
        <span className="troop-row-affordance" data-muted={canUseAny ? undefined : "true"} aria-hidden="true">
          {icon}
        </span>
      ) : (
        <span className="troop-row-spacer" aria-hidden="true" />
      )}
      <div className="troop-action-icons unit-icon-row">
        {troopTypes.map((troopType) => (
          <button className="troop-icon-button" type="button" key={troopType} onClick={() => onAdjustTroop(troopType, delta)} disabled={!canUseType(troopType)} aria-label={`${actionLabel} ${troopType}`}>
            <TroopIconCount
              count={counts[troopType]}
              label={`${troopName(player.color, troopType)} ${labelNoun}: ${counts[troopType]}`}
              player={player}
              troopType={troopType}
            />
          </button>
        ))}
        {spies.map((spy) => (
          <CapturedSpyIcon key={spy.ownerPlayerId} players={players} spy={spy} />
        ))}
      </div>
      <span className="troop-row-spacer" aria-hidden="true" />
    </div>
  );
}

export function TroopCountRow({
  counts,
  player,
  players = [],
  spies = [],
  troopTypes,
  variant = "compact",
}: {
  counts: TroopCounts;
  player: GamePlayer;
  players?: GamePlayer[];
  spies?: CapturedSpyToken[];
  troopTypes?: TroopType[];
  variant?: "compact" | "large";
}) {
  const shownTroopTypes = troopTypes ?? visibleTroopTypes(counts);

  return (
    <div className={`troop-count-row unit-icon-row ${variant}`}>
      {shownTroopTypes.map((troopType) => (
        <TroopIconCount count={counts[troopType]} key={troopType} player={player} troopType={troopType} />
      ))}
      {spies.map((spy) => (
        <CapturedSpyIcon key={spy.ownerPlayerId} players={players} spy={spy} />
      ))}
    </div>
  );
}

export function UnknownTroopCountRow({ player }: { player: GamePlayer }) {
  return (
    <div className="troop-count-row unit-icon-row compact">
      {TROOP_TYPES.map((troopType) => (
        <TroopIconCount count="?" disabled key={troopType} label={`${troopName(player.color, troopType)}: unknown`} player={player} troopType={troopType} />
      ))}
    </div>
  );
}

function CapturedSpyIcon({ players, spy }: { players: GamePlayer[]; spy: CapturedSpyToken }) {
  const owner = players.find((player) => player.id === spy.ownerPlayerId);
  if (!owner) {
    return null;
  }

  return (
    <span className="captured-spy-icon" aria-label={spy.captured === false ? `${owner.name}'s spy` : `${owner.name}'s captured spy`}>
      <TroopIconImage ownerColor={owner.color} src={spyIconSrc(owner.color, spy.captured ?? true)} />
    </span>
  );
}

function visibleTroopTypes(counts: TroopCounts) {
  return TROOP_TYPES.filter((troopType) => counts[troopType] > 0);
}
