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
  availableSpies = [],
  canAddSpy,
  canAddType,
  canRemoveSpy,
  canRemoveType,
  onAdjustSpy,
  onAdjustTroop,
  onAddAll,
  onRemoveAll,
  player,
  selectedSpies = [],
  remaining,
  selectedTroops,
  territoryName,
  players = [],
}: {
  availableSpies?: CapturedSpyToken[];
  canAddSpy?: (spyOwnerId: string) => boolean;
  canAddType: (troopType: TroopType) => boolean;
  canRemoveSpy?: (spyOwnerId: string) => boolean;
  canRemoveType: (troopType: TroopType) => boolean;
  onAdjustSpy?: (spyOwnerId: string, delta: 1 | -1) => void;
  onAdjustTroop: (troopType: TroopType, delta: 1 | -1) => void;
  onAddAll?: () => void;
  onRemoveAll?: () => void;
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
        canUseSpy={canAddSpy}
        canUseType={canAddType}
        counts={remaining}
        delta={1}
        icon={<Plus size={17} />}
        labelNoun="remaining"
        onAdjustAll={onAddAll}
        onAdjustTroop={onAdjustTroop}
        onAdjustSpy={onAdjustSpy}
        player={player}
        players={players}
        spies={availableSpies}
      />
      <div className="allocation-target">
        <strong>{territoryName}</strong>
      </div>
      <TroopActionRow
        actionLabel="Remove"
        canUseSpy={canRemoveSpy}
        canUseType={canRemoveType}
        counts={selectedTroops}
        delta={-1}
        icon={<Minus size={17} />}
        labelNoun="on territory"
        onAdjustAll={onRemoveAll}
        onAdjustSpy={onAdjustSpy}
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
  canUseSpy,
  canUseType,
  counts,
  delta,
  icon,
  labelNoun,
  onAdjustSpy,
  onAdjustAll,
  onAdjustTroop,
  player,
  players = [],
  spies = [],
}: {
  actionLabel: "Add" | "Remove";
  canUseSpy?: (spyOwnerId: string) => boolean;
  canUseType: (troopType: TroopType) => boolean;
  counts: TroopCounts;
  delta: 1 | -1;
  icon: ReactNode;
  labelNoun: string;
  onAdjustSpy?: (spyOwnerId: string, delta: 1 | -1) => void;
  onAdjustAll?: () => void;
  onAdjustTroop: (troopType: TroopType, delta: 1 | -1) => void;
  player: GamePlayer;
  players?: GamePlayer[];
  spies?: CapturedSpyToken[];
}) {
  const troopTypes = visibleTroopTypes(counts);
  const hasVisibleUnits = troopTypes.length > 0 || spies.length > 0;
  const canUseAny = troopTypes.some(canUseType) || spies.some((spy) => canUseSpy?.(spy.ownerPlayerId));

  return (
    <div className="troop-action-row">
      {hasVisibleUnits ? (
        <button className="troop-row-affordance" type="button" onClick={onAdjustAll} disabled={!canUseAny} data-muted={canUseAny ? undefined : "true"} aria-label={`${actionLabel} all`}>
          {icon}
        </button>
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
        {spies.map((spy) => onAdjustSpy ? (
          <button className="troop-icon-button" type="button" key={spy.ownerPlayerId} onClick={() => onAdjustSpy(spy.ownerPlayerId, delta)} disabled={!canUseSpy?.(spy.ownerPlayerId)} aria-label={`${actionLabel} ${spyLabel(players, spy.ownerPlayerId)} spy`}>
            <CapturedSpyIcon players={players} spy={spy} />
          </button>
        ) : (
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

function spyLabel(players: GamePlayer[], spyOwnerId: string) {
  return players.find((player) => player.id === spyOwnerId)?.name ?? "captured";
}

function visibleTroopTypes(counts: TroopCounts) {
  return TROOP_TYPES.filter((troopType) => counts[troopType] > 0);
}
