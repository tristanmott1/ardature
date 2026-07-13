import { generatedMapConnections } from "../map/generated/mapConnections";
import { generatedMapData } from "../map/generated/mapData";
import type { GeneratedTerritoryData } from "../map/mapTypes";
import {
  activePlayer,
  capturedSpiesOnTerritory,
  draftProgressForPlayer,
  ownedTerritoryIds,
  territoryTroopTotal,
  territoryTroops,
  troopTotal,
} from "./gameState";
import type { AppPhase, GamePlayer, GameState, TerritoryOwnerMap } from "./gameTypes";

export type SyncRole = "host" | "joiner" | null;

export type ActiveOverlay =
  | { type: "syncBlocked" }
  | { type: "scanner" }
  | { type: "decision"; decision: "exit" | "restart" }
  | { type: "pause" }
  | { type: "handoff"; handoff: "allocation" | "turn" }
  | { type: "armyBuild"; build: "allocation" | "reinforcement" }
  | { type: "notification" }
  | { type: "confirm"; confirm: "draft" | "spy" };

export type CapturedSpyView = ReturnType<typeof capturedSpiesOnTerritory>[number];

export type TerritoryInspection = {
  capturedSpies: CapturedSpyView[];
  selectedTerritory: GeneratedTerritoryData | null;
  troopBreakdown: ReturnType<typeof territoryTroops> | null;
  troopPlayerId: string | null;
};

export type MapPressMode = "draft" | "allocation" | "reinforcement" | "spy" | "inspect";

export type TroopSectionMode =
  | { type: "allocation"; source: "initial" | "reinforcement" }
  | { type: "info"; source: "gameMap" | "turn" }
  | null;

export type ActionSectionMode = "none" | "turn";
export type StatusSectionMode = "none" | "allocationWaiting";

export type GameStageLayout = {
  actionSection: ActionSectionMode;
  canUseMapCameraControls: boolean;
  freezeMapGestures: boolean;
  showGameStageLayout: boolean;
  showPlayerBar: boolean;
  statusSection: StatusSectionMode;
  troopSection: TroopSectionMode;
};

type PlayerBarContext = {
  activeDraftPlayer: GamePlayer | null;
  allocationPlayer: GamePlayer | null;
  currentTurnPlayer: GamePlayer | null;
  game: GameState;
  gameMapViewer: GamePlayer | null;
  pausedReturnPhase: AppPhase | null;
};

type MapSelectionContext = {
  allocationPlayerId: string | null;
  allocationSelectedTerritoryId: string | null;
  canControlActivePlayer: boolean;
  canControlTurnPlayer: boolean;
  game: GameState;
  gameMapSelectedTerritoryId: string | null;
  pendingDraftTerritoryId: string | null;
  pendingSpyTerritoryId: string | null;
  turnSelectedTerritoryId: string | null;
};

type TerritoryInspectionContext = {
  game: GameState;
  ownership: TerritoryOwnerMap;
  revealedTerritory?: GeneratedTerritoryData | null;
  selectedTerritory: GeneratedTerritoryData | null;
  selectedTerritoryId: string | null;
  viewerId: string | null;
};

type MapPressModeContext = {
  activeDraftPlayer: GamePlayer | null;
  allocationBuildSubmitted: boolean;
  allocationPlayerId: string | null;
  canControlActivePlayer: boolean;
  canControlTurnPlayer: boolean;
  game: GameState;
  localAllocationReady: boolean;
  syncJoinerBlocked: boolean;
};

type GameStageLayoutContext = {
  activeOverlay: ActiveOverlay | null;
  canControlTurnPlayer: boolean;
  canShowAllocationSection: boolean;
  canShowReinforcementSection: boolean;
  game: GameState;
  gameMapInspection: TerritoryInspection;
  localAllocationReady: boolean;
  playerBarPlayer: GamePlayer | null;
  turnActionPlayer: GamePlayer | null;
  turnMapInspection: TerritoryInspection;
};

export function firstActiveOverlay(...overlays: Array<ActiveOverlay | null>): ActiveOverlay | null {
  for (const overlay of overlays) {
    if (overlay) {
      return overlay;
    }
  }

  return null;
}

export function createTroopMarkers(game: GameState, allocationPlayerId: string | null, gameMapViewerId: string | null, turnViewerId: string | null) {
  if (!game.allocation || !game.draft) {
    return [];
  }

  const viewerId = game.phase === "turn" || game.phase === "turnHandoff" || (game.phase === "paused" && game.turn)
    ? turnViewerId
    : game.phase === "gameMap"
      ? gameMapViewerId
      : allocationPlayerId;
  if (!viewerId) {
    return [];
  }

  const territoryById = new Map<string, GeneratedTerritoryData>(generatedMapData.territories.map((territory) => [territory.id, territory]));
  const visibleIds: Set<string> = game.phase === "gameMap" || game.phase === "turn" || game.phase === "turnHandoff" || (game.phase === "paused" && game.turn)
    ? visibleTroopTotalTerritoryIds(game.draft.ownership, viewerId)
    : new Set(ownedTerritoryIds(game.draft.ownership, viewerId));

  if (game.turn?.stage === "spyIntel" && game.turn.currentPlayerId === viewerId && game.turn.spyIntel) {
    visibleIds.add(game.turn.spyIntel.targetTerritoryId);
    for (const territoryId of game.turn.spyIntel.totalTerritoryIds) {
      visibleIds.add(territoryId);
    }
  }

  return [...visibleIds]
    .map((territoryId) => {
      const territory = territoryById.get(territoryId);
      const count = territoryTroopTotalWithTurnPreview(game, territoryId);

      return territory && count > 0
        ? { territoryId, center: territory.center, count }
        : null;
    })
    .filter((marker): marker is NonNullable<typeof marker> => Boolean(marker));
}

export function selectedTerritoryForMap({
  allocationPlayerId,
  allocationSelectedTerritoryId,
  canControlActivePlayer,
  canControlTurnPlayer,
  game,
  gameMapSelectedTerritoryId,
  pendingDraftTerritoryId,
  pendingSpyTerritoryId,
  turnSelectedTerritoryId,
}: MapSelectionContext) {
  if (game.phase === "draft") {
    return canControlActivePlayer ? pendingDraftTerritoryId : null;
  }

  if (game.phase === "allocation") {
    return allocationPlayerId ? allocationSelectedTerritoryId : null;
  }

  if (game.phase !== "turn") {
    return game.phase === "gameMap" ? gameMapSelectedTerritoryId : null;
  }

  if (!canControlTurnPlayer) {
    return gameMapSelectedTerritoryId;
  }

  if (game.turn?.stage === "spyIntel") {
    return game.turn.spyIntel?.targetTerritoryId ?? null;
  }

  if (game.turn?.stage === "reinforcementPlace" || game.turn?.stage === "spyTarget") {
    return pendingSpyTerritoryId ?? turnSelectedTerritoryId;
  }

  return gameMapSelectedTerritoryId;
}

export function mapPressModeForGame({
  activeDraftPlayer,
  allocationBuildSubmitted,
  allocationPlayerId,
  canControlActivePlayer,
  canControlTurnPlayer,
  game,
  localAllocationReady,
  syncJoinerBlocked,
}: MapPressModeContext): MapPressMode | null {
  if (syncJoinerBlocked) {
    return null;
  }

  if (game.phase === "draft") {
    return canControlActivePlayer && activeDraftPlayer ? "draft" : null;
  }

  if (game.phase === "allocation") {
    return allocationPlayerId && allocationBuildSubmitted && !localAllocationReady ? "allocation" : null;
  }

  if (game.phase === "gameMap") {
    return "inspect";
  }

  if (game.phase !== "turn") {
    return null;
  }

  if (!canControlTurnPlayer) {
    return "inspect";
  }

  if (game.turn?.stage === "reinforcementPlace") {
    return "reinforcement";
  }

  if (game.turn?.stage === "spyTarget") {
    return "spy";
  }

  return "inspect";
}

export function gameStageLayoutForState({
  activeOverlay,
  canControlTurnPlayer,
  canShowAllocationSection,
  canShowReinforcementSection,
  game,
  gameMapInspection,
  localAllocationReady,
  playerBarPlayer,
  turnActionPlayer,
  turnMapInspection,
}: GameStageLayoutContext): GameStageLayout {
  const hasActiveOverlay = Boolean(activeOverlay);
  const isGameStage = game.phase !== "home" && game.phase !== "setup";
  const hideSections = hasActiveOverlay;
  const statusSection = !hideSections && game.mode === "sync" && game.phase === "allocation" && localAllocationReady
    ? "allocationWaiting"
    : "none";
  const troopSection = hideSections
    ? null
    : troopSectionModeForGame({
        canControlTurnPlayer,
        canShowAllocationSection,
        canShowReinforcementSection,
        game,
        gameMapInspection,
        turnActionPlayer,
        turnMapInspection,
      });
  const actionSection = !hideSections && game.phase === "turn" && canControlTurnPlayer && turnActionPlayer ? "turn" : "none";

  return {
    actionSection,
    canUseMapCameraControls: isGameStage && !hideSections && statusSection === "none",
    freezeMapGestures: hasActiveOverlay,
    showGameStageLayout: isGameStage,
    showPlayerBar: isGameStage && Boolean(playerBarPlayer),
    statusSection,
    troopSection,
  };
}

export function territoryInspectionForViewer({
  game,
  ownership,
  revealedTerritory,
  selectedTerritory,
  selectedTerritoryId,
  viewerId,
}: TerritoryInspectionContext): TerritoryInspection {
  if (revealedTerritory) {
    return {
      capturedSpies: capturedSpiesOnTerritory(game, revealedTerritory.id),
      selectedTerritory: revealedTerritory,
      troopBreakdown: territoryTroops(game.allocation, revealedTerritory.id),
      troopPlayerId: ownership[revealedTerritory.id] ?? null,
    };
  }

  if (!selectedTerritory || !selectedTerritoryId || !viewerId || ownership[selectedTerritoryId] !== viewerId) {
    return {
      capturedSpies: [],
      selectedTerritory,
      troopBreakdown: null,
      troopPlayerId: viewerId,
    };
  }

  return {
    capturedSpies: capturedSpiesOnTerritory(game, selectedTerritoryId),
    selectedTerritory,
    troopBreakdown: territoryTroops(game.allocation, selectedTerritoryId),
    troopPlayerId: viewerId,
  };
}

export function playerBarTimerRemaining(game: GameState, now: number, pausedReturnPhase: AppPhase | null) {
  if (game.phase === "draft" && game.draft?.timerEndsAt) {
    return Math.max(0, game.draft.timerEndsAt - now);
  }

  if (game.phase === "allocation" && game.allocation?.timerEndsAt) {
    return Math.max(0, game.allocation.timerEndsAt - now);
  }

  if (game.phase === "allocation" || game.phase === "allocationHandoff") {
    return game.allocation?.timerRemainingMs ?? null;
  }

  if (game.phase !== "paused" || game.turn || pausedReturnPhase === "gameMap") {
    return null;
  }

  if (game.allocation) {
    return game.allocation.timerRemainingMs ?? null;
  }

  return game.draft?.timerRemainingMs ?? null;
}

export function playerBarPlayerForGame({
  activeDraftPlayer,
  allocationPlayer,
  currentTurnPlayer,
  game,
  gameMapViewer,
  pausedReturnPhase,
}: PlayerBarContext) {
  if (game.phase === "draft") {
    return activeDraftPlayer;
  }

  if (game.phase === "allocation" || game.phase === "allocationHandoff") {
    return allocationPlayer;
  }

  if (game.phase === "turn" || game.phase === "turnHandoff") {
    return currentTurnPlayer;
  }

  if (game.phase === "gameMap") {
    return gameMapViewer;
  }

  if (game.phase !== "paused") {
    return null;
  }

  if (game.turn) {
    return currentTurnPlayer;
  }

  if (pausedReturnPhase === "gameMap") {
    return gameMapViewer;
  }

  if (game.allocation) {
    return allocationPlayer;
  }

  if (game.draft) {
    return activePlayer({ ...game, phase: "draft" });
  }

  return null;
}

export function playerBarDraftProgress(game: GameState, player: GamePlayer | null) {
  const isDraftBar = game.phase === "draft" || (game.phase === "paused" && Boolean(game.draft) && !game.allocation);

  return isDraftBar && player
    ? draftProgressForPlayer(game, player.id)
    : null;
}

export function notificationPlayerId(game: GameState, syncRole: SyncRole, localPlayerId: string | null, turnViewerId: string | null) {
  if (game.mode === "sync") {
    return syncRole === "joiner" || syncRole === "host" ? localPlayerId : null;
  }

  if (game.phase === "turn" || game.phase === "turnHandoff" || (game.phase === "paused" && game.turn)) {
    return turnViewerId;
  }

  return null;
}

export function visibleNotification(game: GameState, playerId: string | null, syncJoinerBlocked: boolean) {
  if (!playerId || syncJoinerBlocked) {
    return null;
  }

  if (game.mode === "local" && game.phase === "turnHandoff") {
    return null;
  }

  return (game.notifications[playerId] ?? []).find((notification) => {
    if (notification.type !== "regionGained" && notification.type !== "regionLost") {
      return true;
    }

    return notification.delivery === "immediate" ||
      (game.phase === "turn" &&
        game.turn?.currentPlayerId === playerId &&
        game.turn.turnNumber >= notification.minTurnNumber);
  }) ?? null;
}

export function syncSnapshotForViewer(game: GameState, viewerId: string): GameState {
  const viewerGame = {
    ...game,
    notifications: {
      [viewerId]: game.notifications[viewerId] ?? [],
    },
  };

  if (viewerGame.phase !== "turn" || !viewerGame.turn || viewerGame.turn.currentPlayerId === viewerId) {
    return viewerGame;
  }

  return {
    ...viewerGame,
    turn: {
      ...viewerGame.turn,
      stage: publicTurnStage(viewerGame.turn.stage, viewerGame.turn.spyReturnStage),
      spyReturnStage: null,
      spyIntel: null,
      reinforcement: null,
    },
  };
}

function troopSectionModeForGame({
  canControlTurnPlayer,
  canShowAllocationSection,
  canShowReinforcementSection,
  game,
  gameMapInspection,
  turnActionPlayer,
  turnMapInspection,
}: Omit<GameStageLayoutContext, "activeOverlay" | "localAllocationReady" | "playerBarPlayer">): TroopSectionMode {
  if (canShowAllocationSection) {
    return { type: "allocation", source: "initial" };
  }

  if (game.phase === "gameMap" && gameMapInspection.selectedTerritory) {
    return { type: "info", source: "gameMap" };
  }

  if (game.phase !== "turn") {
    return null;
  }

  if (canControlTurnPlayer && turnActionPlayer && canShowReinforcementSection) {
    return { type: "allocation", source: "reinforcement" };
  }

  if (
    game.turn?.stage !== "reinforcementBuild" &&
    game.turn?.stage !== "reinforcementPlace" &&
    game.turn?.stage !== "spyTarget" &&
    turnMapInspection.selectedTerritory
  ) {
    return { type: "info", source: "turn" };
  }

  return null;
}

function territoryTroopTotalWithTurnPreview(game: GameState, territoryId: string) {
  const baseCount = territoryTroopTotal(game.allocation, territoryId);
  const reinforcement = game.turn?.reinforcement;

  if (!reinforcement || !reinforcement.territories[territoryId]) {
    return baseCount;
  }

  return baseCount + troopTotal(reinforcement.territories[territoryId]);
}

function visibleTroopTotalTerritoryIds(ownership: Record<string, string | null>, viewerId: string) {
  const visibleIds = new Set(ownedTerritoryIds(ownership, viewerId));

  for (const territoryId of [...visibleIds]) {
    const connections = generatedMapConnections[territoryId as keyof typeof generatedMapConnections] ?? [];
    for (const connectedId of connections) {
      if (ownership[connectedId] && ownership[connectedId] !== viewerId) {
        visibleIds.add(connectedId);
      }
    }
  }

  return visibleIds;
}

function publicTurnStage(stage: NonNullable<GameState["turn"]>["stage"], spyReturnStage: NonNullable<GameState["turn"]>["spyReturnStage"]) {
  if (stage === "spyTarget" || stage === "spyIntel") {
    return spyReturnStage ?? "reinforcementReady";
  }

  if (stage === "reinforcementBuild" || stage === "reinforcementPlace") {
    return "reinforcementReady";
  }

  return stage;
}
