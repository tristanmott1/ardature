import { generatedMapConnections } from "../map/generated/mapConnections";
import type { GeneratedTerritoryData } from "../map/mapTypes";
import { territoryForId } from "../map/territoryLookup";
import {
  activePlayer,
  capturedSpiesOnTerritory,
  canPickTerritory,
  draftProgressForPlayer,
  ownedTerritoryIds,
  territoryTroopTotal,
  territoryTroops,
  troopTotal,
  turnPlayer,
} from "./gameState";
import type { AppPhase, GamePlayer, GameState, TerritoryOwnerMap } from "./gameTypes";

export type SyncRole = "host" | "joiner" | null;

export type SyncSessionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected" | "hostEnded";

export type ActiveOverlay =
  | { type: "syncBlocked" }
  | { type: "scanner" }
  | { type: "decision"; decision: "exit" | "restart" }
  | { type: "pause" }
  | { type: "handoff"; handoff: "allocation" | "turn" }
  | { type: "armyBuild"; build: "allocation" | "reinforcement" }
  | { type: "notification" }
  | { type: "confirm"; confirm: "draft" | "spy" };

export type DecisionPrompt = "exit" | "restart" | null;

export type CapturedSpyView = ReturnType<typeof capturedSpiesOnTerritory>[number];

export type TerritoryInspection = {
  capturedSpies: CapturedSpyView[];
  selectedTerritory: GeneratedTerritoryData | null;
  troopBreakdown: ReturnType<typeof territoryTroops> | null;
  troopPlayerId: string | null;
};

export type MapPressMode = "draft" | "allocation" | "reinforcement" | "spy" | "inspect";

export type MapSelectionState = {
  allocationSelectedTerritoryId: string | null;
  gameMapSelectedTerritoryId: string | null;
  pendingDraftTerritoryId: string | null;
  pendingSpyTerritoryId: string | null;
  turnSelectedTerritoryId: string | null;
};

export type TroopSectionMode =
  | { type: "allocation"; source: "initial" | "reinforcement" }
  | { type: "info"; source: "gameMap" | "turn" };

export type UpperGameSectionMode =
  | { type: "troop"; troopSection: TroopSectionMode }
  | { type: "allocationWaiting" }
  | null;

export type ActionSectionMode = "turn" | null;

export type OverlayBehavior = {
  freezesMap: boolean;
  hidesActionSection: boolean;
  hidesCameraControls: boolean;
  hidesUpperSection: boolean;
};

export type GameStageLayout = {
  actionSection: ActionSectionMode;
  canUseMapCameraControls: boolean;
  freezeMapGestures: boolean;
  showGameStageLayout: boolean;
  showPlayerBar: boolean;
  upperSection: UpperGameSectionMode;
};

export type PlayerBarControls = {
  canCycleViewer: boolean;
  canPause: boolean;
  pauseLabel: string;
};

export type GameViewContext = {
  activeDraftPlayer: GamePlayer | null;
  allocationBuildSubmitted: boolean;
  allocationPlayer: GamePlayer | null;
  allocationPlayerId: string | null;
  canControlActivePlayer: boolean;
  canControlSetup: boolean;
  canControlTurnPlayer: boolean;
  canSendSyncCommand: boolean;
  currentTurnPlayer: GamePlayer | null;
  disconnectedSyncPlayers: Array<Pick<GamePlayer, "id" | "name"> & { color: NonNullable<GamePlayer["color"]> }>;
  gameMapViewer: GamePlayer | null;
  gameMapViewerId: string | null;
  isSyncGame: boolean;
  isSyncHost: boolean;
  isSyncJoiner: boolean;
  localAllocationReady: boolean;
  syncJoinerBlocked: boolean;
  turnActionPlayer: GamePlayer | null;
  turnPlayerId: string | null;
  turnViewerId: string | null;
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

type MapSelectionCleanupContext = {
  allocationPlayerId: string | null;
  canControlActivePlayer: boolean;
  game: GameState;
  ownership: TerritoryOwnerMap;
  turnPlayerId: string | null;
};

type TerritoryInspectionContext = {
  game: GameState;
  ownership: TerritoryOwnerMap;
  revealedTerritoryId?: string | null;
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

type GameViewContextInput = {
  game: GameState;
  localPlayerId: string | null;
  syncRole: SyncRole;
  syncSession: SyncSessionStatus;
};

type MapSelectionPressContext = {
  allocationPlayerId: string | null;
  game: GameState;
  mapPressMode: MapPressMode | null;
  ownership: TerritoryOwnerMap;
  selections: MapSelectionState;
  territoryId: string;
  turnPlayerId: string | null;
};

type ActiveOverlayContext = {
  allocationBuildSubmitted: boolean;
  allocationPlayerId: string | null;
  canControlActivePlayer: boolean;
  canControlTurnPlayer: boolean;
  decisionPrompt: DecisionPrompt;
  game: GameState;
  hasCurrentNotification: boolean;
  localAllocationReady: boolean;
  pendingDraftTerritoryId: string | null;
  pendingSpyTerritoryId: string | null;
  scannerActive: boolean;
  syncJoinerBlocked: boolean;
  turnPlayerId: string | null;
};

type GameStageLayoutContext = {
  activeOverlay: ActiveOverlay | null;
  allocationBuildSubmitted: boolean;
  allocationSelectedTerritoryId: string | null;
  canControlTurnPlayer: boolean;
  game: GameState;
  gameMapInspection: TerritoryInspection;
  localAllocationReady: boolean;
  playerBarPlayer: GamePlayer | null;
  turnActionPlayer: GamePlayer | null;
  turnMapInspection: TerritoryInspection;
  turnSelectedTerritoryId: string | null;
};

export function activeOverlayForState({
  allocationBuildSubmitted,
  allocationPlayerId,
  canControlActivePlayer,
  canControlTurnPlayer,
  decisionPrompt,
  game,
  hasCurrentNotification,
  localAllocationReady,
  pendingDraftTerritoryId,
  pendingSpyTerritoryId,
  scannerActive,
  syncJoinerBlocked,
  turnPlayerId,
}: ActiveOverlayContext): ActiveOverlay | null {
  const canShowDraftConfirm = Boolean(
    pendingDraftTerritoryId &&
      canControlActivePlayer &&
      canPickTerritory(game, pendingDraftTerritoryId),
  );
  const needsAllocationArmyBuild = Boolean(
    game.phase === "allocation" &&
      !localAllocationReady &&
      allocationPlayerId &&
      !allocationBuildSubmitted,
  );
  const needsReinforcementArmyBuild = Boolean(
    game.phase === "turn" &&
      canControlTurnPlayer &&
      turnPlayerId &&
      game.turn?.stage === "reinforcementBuild",
  );
  const hasSpyConfirm = Boolean(
    game.phase === "turn" &&
      canControlTurnPlayer &&
      turnPlayerId &&
      pendingSpyTerritoryId &&
      game.turn?.stage === "spyTarget",
  );

  return firstActiveOverlay(
    syncJoinerBlocked ? { type: "syncBlocked" } : null,
    scannerActive ? { type: "scanner" } : null,
    decisionPrompt ? { type: "decision", decision: decisionPrompt } : null,
    game.phase === "paused" ? { type: "pause" } : null,
    game.phase === "allocationHandoff" ? { type: "handoff", handoff: "allocation" } : null,
    game.phase === "turnHandoff" ? { type: "handoff", handoff: "turn" } : null,
    needsAllocationArmyBuild ? { type: "armyBuild", build: "allocation" } : null,
    needsReinforcementArmyBuild ? { type: "armyBuild", build: "reinforcement" } : null,
    hasCurrentNotification ? { type: "notification" } : null,
    hasSpyConfirm ? { type: "confirm", confirm: "spy" } : null,
    canShowDraftConfirm ? { type: "confirm", confirm: "draft" } : null,
  );
}

function firstActiveOverlay(...overlays: Array<ActiveOverlay | null>): ActiveOverlay | null {
  for (const overlay of overlays) {
    if (overlay) {
      return overlay;
    }
  }

  return null;
}

export function overlayBehaviorForOverlay(activeOverlay: ActiveOverlay | null): OverlayBehavior {
  if (!activeOverlay) {
    return {
      freezesMap: false,
      hidesActionSection: false,
      hidesCameraControls: false,
      hidesUpperSection: false,
    };
  }

  return {
    freezesMap: true,
    hidesActionSection: true,
    hidesCameraControls: true,
    hidesUpperSection: true,
  };
}

export function gameViewContextForState({
  game,
  localPlayerId,
  syncRole,
  syncSession,
}: GameViewContextInput): GameViewContext {
  const activeDraftPlayer = activePlayer(game);
  const currentTurnPlayer = turnPlayer(game);
  const localAllocationPlayerId = game.allocation?.order[game.allocation.currentIndex] ?? null;
  const allocationPlayerId = game.mode === "local"
    ? localAllocationPlayerId
    : localPlayerId;
  const allocationPlayer = game.players.find((player) => player.id === allocationPlayerId) ?? null;
  const allocationBuildSubmitted = Boolean(allocationPlayerId && game.allocation?.playerAllocations[allocationPlayerId]?.buildSubmitted);
  const localAllocationReady = Boolean(allocationPlayerId && game.allocation?.playerAllocations[allocationPlayerId]?.ready);
  const gameMapViewerId = game.mode === "local"
    ? localPlayerId ?? game.players[0]?.id ?? null
    : localPlayerId;
  const turnViewerId = game.phase === "turn" || game.phase === "turnHandoff" || (game.phase === "paused" && game.turn)
    ? game.mode === "local"
      ? game.turn?.currentPlayerId ?? localPlayerId
      : localPlayerId
    : gameMapViewerId;
  const isSyncGame = game.mode === "sync";
  const isSyncHost = isSyncGame && syncRole === "host";
  const isSyncJoiner = isSyncGame && syncRole === "joiner";
  const syncJoinerBlocked = isSyncJoiner && (syncSession === "reconnecting" || syncSession === "disconnected" || syncSession === "hostEnded");
  const canSendSyncCommand = !isSyncJoiner || syncSession === "connected";
  const canControlActivePlayer = game.mode === "local" || (isSyncGame && canSendSyncCommand && activeDraftPlayer?.id === localPlayerId);
  const canControlTurnPlayer = game.mode === "local" || (isSyncGame && canSendSyncCommand && game.turn?.currentPlayerId === localPlayerId);
  const turnPlayerId = game.turn?.currentPlayerId ?? null;
  const disconnectedSyncPlayers = game.mode === "sync"
    ? game.players.flatMap((player) => player.id !== localPlayerId && player.connectionStatus === "disconnected" && player.color
      ? [{ color: player.color, id: player.id, name: player.name }]
      : [])
    : [];
  const gameMapViewer = game.players.find((player) => player.id === turnViewerId) ?? game.players[0] ?? null;

  return {
    activeDraftPlayer,
    allocationBuildSubmitted,
    allocationPlayer,
    allocationPlayerId,
    canControlActivePlayer,
    canControlSetup: game.mode === "local" || isSyncHost,
    canControlTurnPlayer,
    canSendSyncCommand,
    currentTurnPlayer,
    disconnectedSyncPlayers,
    gameMapViewer,
    gameMapViewerId,
    isSyncGame,
    isSyncHost,
    isSyncJoiner,
    localAllocationReady,
    syncJoinerBlocked,
    turnActionPlayer: currentTurnPlayer,
    turnPlayerId,
    turnViewerId,
  };
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
      const territory = territoryForId(territoryId);
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

export function sanitizeMapSelections(
  selections: MapSelectionState,
  {
    allocationPlayerId,
    canControlActivePlayer,
    game,
    ownership,
    turnPlayerId,
  }: MapSelectionCleanupContext,
): MapSelectionState {
  let next = selections;

  function clear(key: keyof MapSelectionState) {
    if (next[key] === null) {
      return;
    }

    next = next === selections ? { ...selections } : next;
    next[key] = null;
  }

  if (selections.pendingDraftTerritoryId && (!canControlActivePlayer || !canPickTerritory(game, selections.pendingDraftTerritoryId))) {
    clear("pendingDraftTerritoryId");
  }

  if (
    selections.allocationSelectedTerritoryId &&
    (game.phase !== "allocation" ||
      !allocationPlayerId ||
      ownership[selections.allocationSelectedTerritoryId] !== allocationPlayerId)
  ) {
    clear("allocationSelectedTerritoryId");
  }

  if (
    selections.gameMapSelectedTerritoryId &&
    (game.phase !== "gameMap" && game.phase !== "turn" || !(selections.gameMapSelectedTerritoryId in ownership))
  ) {
    clear("gameMapSelectedTerritoryId");
  }

  if (
    selections.turnSelectedTerritoryId &&
    (game.phase !== "turn" ||
      !turnPlayerId ||
      ownership[selections.turnSelectedTerritoryId] !== turnPlayerId)
  ) {
    clear("turnSelectedTerritoryId");
  }

  if (
    selections.pendingSpyTerritoryId &&
    (game.phase !== "turn" ||
      !turnPlayerId ||
      !ownership[selections.pendingSpyTerritoryId] ||
      ownership[selections.pendingSpyTerritoryId] === turnPlayerId)
  ) {
    clear("pendingSpyTerritoryId");
  }

  return next;
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

export function mapSelectionUpdateForPress({
  allocationPlayerId,
  game,
  mapPressMode,
  ownership,
  selections,
  territoryId,
  turnPlayerId,
}: MapSelectionPressContext): Partial<MapSelectionState> | null {
  switch (mapPressMode) {
    case "allocation":
      return allocationPlayerId && ownership[territoryId] === allocationPlayerId
        ? { allocationSelectedTerritoryId: toggledSelection(selections.allocationSelectedTerritoryId, territoryId) }
        : null;
    case "draft":
      return canPickTerritory(game, territoryId)
        ? { pendingDraftTerritoryId: territoryId }
        : null;
    case "inspect":
      return { gameMapSelectedTerritoryId: toggledSelection(selections.gameMapSelectedTerritoryId, territoryId) };
    case "reinforcement":
      return turnPlayerId && ownership[territoryId] === turnPlayerId
        ? { turnSelectedTerritoryId: toggledSelection(selections.turnSelectedTerritoryId, territoryId) }
        : null;
    case "spy":
      return turnPlayerId && ownership[territoryId] && ownership[territoryId] !== turnPlayerId
        ? { pendingSpyTerritoryId: territoryId }
        : null;
    case null:
      return null;
  }
}

export function gameStageLayoutForState({
  activeOverlay,
  allocationBuildSubmitted,
  allocationSelectedTerritoryId,
  canControlTurnPlayer,
  game,
  gameMapInspection,
  localAllocationReady,
  playerBarPlayer,
  turnActionPlayer,
  turnMapInspection,
  turnSelectedTerritoryId,
}: GameStageLayoutContext): GameStageLayout {
  const overlayBehavior = overlayBehaviorForOverlay(activeOverlay);
  const isGameStage = game.phase !== "home" && game.phase !== "setup";
  const upperSection = overlayBehavior.hidesUpperSection
    ? null
    : upperSectionModeForGame({
        canControlTurnPlayer,
        allocationBuildSubmitted,
        allocationSelectedTerritoryId,
        game,
        gameMapInspection,
        localAllocationReady,
        turnActionPlayer,
        turnMapInspection,
        turnSelectedTerritoryId,
      });
  const actionSection = !overlayBehavior.hidesActionSection && game.phase === "turn" && canControlTurnPlayer && turnActionPlayer ? "turn" : null;

  return {
    actionSection,
    canUseMapCameraControls: isGameStage && !overlayBehavior.hidesCameraControls,
    freezeMapGestures: overlayBehavior.freezesMap,
    showGameStageLayout: isGameStage,
    showPlayerBar: isGameStage && Boolean(playerBarPlayer),
    upperSection,
  };
}

export function territoryInspectionForViewer({
  game,
  ownership,
  revealedTerritoryId,
  selectedTerritoryId,
  viewerId,
}: TerritoryInspectionContext): TerritoryInspection {
  const revealedTerritory = revealedTerritoryId ? territoryForId(revealedTerritoryId) : null;
  const selectedTerritory = selectedTerritoryId ? territoryForId(selectedTerritoryId) : null;

  if (revealedTerritory) {
    return {
      capturedSpies: capturedSpiesOnTerritory(game, revealedTerritory.id),
      selectedTerritory: revealedTerritory,
      troopBreakdown: territoryTroops(game.allocation, revealedTerritory.id),
      troopPlayerId: ownership[revealedTerritory.id] ?? null,
    };
  }

  const selectedOwnerId = selectedTerritoryId ? ownership[selectedTerritoryId] ?? null : null;

  if (!selectedTerritory || !selectedTerritoryId || !viewerId || selectedOwnerId !== viewerId) {
    return {
      capturedSpies: [],
      selectedTerritory,
      troopBreakdown: null,
      troopPlayerId: selectedOwnerId,
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

export function playerBarControlsForGame(game: GameState, isSyncHost: boolean): PlayerBarControls {
  return {
    canCycleViewer: game.phase === "gameMap" && game.mode === "local",
    canPause: game.phase !== "paused" && (game.mode === "local" || isSyncHost),
    pauseLabel: game.phase === "draft"
      ? "Pause draft"
      : game.phase === "gameMap" || game.phase === "turn"
        ? "Pause map"
        : "Pause allocation",
  };
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

function upperSectionModeForGame({
  allocationBuildSubmitted,
  allocationSelectedTerritoryId,
  canControlTurnPlayer,
  game,
  gameMapInspection,
  localAllocationReady,
  turnActionPlayer,
  turnMapInspection,
  turnSelectedTerritoryId,
}: Omit<GameStageLayoutContext, "activeOverlay" | "playerBarPlayer">): UpperGameSectionMode {
  if (game.mode === "sync" && game.phase === "allocation" && localAllocationReady) {
    return { type: "allocationWaiting" };
  }

  if (game.phase === "allocation" && allocationBuildSubmitted && allocationSelectedTerritoryId) {
    return { type: "troop", troopSection: { type: "allocation", source: "initial" } };
  }

  if (game.phase === "gameMap" && gameMapInspection.selectedTerritory) {
    return { type: "troop", troopSection: { type: "info", source: "gameMap" } };
  }

  if (game.phase !== "turn") {
    return null;
  }

  if (
    game.phase === "turn" &&
    canControlTurnPlayer &&
    turnActionPlayer &&
    game.turn?.stage === "reinforcementPlace" &&
    turnSelectedTerritoryId
  ) {
    return { type: "troop", troopSection: { type: "allocation", source: "reinforcement" } };
  }

  if (
    game.turn?.stage !== "reinforcementBuild" &&
    game.turn?.stage !== "reinforcementPlace" &&
    game.turn?.stage !== "spyTarget" &&
    turnMapInspection.selectedTerritory
  ) {
    return { type: "troop", troopSection: { type: "info", source: "turn" } };
  }

  return null;
}

function toggledSelection(currentTerritoryId: string | null, territoryId: string) {
  return currentTerritoryId === territoryId ? null : territoryId;
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
