import { Check, X } from "lucide-react";
import {
  addTroops,
  canAddTroop,
  remainingReinforcementTroops,
  remainingTroops,
  subtractTroops,
  territoryTroops,
  troopTotal,
} from "../game/gameState";
import type { GamePlayer, GameState, ReinforcementState, TerritoryOwnerMap, TroopCounts, TroopType } from "../game/gameTypes";
import type { CapturedSpyView } from "../game/gameView";
import { spyIconSrc, TroopIconImage } from "../game/troopIcons";
import type { GeneratedTerritoryData } from "../map/mapTypes";
import { territoryForId } from "../map/territoryLookup";
import { PlayerIdentity } from "./PlayerChrome";
import { CapturedSpyRow, TroopCountRow, TroopPlacementRows, UnknownTroopCountRow } from "./TroopControls";

const EMPTY_TROOPS: TroopCounts = {
  cavalry: 0,
  elite: 0,
  heavy: 0,
  leader: 0,
};

type TroopSectionProps =
  | {
      allocation: GameState["allocation"];
      canFinish: boolean;
      mode: "initialAllocation";
      onAdjustTroop: (troopType: TroopType, delta: 1 | -1) => void;
      onFinish: () => void;
      ownership: TerritoryOwnerMap;
      player: GamePlayer;
      selectedTerritoryId: string | null;
    }
  | {
      allocation: GameState["allocation"];
      canFinish: boolean;
      capturedSpies: CapturedSpyView[];
      mode: "reinforcement";
      onAdjustTroop: (troopType: TroopType, delta: 1 | -1) => void;
      onFinish: () => void;
      player: GamePlayer;
      players: GamePlayer[];
      reinforcement: ReinforcementState;
      selectedTerritory: GeneratedTerritoryData | null;
    }
  | {
      canFinish: boolean;
      committedTroops: TroopCounts;
      mode: "attack";
      onAdjustTroop: (troopType: TroopType, delta: 1 | -1) => void;
      onFinish: () => void;
      player: GamePlayer;
      sourceTerritory: GeneratedTerritoryData;
      sourceTroops: TroopCounts;
      targetTerritory: GeneratedTerritoryData;
    }
  | {
      capturedSpies: CapturedSpyView[];
      mode: "info";
      players: GamePlayer[];
      selectedTerritory: GeneratedTerritoryData | null;
      troopBreakdown: TroopCounts | null;
      troopPlayerId?: string | null;
      viewerId: string | null;
    };

export function TroopSection(props: TroopSectionProps) {
  switch (props.mode) {
    case "initialAllocation":
      return <InitialAllocationTroopSection {...props} />;
    case "reinforcement":
      return <ReinforcementTroopSection {...props} />;
    case "attack":
      return <AttackTroopSection {...props} />;
    case "info":
      return <InfoTroopSection {...props} />;
  }
}

function InitialAllocationTroopSection({
  allocation,
  canFinish,
  onAdjustTroop,
  onFinish,
  ownership,
  player,
  selectedTerritoryId,
}: Extract<TroopSectionProps, { mode: "initialAllocation" }>) {
  const playerAllocation = allocation?.playerAllocations[player.id] ?? null;

  return (
    <section className="game-section-panel troop-section troop-section-allocation">
      {playerAllocation?.buildSubmitted && allocation ? (
        <AllocationControls
          allocation={allocation}
          canFinish={canFinish}
          onAdjustTroop={onAdjustTroop}
          onFinish={onFinish}
          ownership={ownership}
          player={player}
          selectedTerritoryId={selectedTerritoryId}
        />
      ) : null}
    </section>
  );
}

export function TurnActionPanel({
  canSpy,
  instruction,
  spyMissing,
  onDismissSpy,
  onAttack,
  onCancelAttack,
  onFortify,
  onReinforce,
  onSpy,
  player,
  stage,
  spyReturnStage,
  attackSetupActive,
}: {
  attackSetupActive: boolean;
  canSpy: boolean;
  instruction: string;
  spyMissing: boolean;
  onAttack: () => void;
  onCancelAttack: () => void;
  onDismissSpy: () => void;
  onFortify: () => void;
  onReinforce: () => void;
  onSpy: () => void;
  player: GamePlayer;
  stage: NonNullable<GameState["turn"]>["stage"];
  spyReturnStage: NonNullable<GameState["turn"]>["spyReturnStage"];
}) {
  const actionStage = stage === "spyTarget"
    ? spyReturnStage ?? "reinforcementReady"
    : stage === "reinforcementBuild" || stage === "reinforcementPlace"
      ? "reinforcementReady"
      : stage;
  const cancelActionActive = attackSetupActive || stage === "spyTarget";
  const cancelAction = attackSetupActive ? onCancelAttack : onSpy;
  const cancelLabel = attackSetupActive ? "Cancel Attack" : "Cancel Spy";

  return (
    <section className="game-section-panel turn-action-panel">
      <p className="turn-action-instruction">{instruction}</p>
      <div className={`turn-action-buttons${cancelActionActive ? " action-cancel-row" : ""}`}>
        {cancelActionActive ? (
          <button className="primary icon-text-button turn-stage-button action-cancel-button" type="button" onClick={cancelAction}>
            <X size={18} />
            {cancelLabel}
          </button>
        ) : (
          <>
            {spyMissing ? (
              <span className="turn-spy-button turn-spy-spacer" aria-hidden="true" />
            ) : (
              <button className="troop-icon-button turn-spy-button" type="button" onClick={onSpy} disabled={!canSpy} aria-label="Spy">
                <TroopIconImage ownerColor={player.color} src={spyIconSrc(player.color)} />
              </button>
            )}
            {stage === "spyIntel" ? (
              <button className="primary icon-text-button turn-stage-button" type="button" onClick={onDismissSpy}>
                <Check size={18} />
                Dismiss
              </button>
            ) : actionStage === "reinforcementReady" ? (
              <button className="primary icon-text-button turn-stage-button" type="button" onClick={onReinforce} disabled={stage === "reinforcementBuild" || stage === "reinforcementPlace"}>
                Reinforcements
              </button>
            ) : (
              <>
                <button className="primary icon-text-button turn-stage-button" type="button" onClick={onAttack}>
                  Attack
                </button>
                <button className="primary icon-text-button turn-stage-button" type="button" onClick={onFortify}>
                  Fortify
                </button>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function ReinforcementTroopSection({
  allocation,
  canFinish,
  capturedSpies,
  onAdjustTroop,
  onFinish,
  player,
  players,
  reinforcement,
  selectedTerritory,
}: Extract<TroopSectionProps, { mode: "reinforcement" }>) {
  const selectedReinforcementTroops = selectedTerritory ? reinforcement.territories[selectedTerritory.id] ?? EMPTY_TROOPS : null;
  const selectedTroops = selectedTerritory
    ? addTroops(territoryTroops(allocation, selectedTerritory.id), selectedReinforcementTroops ?? EMPTY_TROOPS)
    : null;
  const remaining = remainingReinforcementTroops(reinforcement);
  const canAddType = (troopType: TroopType) => selectedTroops !== null && remaining[troopType] > 0;
  const canRemoveType = (troopType: TroopType) => Boolean(selectedReinforcementTroops && selectedReinforcementTroops[troopType] > 0);

  if (!selectedTerritory || !selectedTroops) {
    return null;
  }

  return (
    <section className="game-section-panel troop-section troop-section-allocation troop-section-reinforcement">
      <div className="troop-placement-controls">
        <TroopPlacementRows
          canAddType={canAddType}
          canRemoveType={canRemoveType}
          onAdjustTroop={onAdjustTroop}
          player={player}
          remaining={remaining}
          selectedTroops={selectedTroops}
          territoryName={selectedTerritory.name}
        />
        {selectedTerritory && selectedTroops ? <CapturedSpyRow players={players} spies={capturedSpies} /> : null}
        <button className="primary icon-text-button wide-button" type="button" onClick={onFinish} disabled={!canFinish} aria-label="Finish reinforcements">
          <Check size={20} />
        </button>
      </div>
    </section>
  );
}

function AttackTroopSection({
  canFinish,
  committedTroops,
  onAdjustTroop,
  onFinish,
  player,
  sourceTerritory,
  sourceTroops,
  targetTerritory,
}: Extract<TroopSectionProps, { mode: "attack" }>) {
  const remaining = subtractTroops(sourceTroops, committedTroops);
  const canAddType = (troopType: TroopType) => remaining[troopType] > 0 && troopTotal(remaining) > 1;
  const canRemoveType = (troopType: TroopType) => committedTroops[troopType] > 0;

  return (
    <section className="game-section-panel troop-section troop-section-allocation troop-section-attack">
      <div className="troop-placement-controls">
        <TroopPlacementRows
          canAddType={canAddType}
          canRemoveType={canRemoveType}
          onAdjustTroop={onAdjustTroop}
          player={player}
          remaining={remaining}
          selectedTroops={committedTroops}
          territoryName={`${sourceTerritory.name} to ${targetTerritory.name}`}
        />
        <button className="primary icon-text-button wide-button" type="button" onClick={onFinish} disabled={!canFinish} aria-label="Confirm attack">
          <Check size={20} />
        </button>
      </div>
    </section>
  );
}

export function AllocationWaitingPanel({
  allocation,
  canAdvance,
  onAdvance,
  players,
}: {
  allocation: GameState["allocation"];
  canAdvance: boolean;
  onAdvance: () => void;
  players: GamePlayer[];
}) {
  const readyPlayers = players.filter((player) => allocation?.playerAllocations[player.id]?.ready);
  const waitingPlayers = players.filter((player) => !allocation?.playerAllocations[player.id]?.ready);

  return (
    <section className="game-section-panel allocation-waiting-panel" role="status">
      <div className="waiting-panel">
        <div className="ready-columns">
          <ReadyColumn title="Ready" players={readyPlayers} />
          <ReadyColumn title="Waiting" players={waitingPlayers} />
        </div>
        {canAdvance ? (
          <button className="primary icon-text-button wide-button" type="button" onClick={onAdvance} aria-label="Start game">
            <Check size={20} />
          </button>
        ) : null}
      </div>
    </section>
  );
}

function InfoTroopSection({
  capturedSpies,
  players,
  selectedTerritory,
  troopBreakdown,
  troopPlayerId,
  viewerId,
}: Extract<TroopSectionProps, { mode: "info" }>) {
  const troopPlayer = players.find((player) => player.id === (troopPlayerId ?? viewerId)) ?? players[0] ?? null;

  return (
    <section className="game-section-panel troop-section troop-section-info">
      {selectedTerritory ? <strong className="selected-territory-name">{selectedTerritory.name}</strong> : null}
      {selectedTerritory && troopPlayer ? (
        troopBreakdown
          ? <TroopCountRow counts={troopBreakdown} player={troopPlayer} />
          : <UnknownTroopCountRow player={troopPlayer} />
      ) : null}
      {selectedTerritory && troopBreakdown ? <CapturedSpyRow players={players} spies={capturedSpies} /> : null}
    </section>
  );
}

function AllocationControls({
  allocation,
  canFinish,
  onAdjustTroop,
  onFinish,
  ownership,
  player,
  selectedTerritoryId,
}: {
  allocation: NonNullable<GameState["allocation"]>;
  canFinish: boolean;
  onAdjustTroop: (troopType: TroopType, delta: 1 | -1) => void;
  onFinish: () => void;
  ownership: TerritoryOwnerMap;
  player: GamePlayer;
  selectedTerritoryId: string | null;
}) {
  const selectedTroops = selectedTerritoryId ? territoryTroops(allocation, selectedTerritoryId) : null;
  const remaining = remainingTroops(allocation, player.id);
  const selectedTerritory = territoryForId(selectedTerritoryId);
  const canAddType = (troopType: TroopType) => Boolean(selectedTerritoryId && canAddTroop(allocation, ownership, player.id, selectedTerritoryId, troopType));
  const canRemoveType = (troopType: TroopType) => Boolean(selectedTroops && selectedTroops[troopType] > 0);

  if (!selectedTerritory || !selectedTroops) {
    return null;
  }

  return (
    <div className="troop-placement-controls">
      <TroopPlacementRows
        canAddType={canAddType}
        canRemoveType={canRemoveType}
        onAdjustTroop={onAdjustTroop}
        player={player}
        remaining={remaining}
        selectedTroops={selectedTroops}
        territoryName={selectedTerritory.name}
      />
      <button className="primary icon-text-button wide-button" type="button" onClick={onFinish} disabled={!canFinish} aria-label="Ready">
        <Check size={20} />
      </button>
    </div>
  );
}

function ReadyColumn({ players, title }: { players: GamePlayer[]; title: string }) {
  return (
    <section className="ready-column" aria-label={title}>
      <h2>{title}</h2>
      <div className="ready-player-list">
        {players.map((player) => (
          <article className="ready-player-row" key={player.id}>
            <PlayerIdentity color={player.color} name={player.name} />
          </article>
        ))}
      </div>
    </section>
  );
}
