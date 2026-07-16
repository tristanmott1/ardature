import { type PointerEvent as ReactPointerEvent, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocalPauseRecovery } from "./app/useLocalPauseRecovery";
import {
  addTroops,
  addSetupPlayer,
  applySyncDraftConfirm,
  adjustReinforcementTroop,
  adjustTerritoryTroop,
  allocationComplete,
  applySyncAllocationUpdate,
  applySyncPlayerConnectionStatus,
  applySyncPlayerQuit,
  applySyncProfileUpdate,
  applySyncTurnCommand,
  beginAllocationTurn,
  beginDraftTimer,
  battleUnitsReady,
  beginTurnAfterHandoff,
  canAddTroop,
  canAddReinforcementTroop,
  canAttackFromTerritory,
  canSelectAttackTargetTerritory,
  canCommitAttack,
  canCommitFortify,
  canUseSpy,
  cancelSpySelection,
  capturedSpiesOnTerritory,
  clearLocalGame,
  clearSyncHostGame,
  commitAttack,
  commitFortifyAndFinishTurn,
  completeTimedOutAllocation,
  completeTimedOutDraftPick,
  confirmSpyAttempt,
  confirmPendingElimination,
  confirmTerritoryPick,
  createInitialGameState,
  createOwnershipMap,
  createPlayer,
  createRegionControl,
  createTroopCounts,
  createTerritoryStates,
  dismissBattle,
  dismissNotification,
  dismissSpyIntel,
  emptyOwnedTerritoryCount,
  finishReinforcements,
  finishAllocationForPlayer,
  isSetupValid,
  pauseGame,
  projectReinforcementTroops,
  randomizeSetupPlayers,
  readLocalGame,
  readSyncHostGame,
  reinforcementComplete,
  remainingReinforcementTroops,
  remainingTroops,
  remainingTerritoryIds,
  retreatBattle,
  rollBattle,
  removeSetupPlayer,
  reorderSetupPlayers,
  restartPausedGameToSetup,
  restartVictoryGameToSetup,
  resumePausedGame,
  sampleBattleChallengeScore,
  saveLocalGame,
  saveSyncHostGame,
  submitBattleScore,
  skipFortifyAndFinishTurn,
  spyCaptureProbability,
  subtractTroops,
  territoryTroops,
  troopTotal,
  TROOP_TYPES,
  advanceAfterDraft,
  startDraft,
  startGameMapAfterAllocation,
  startTurnReinforcements,
  startSpySelection,
  submitArmyBuild,
  submitReinforcementBuild,
  transferHostAuthority,
  updateArmyMarker,
  updateReinforcementMarker,
  updateSetupConfig,
  updateSetupPlayer,
  updateUnlockedSetupPlayer,
  unlockSetupPlayerField,
} from "./game/gameState";
import type {
  AppPhase,
  ArmyMarker,
  FortifyMovesBySource,
  GameConfig,
  GamePlayer,
  GameState,
  PlayerColor,
  TroopType,
  TroopCounts,
  TurnCommand,
} from "./game/gameTypes";
import {
  gameConfigFromPreferences,
  localPlayersFromPreferences,
  saveGameConfigPreference,
  saveLocalSetupPreference,
  saveSyncProfilePreference,
  syncProfileFromPreferences,
} from "./game/setupPreferences";
import { preloadTroopIcons } from "./game/troopIcons";
import { notificationMessage } from "./game/notificationText";
import {
  activeOverlayForState,
  applyMapSelectionUpdates,
  canAdvanceAllocationWaiting,
  clearNonDraftMapSelections as clearNonDraftMapSelectionState,
  clearTurnMapSelections,
  createTroopMarkers,
  gameStageLayoutForState,
  gameViewContextForState,
  mapPressModeForGame,
  mapSelectionUpdateForBackgroundPress,
  mapSelectionUpdateForPress,
  notificationPlayerId,
  pausePanelPolicyForGame,
  playerBarControlsForGame,
  playerBarDraftProgress,
  playerBarPlayerForGame,
  playerBarTimerRemaining,
  sanitizeMapSelections,
  selectedTerritoryForMap,
  syncSnapshotForViewer,
  territoryInspectionForViewer,
  turnActionInstructionForGame,
  visibleNotification,
  type ActiveOverlay,
  type DecisionPrompt,
  type MapSelectionState,
  type MapPressMode,
  type SyncSessionStatus,
  type SyncRole,
} from "./game/gameView";
import { generatedMapData } from "./map/generated/mapData";
import { MapView, type MapCameraIntent, type MapVisibleInsets } from "./map/components/MapView";
import { readMapPreferences, saveMapPreferences } from "./map/mapPreferences";
import { territoryForId } from "./map/territoryLookup";
import { directedOwnedSourcesReachingTarget, hasDirectedConnection, outgoingTerritoryIds, type DynamicEdgeState } from "./game/mapGraph";
import { isArdatureSyncMessage, type ArdatureSyncMessage } from "./sync/syncMessages";
import { formatQrHandshakeError } from "./sync/syncErrors";
import { QrScanner } from "./sync/QrCodeUi";
import { ArmyBuildModal } from "./ui/ArmyBuildModal";
import { BattleModal } from "./ui/BattleModal";
import { AllocationWaitingPanel, TroopSection, TurnActionPanel } from "./ui/GameSections";
import { ConfirmSheet, DecisionDialog, EliminationDialog, HandoffPanel, NotificationDialog, VictoryDialog } from "./ui/Overlays";
import { PausePanel } from "./ui/PausePanel";
import { PlayerBar } from "./ui/PlayerChrome";
import { HomePanel, SetupPanel, SyncEntryPanel } from "./ui/SetupPanels";
import { SyncSessionBlocker } from "./ui/SyncSessionBlocker";
import {
  SyncHostTransport,
  SyncJoinTransport,
  parseSyncRecoveryAnswer,
  parseSyncRecoveryOffer,
  type SyncConnectionStatus,
  type SyncRecoveryPlayerSlot,
  type SyncWireMessage,
} from "./sync/syncTransport";

type SyncScannerMode = "hostOffer" | "joinAnswer" | null;

type JoinerSyncCommand = Extract<ArdatureSyncMessage, { type: "profileUpdate" | "draftConfirm" | "allocationUpdate" | "turnCommand" | "quit" }>;
type PendingCameraRequest =
  | { type: "home" }
  | { territoryId: string; type: "territory" }
  | null;

type AttackSetupState = {
  sourceTerritoryId: string | null;
  targetTerritoryId: string | null;
  troops: TroopCounts;
} | null;

type FortifySetupState = {
  movesBySource: FortifyMovesBySource;
  selectedSourceTerritoryId: string | null;
  targetTerritoryId: string | null;
} | null;

const EMPTY_MAP_SELECTIONS: MapSelectionState = {
  allocationSelectedTerritoryId: null,
  gameMapSelectedTerritoryId: null,
  pendingDraftTerritoryId: null,
  pendingSpyTerritoryId: null,
  turnSelectedTerritoryId: null,
};
const EMPTY_MAP_VISIBLE_INSETS: MapVisibleInsets = {
  bottom: 0,
  left: 0,
  right: 0,
  top: 0,
};
const CARADHRAS_PASS_ICON_SIZE = 502;
const CARADHRAS_PASS_ICON_X_OFFSET = -70;
const CARADHRAS_PASS_ICON_Y_OFFSET = 180;
const PATHS_OF_THE_DEAD_ICON_SIZE = 310;
const PATHS_OF_THE_DEAD_MIN_VISIBLE_STATE = 4;
const PATHS_OF_THE_DEAD_ICON_X_OFFSET = -860;
const PATHS_OF_THE_DEAD_ICON_Y_OFFSET = 210;

type MapInsetRefs = {
  actionSectionRef: RefObject<HTMLDivElement | null>;
  hasActionSection: boolean;
  hasPlayerBar: boolean;
  hasUpperSection: boolean;
  playerBarRef: RefObject<HTMLDivElement | null>;
  upperSectionRef: RefObject<HTMLDivElement | null>;
};

function useMapVisibleInsets({
  actionSectionRef,
  hasActionSection,
  hasPlayerBar,
  hasUpperSection,
  playerBarRef,
  upperSectionRef,
}: MapInsetRefs) {
  const [visibleInsets, setVisibleInsets] = useState<MapVisibleInsets>(EMPTY_MAP_VISIBLE_INSETS);

  const measureInsets = useCallback(() => {
    const nextInsets = {
      ...EMPTY_MAP_VISIBLE_INSETS,
      bottom: hasActionSection ? sectionBottomInset(actionSectionRef.current) : 0,
      top: hasUpperSection
        ? upperSectionRef.current?.getBoundingClientRect().bottom ?? 0
        : hasPlayerBar
          ? playerBarRef.current?.getBoundingClientRect().bottom ?? 0
          : 0,
    };

    setVisibleInsets((current) => sameVisibleInsets(current, nextInsets) ? current : nextInsets);
  }, [actionSectionRef, hasActionSection, hasPlayerBar, hasUpperSection, playerBarRef, upperSectionRef]);

  useLayoutEffect(() => {
    measureInsets();

    const observer = new ResizeObserver(measureInsets);
    const playerBar = playerBarRef.current;
    const upperSection = upperSectionRef.current;
    const actionSection = actionSectionRef.current;

    if (playerBar) {
      observer.observe(playerBar);
    }

    if (upperSection) {
      observer.observe(upperSection);
    }

    if (actionSection) {
      observer.observe(actionSection);
    }

    window.addEventListener("resize", measureInsets);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureInsets);
    };
  }, [hasActionSection, hasPlayerBar, hasUpperSection, measureInsets]);

  return visibleInsets;
}

function dynamicEdgeStateForGame(game: GameState): DynamicEdgeState {
  return {
    caradhrasPassState: game.caradhrasPassState,
    pathsOfTheDeadState: game.pathsOfTheDeadState,
  };
}

function dynamicMapWeatherMarkers(game: GameState) {
  if (!game.turn || !regularTurnPhaseHasWeather(game.phase)) {
    return [];
  }

  return [
    ...caradhrasPassWeatherMarkers(game.caradhrasPassState),
    ...pathsOfTheDeadWeatherMarkers(game.pathsOfTheDeadState),
  ];
}

function caradhrasPassWeatherMarkers(passState: number | null) {
  const rivendell = territoryForId("rivendell");
  const caradhras = territoryForId("caradhras");
  if (passState === null || !rivendell || !caradhras) {
    return [];
  }

  const displayState = Math.max(1, Math.min(10, Math.round(passState)));
  if (displayState === 1) {
    return [];
  }

  const iconNumber = String(displayState).padStart(2, "0");

  return [
    {
      center: {
        x: (rivendell.center.x + caradhras.center.x) / 2 + CARADHRAS_PASS_ICON_X_OFFSET,
        y: (rivendell.center.y + caradhras.center.y) / 2 + CARADHRAS_PASS_ICON_Y_OFFSET,
      },
      href: publicAssetUrl(`caradhras-pass/pass-${iconNumber}.svg`),
      id: "caradhras-pass",
      label: `Caradhras pass state ${displayState}`,
      size: CARADHRAS_PASS_ICON_SIZE,
    },
  ];
}

function pathsOfTheDeadWeatherMarkers(pathsState: number | null) {
  const edoras = territoryForId("edoras");
  if (pathsState === null || pathsState < PATHS_OF_THE_DEAD_MIN_VISIBLE_STATE || !edoras) {
    return [];
  }

  const displayState = Math.max(1, Math.min(6, Math.round(pathsState)));
  return [
    {
      center: {
        x: edoras.center.x + PATHS_OF_THE_DEAD_ICON_X_OFFSET,
        y: edoras.center.y + PATHS_OF_THE_DEAD_ICON_Y_OFFSET,
      },
      href: publicAssetUrl("troops/icons/ghost-head.png"),
      id: "paths-of-the-dead",
      label: `Paths of the Dead state ${displayState}`,
      opacity: (displayState - 3) / 3,
      size: PATHS_OF_THE_DEAD_ICON_SIZE,
    },
  ];
}

function regularTurnPhaseHasWeather(phase: AppPhase) {
  return phase === "turn" || phase === "turnHandoff" || phase === "paused";
}

function publicAssetUrl(path: string) {
  const baseUrl = import.meta.env.BASE_URL || "./";
  const assetPath = `${baseUrl}${path}`;

  return typeof window === "undefined"
    ? assetPath
    : new URL(assetPath, window.location.href).toString();
}

function sectionBottomInset(element: HTMLElement | null) {
  if (!element) {
    return 0;
  }

  const rect = element.getBoundingClientRect();
  return Math.max(0, window.innerHeight - rect.top);
}

function sameVisibleInsets(left: MapVisibleInsets, right: MapVisibleInsets) {
  return Math.abs(left.top - right.top) < 0.5 &&
    Math.abs(left.right - right.right) < 0.5 &&
    Math.abs(left.bottom - right.bottom) < 0.5 &&
    Math.abs(left.left - right.left) < 0.5;
}

function canCommitAttackAdjustment(delta: 1 | -1, committedTroops: TroopCounts, remainingTroops: TroopCounts) {
  const countsAreValid = Object.values(committedTroops).every((count) => count >= 0) &&
    Object.values(remainingTroops).every((count) => count >= 0);

  return countsAreValid && (delta < 0 || troopTotal(remainingTroops) >= 1);
}

const LEAVE_BEHIND_TROOP_TYPES: TroopType[] = ["heavy", "cavalry", "elite", "leader"];
const MOVE_FIRST_TROOP_TYPES = [...LEAVE_BEHIND_TROOP_TYPES].reverse();

function movableTroopsLeavingReserve(sourceTroops: TroopCounts, reserveCount: number, allowedTypes: TroopType[] = LEAVE_BEHIND_TROOP_TYPES) {
  const movableTroops = createTroopCounts();
  const allowedTypeSet = new Set(allowedTypes);
  let remainingReserve = Math.max(0, reserveCount);

  // Troops that cannot move already satisfy the leave-behind requirement.
  for (const troopType of LEAVE_BEHIND_TROOP_TYPES) {
    if (allowedTypeSet.has(troopType)) {
      continue;
    }

    remainingReserve = Math.max(0, remainingReserve - sourceTroops[troopType]);
  }

  // Reserve movable troops only when the immovable troops are not enough.
  for (const troopType of LEAVE_BEHIND_TROOP_TYPES) {
    const count = sourceTroops[troopType];
    if (!allowedTypeSet.has(troopType)) {
      continue;
    }

    const reserved = Math.min(count, remainingReserve);
    remainingReserve -= reserved;
    movableTroops[troopType] = count - reserved;
  }

  return movableTroops;
}

function movableTroopsLeavingOne(sourceTroops: TroopCounts, allowedTypes: TroopType[] = LEAVE_BEHIND_TROOP_TYPES) {
  return movableTroopsLeavingReserve(sourceTroops, 1, allowedTypes);
}

function createFortifyMove(move?: FortifyMovesBySource[string]) {
  return {
    spyOwnerIds: [...new Set(move?.spyOwnerIds ?? [])],
    troops: createTroopCounts(move?.troops),
  };
}

function fortifyMoveForSource(setup: FortifySetupState, sourceTerritoryId: string | null) {
  return sourceTerritoryId ? createFortifyMove(setup?.movesBySource[sourceTerritoryId]) : createFortifyMove();
}

function fortifyMoveIsEmpty(move: FortifyMovesBySource[string]) {
  return troopTotal(move.troops) === 0 && move.spyOwnerIds.length === 0;
}

function updateFortifySourceMove(setup: NonNullable<FortifySetupState>, sourceTerritoryId: string, move: FortifyMovesBySource[string]): NonNullable<FortifySetupState> {
  const movesBySource = { ...setup.movesBySource };
  if (fortifyMoveIsEmpty(move)) {
    delete movesBySource[sourceTerritoryId];
  } else {
    movesBySource[sourceTerritoryId] = move;
  }

  return {
    ...setup,
    movesBySource,
  };
}

function fortifyTotalMovedTroops(movesBySource: FortifyMovesBySource) {
  let total = createTroopCounts();
  for (const move of Object.values(movesBySource)) {
    total = addTroops(total, move.troops);
  }

  return total;
}

function fortifyTroopMarkerPreview(targetTerritoryId: string | null, movesBySource: FortifyMovesBySource) {
  const preview: Record<string, number> = {};
  if (!targetTerritoryId) {
    return preview;
  }

  for (const [sourceTerritoryId, move] of Object.entries(movesBySource)) {
    const movedCount = troopTotal(move.troops);
    if (movedCount <= 0) {
      continue;
    }

    preview[sourceTerritoryId] = (preview[sourceTerritoryId] ?? 0) - movedCount;
    preview[targetTerritoryId] = (preview[targetTerritoryId] ?? 0) + movedCount;
  }

  return preview;
}

function fortifyTargetTroops(game: GameState, targetTerritoryId: string | null, movesBySource: FortifyMovesBySource) {
  return targetTerritoryId
    ? addTroops(territoryTroops(game.allocation, targetTerritoryId), fortifyTotalMovedTroops(movesBySource))
    : createTroopCounts();
}

function fortifySourceTroops(game: GameState, sourceTerritoryId: string | null, sourceMove: FortifyMovesBySource[string]) {
  return sourceTerritoryId
    ? subtractTroops(territoryTroops(game.allocation, sourceTerritoryId), sourceMove.troops)
    : createTroopCounts();
}

function movedFortifySpyOwnerIds(movesBySource: FortifyMovesBySource) {
  const spyOwnerIds = new Set<string>();
  for (const move of Object.values(movesBySource)) {
    for (const spyOwnerId of move.spyOwnerIds) {
      spyOwnerIds.add(spyOwnerId);
    }
  }

  return spyOwnerIds;
}

function fortifySourceSpies(game: GameState, sourceTerritoryId: string | null, sourceMove: FortifyMovesBySource[string]) {
  const movedFromSource = new Set(sourceMove.spyOwnerIds);
  return sourceTerritoryId
    ? capturedSpiesOnTerritory(game, sourceTerritoryId).filter((spy) => !movedFromSource.has(spy.ownerPlayerId))
    : [];
}

function fortifyTargetSpies(game: GameState, targetTerritoryId: string | null, movesBySource: FortifyMovesBySource) {
  const movedSpies = [...movedFortifySpyOwnerIds(movesBySource)].map((ownerPlayerId) => ({ ownerPlayerId }));
  return targetTerritoryId
    ? [...capturedSpiesOnTerritory(game, targetTerritoryId), ...movedSpies]
    : movedSpies;
}

function fortifyEligibleSourceIds(game: GameState, ownership: Record<string, string | null>, targetTerritoryId: string | null, playerId: string | null) {
  const sourceIds = new Set<string>();
  if (!targetTerritoryId || !playerId || ownership[targetTerritoryId] !== playerId) {
    return sourceIds;
  }

  return directedOwnedSourcesReachingTarget(ownership, targetTerritoryId, playerId, dynamicEdgeStateForGame(game));
}

function fortifySourceIsImmediate(game: GameState, sourceTerritoryId: string | null, targetTerritoryId: string | null) {
  return Boolean(sourceTerritoryId && targetTerritoryId && hasDirectedConnection(sourceTerritoryId, targetTerritoryId, dynamicEdgeStateForGame(game)));
}

function fortifyMoveUsesRegularLane(move: FortifyMovesBySource[string]) {
  return move.troops.heavy > 0 || move.troops.elite > 0 || move.troops.leader > 0 || move.spyOwnerIds.length > 0;
}

function fortifyRegularSourceId(game: GameState, targetTerritoryId: string | null, movesBySource: FortifyMovesBySource) {
  for (const [sourceTerritoryId, move] of Object.entries(movesBySource)) {
    if (fortifySourceIsImmediate(game, sourceTerritoryId, targetTerritoryId) && fortifyMoveUsesRegularLane(move)) {
      return sourceTerritoryId;
    }
  }

  return null;
}

function canAddFortifyTroop(game: GameState, ownership: Record<string, string | null>, playerId: string | null, setup: FortifySetupState, troopType: TroopType) {
  if (!playerId || !setup?.targetTerritoryId || !setup.selectedSourceTerritoryId) {
    return false;
  }

  const eligibleSourceIds = fortifyEligibleSourceIds(game, ownership, setup.targetTerritoryId, playerId);
  if (!eligibleSourceIds.has(setup.selectedSourceTerritoryId)) {
    return false;
  }

  const sourceMove = fortifyMoveForSource(setup, setup.selectedSourceTerritoryId);
  const sourceTroops = fortifySourceTroops(game, setup.selectedSourceTerritoryId, sourceMove);
  if (sourceTroops[troopType] <= 0 || troopTotal(sourceTroops) <= 1) {
    return false;
  }

  if (troopType === "cavalry") {
    return true;
  }

  const regularSourceId = fortifyRegularSourceId(game, setup.targetTerritoryId, setup.movesBySource);
  return fortifySourceIsImmediate(game, setup.selectedSourceTerritoryId, setup.targetTerritoryId) &&
    (!regularSourceId || regularSourceId === setup.selectedSourceTerritoryId);
}

function canAddFortifySpy(game: GameState, ownership: Record<string, string | null>, playerId: string | null, setup: FortifySetupState, spyOwnerId: string) {
  if (!playerId || !setup?.targetTerritoryId || !setup.selectedSourceTerritoryId) {
    return false;
  }

  const eligibleSourceIds = fortifyEligibleSourceIds(game, ownership, setup.targetTerritoryId, playerId);
  if (!eligibleSourceIds.has(setup.selectedSourceTerritoryId)) {
    return false;
  }

  const sourceMove = fortifyMoveForSource(setup, setup.selectedSourceTerritoryId);
  if (!fortifySourceSpies(game, setup.selectedSourceTerritoryId, sourceMove).some((spy) => spy.ownerPlayerId === spyOwnerId)) {
    return false;
  }

  if (fortifySourceIsImmediate(game, setup.selectedSourceTerritoryId, setup.targetTerritoryId)) {
    const regularSourceId = fortifyRegularSourceId(game, setup.targetTerritoryId, setup.movesBySource);
    return !regularSourceId || regularSourceId === setup.selectedSourceTerritoryId;
  }

  return sourceMove.troops.cavalry > 0;
}

function suggestedTerritoryIdsForMap({
  activeOverlay,
  attackSetup,
  canControlTurnPlayer,
  fortifySetup,
  game,
  gameMapSelectedTerritoryId,
  mapPressMode,
  ownership,
  turnPlayerId,
}: {
  activeOverlay: ActiveOverlay | null;
  attackSetup: AttackSetupState;
  canControlTurnPlayer: boolean;
  fortifySetup: FortifySetupState;
  game: GameState;
  gameMapSelectedTerritoryId: string | null;
  mapPressMode: MapPressMode | null;
  ownership: Record<string, string | null>;
  turnPlayerId: string | null;
}) {
  if (activeOverlay) {
    return [];
  }

  if (game.phase === "turn" && canControlTurnPlayer && game.turn?.stage === "spyIntel" && game.turn.currentPlayerId === turnPlayerId && game.turn.spyIntel) {
    return [
      game.turn.spyIntel.targetTerritoryId,
      ...game.turn.spyIntel.totalTerritoryIds,
    ];
  }

  if (turnPlayerId && attackSetup?.sourceTerritoryId && !attackSetup.targetTerritoryId) {
    return outgoingTerritoryIds(attackSetup.sourceTerritoryId, dynamicEdgeStateForGame(game)).filter((territoryId) =>
      canSelectAttackTargetTerritory(game, turnPlayerId, attackSetup.sourceTerritoryId!, territoryId),
    );
  }

  if (turnPlayerId && fortifySetup?.targetTerritoryId) {
    return [...fortifyEligibleSourceIds(game, ownership, fortifySetup.targetTerritoryId, turnPlayerId)];
  }

  if (mapPressMode === "inspect" && gameMapSelectedTerritoryId) {
    return [...outgoingTerritoryIds(gameMapSelectedTerritoryId, dynamicEdgeStateForGame(game))];
  }

  return [];
}

function App() {
  const initialSyncHostRef = useRef<ReturnType<typeof readSyncHostGame> | undefined>(undefined);
  if (initialSyncHostRef.current === undefined) {
    initialSyncHostRef.current = readSyncHostGame();
  }

  const restoredSyncHost = initialSyncHostRef.current;
  const [game, setGame] = useState<GameState>(() => restoredSyncHost?.game ?? readLocalGame() ?? createInitialGameState());
  const [draftName, setDraftName] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [syncEntryOpen, setSyncEntryOpen] = useState(false);
  const [syncName, setSyncName] = useState(() => syncProfileFromPreferences().name);
  const [syncColor, setSyncColor] = useState<PlayerColor | null>(() => syncProfileFromPreferences().color ?? "green");
  const [syncRole, setSyncRole] = useState<SyncRole>(() => restoredSyncHost ? "host" : null);
  const [syncSession, setSyncSession] = useState<SyncSessionStatus>(() => restoredSyncHost ? "connected" : "idle");
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(() => restoredSyncHost?.localPlayerId ?? null);
  const [syncQrText, setSyncQrText] = useState("");
  const [syncAnswerText, setSyncAnswerText] = useState("");
  const [syncRecoveryOfferText, setSyncRecoveryOfferText] = useState("");
  const [syncRecoverySlots, setSyncRecoverySlots] = useState<SyncRecoveryPlayerSlot[]>([]);
  const [syncScannerMode, setSyncScannerMode] = useState<SyncScannerMode>(null);
  const [syncMessage, setSyncMessage] = useState("");
  const [isAcceptingAnswer, setIsAcceptingAnswer] = useState(false);
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null);
  const [decisionPrompt, setDecisionPrompt] = useState<DecisionPrompt>(null);
  const [pausedReturnPhase, setPausedReturnPhase] = useState<AppPhase | null>(null);
  const [cameraIntent, setCameraIntent] = useState<MapCameraIntent | null>(null);
  const [pendingCameraRequest, setPendingCameraRequest] = useState<PendingCameraRequest>(null);
  const [autoFocusEnabled, setAutoFocusEnabled] = useState(() => readMapPreferences().autoFocusEnabled);
  const [mapSelections, setMapSelections] = useState<MapSelectionState>(EMPTY_MAP_SELECTIONS);
  const [attackSetup, setAttackSetup] = useState<AttackSetupState>(null);
  const [fortifySetup, setFortifySetup] = useState<FortifySetupState>(null);
  const hostTransportRef = useRef<SyncHostTransport | null>(null);
  const joinTransportRef = useRef<SyncJoinTransport | null>(null);
  const localPlayerIdRef = useRef<string | null>(restoredSyncHost?.localPlayerId ?? null);
  const previousPhaseRef = useRef(game.phase);
  const lastSentAllocationRef = useRef("");
  const pendingHostTransferPlayerRef = useRef<string | null>(null);
  const pendingHostTransferTimeoutRef = useRef<number | null>(null);
  const syncRevisionRef = useRef(restoredSyncHost?.revision ?? 0);
  const lastSnapshotRevisionRef = useRef(0);
  const playerBarRef = useRef<HTMLDivElement | null>(null);
  const upperSectionRef = useRef<HTMLDivElement | null>(null);
  const actionSectionRef = useRef<HTMLDivElement | null>(null);
  localPlayerIdRef.current = localPlayerId;

  useEffect(() => {
    preloadTroopIcons();
  }, []);

  const {
    allocationSelectedTerritoryId,
    gameMapSelectedTerritoryId,
    pendingDraftTerritoryId,
    pendingSpyTerritoryId,
    turnSelectedTerritoryId,
  } = mapSelections;
  const ownership = game.draft?.ownership ?? createOwnershipMap();
  const {
    activeDraftPlayer: active,
    allocationBuildSubmitted,
    allocationPlayer,
    allocationPlayerId,
    canControlActivePlayer,
    canControlSetup,
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
    turnActionPlayer,
    turnPlayerId,
    turnViewerId,
  } = gameViewContextForState({
    game,
    localPlayerId,
    syncRole,
    syncSession,
  });
  const viewerSelectedTerritoryId = selectedTerritoryForMap({
    allocationPlayerId,
    allocationSelectedTerritoryId,
    canControlActivePlayer,
    canControlTurnPlayer,
    game,
    gameMapSelectedTerritoryId,
    pendingDraftTerritoryId,
    pendingSpyTerritoryId,
    turnSelectedTerritoryId,
  });
  const activeBattle = game.turn?.battle ?? null;
  const battleViewerId = game.mode === "local" ? turnPlayerId : localPlayerId;
  const isBattleParticipant = Boolean(
    activeBattle &&
      battleViewerId &&
      (activeBattle.attackerPlayerId === battleViewerId || activeBattle.defenderPlayerId === battleViewerId),
  );
  const canControlBattle = Boolean(
    activeBattle &&
      battleViewerId &&
      activeBattle.attackerPlayerId === battleViewerId &&
      canSendSyncCommand,
  );
  const canChallengeBattle = Boolean(
    activeBattle &&
      battleViewerId &&
      game.config.attackStyle === "challenge" &&
      !activeBattle.result &&
      ((battleViewerId === activeBattle.attackerPlayerId && !battleUnitsReady(activeBattle.attackingUnits)) ||
        (game.mode === "sync" && battleViewerId === activeBattle.defenderPlayerId && !battleUnitsReady(activeBattle.defendingUnits))),
  );
  const battleDefenderSpies = activeBattle ? capturedSpiesOnTerritory(game, activeBattle.targetTerritoryId) : [];
  const showBattleOverlay = Boolean(activeBattle && isBattleParticipant);
  const battleCue = activeBattle && game.mode === "sync" && !isBattleParticipant
    ? {
        sourceTerritoryId: activeBattle.sourceTerritoryId,
        targetTerritoryId: activeBattle.targetTerritoryId,
      }
    : null;
  const mapSelectedTerritoryIds = attackSetup
    ? [attackSetup.sourceTerritoryId, attackSetup.targetTerritoryId].filter((territoryId): territoryId is string => Boolean(territoryId))
    : fortifySetup
      ? [fortifySetup.targetTerritoryId, fortifySetup.selectedSourceTerritoryId].filter((territoryId): territoryId is string => Boolean(territoryId))
      : viewerSelectedTerritoryId;
  const troopMarkerPreview = useMemo(
    () => fortifySetup ? fortifyTroopMarkerPreview(fortifySetup.targetTerritoryId, fortifySetup.movesBySource) : {},
    [fortifySetup],
  );
  const troopMarkers = useMemo(
    () => createTroopMarkers(game, allocationPlayerId, gameMapViewerId, turnViewerId, troopMarkerPreview),
    [allocationPlayerId, game, gameMapViewerId, troopMarkerPreview, turnViewerId],
  );
  const weatherMarkers = useMemo(
    () => dynamicMapWeatherMarkers(game),
    [game],
  );
  const turnReinforcement = game.turn?.reinforcement ?? null;
  const turnProjectedReinforcements = turnPlayerId ? projectReinforcementTroops(game, turnPlayerId) : null;
  const turnSelectedTerritory = territoryForId(turnSelectedTerritoryId);
  const fortifySourceTerritory = territoryForId(fortifySetup?.selectedSourceTerritoryId);
  const fortifyTargetTerritory = territoryForId(fortifySetup?.targetTerritoryId);
  const fortifySourceMove = fortifyMoveForSource(fortifySetup, fortifySetup?.selectedSourceTerritoryId ?? null);
  const fortifySourceTroopCounts = fortifySourceTroops(game, fortifySetup?.selectedSourceTerritoryId ?? null, fortifySourceMove);
  const fortifyTargetTroopCounts = fortifyTargetTroops(game, fortifySetup?.targetTerritoryId ?? null, fortifySetup?.movesBySource ?? {});
  const fortifySourceSpyTokens = fortifySourceSpies(game, fortifySetup?.selectedSourceTerritoryId ?? null, fortifySourceMove);
  const fortifyTargetSpyTokens = fortifyTargetSpies(game, fortifySetup?.targetTerritoryId ?? null, fortifySetup?.movesBySource ?? {});
  const spyTargetTerritory = territoryForId(pendingSpyTerritoryId);
  const spyCapturePercent = pendingSpyTerritoryId && turnPlayerId ? spyCaptureProbability(game, turnPlayerId, pendingSpyTerritoryId) : null;
  const currentNotificationPlayerId = notificationPlayerId(game, syncRole, localPlayerId, turnViewerId);
  const currentNotification = visibleNotification(game, currentNotificationPlayerId, syncJoinerBlocked);
  const gameMapInspection = territoryInspectionForViewer({
    game,
    ownership,
    selectedTerritoryId: gameMapSelectedTerritoryId,
    viewerId: turnViewerId,
  });
  const turnMapInspection = territoryInspectionForViewer({
    game,
    ownership,
    revealedTerritoryId: canControlTurnPlayer ? game.turn?.spyIntel?.targetTerritoryId : null,
    selectedTerritoryId: gameMapSelectedTerritoryId,
    viewerId: turnViewerId,
  });
  const reinforcementCapturedSpies = turnSelectedTerritory ? capturedSpiesOnTerritory(game, turnSelectedTerritory.id) : [];
  const viewerPendingTerritory = territoryForId(pendingDraftTerritoryId);
  const timerRemaining = playerBarTimerRemaining(game, now, pausedReturnPhase);
  const mapPressMode = mapPressModeForGame({
    activeDraftPlayer: active,
    allocationBuildSubmitted,
    allocationPlayerId,
    canControlActivePlayer,
    canControlTurnPlayer,
    game,
    localAllocationReady,
    syncJoinerBlocked,
  });
  const activeOverlay = activeOverlayForState({
    allocationBuildSubmitted,
    allocationPlayerId,
    canControlActivePlayer,
    canControlTurnPlayer,
    game,
    hasCurrentNotification: Boolean(currentNotification),
    hasVisibleBattle: showBattleOverlay,
    decisionPrompt,
    localAllocationReady,
    pendingDraftTerritoryId,
    pendingSpyTerritoryId,
    scannerActive: Boolean(syncScannerMode),
    syncJoinerBlocked,
    turnPlayerId,
  });
  const mapSuggestedTerritoryIds = useMemo(
    () => suggestedTerritoryIdsForMap({
      activeOverlay,
      attackSetup,
      canControlTurnPlayer,
      fortifySetup,
      game,
      gameMapSelectedTerritoryId,
      mapPressMode,
      ownership,
      turnPlayerId,
    }),
    [activeOverlay, attackSetup, canControlTurnPlayer, fortifySetup, game, gameMapSelectedTerritoryId, mapPressMode, ownership, turnPlayerId],
  );
  const territoryStates = useMemo(
    () => createTerritoryStates(game.players, ownership, mapSelectedTerritoryIds, mapSuggestedTerritoryIds, battleCue),
    [battleCue, game.players, mapSelectedTerritoryIds, mapSuggestedTerritoryIds, ownership],
  );
  const playerBarPlayer = playerBarPlayerForGame({
    activeDraftPlayer: active,
    allocationPlayer,
    currentTurnPlayer,
    game,
    gameMapViewer,
    pausedReturnPhase,
  });
  const playerBarProgress = playerBarDraftProgress(game, playerBarPlayer);
  const playerBarControls = playerBarControlsForGame(game, isSyncHost);
  const pausePanelPolicy = pausePanelPolicyForGame(game, isSyncHost);
  const layout = gameStageLayoutForState({
    activeOverlay,
    allocationBuildSubmitted,
    allocationSelectedTerritoryId,
    canControlTurnPlayer,
    game,
    gameMapInspection,
    hasAttackTroopSection: Boolean(attackSetup?.sourceTerritoryId && attackSetup.targetTerritoryId),
    hasFortifyTroopSection: Boolean(fortifySetup?.targetTerritoryId && fortifySetup.selectedSourceTerritoryId),
    localAllocationReady,
    playerBarPlayer,
    turnActionPlayer,
    turnMapInspection,
    turnSelectedTerritoryId,
  });
  const visibleInsets = useMapVisibleInsets({
    actionSectionRef,
    hasActionSection: Boolean(layout.actionSection),
    hasPlayerBar: layout.showPlayerBar,
    hasUpperSection: Boolean(layout.upperSection),
    playerBarRef,
    upperSectionRef,
  });

  useLocalPauseRecovery(game);

  function updateMapSelections(updates: Partial<MapSelectionState>) {
    setMapSelections((current) => applyMapSelectionUpdates(current, updates));
  }

  function requestHomeCameraIntent() {
    setPendingCameraRequest({ type: "home" });
  }

  function requestTerritoryCameraIntent(territoryId: string) {
    setPendingCameraRequest({ territoryId, type: "territory" });
  }

  function cameraTerritoryIdForSelectionUpdates(updates: Partial<MapSelectionState>) {
    return updates.pendingDraftTerritoryId ??
      updates.allocationSelectedTerritoryId ??
      updates.gameMapSelectedTerritoryId ??
      updates.pendingSpyTerritoryId ??
      updates.turnSelectedTerritoryId ??
      null;
  }

  useEffect(() => {
    if (!pendingCameraRequest) {
      return;
    }

    setCameraIntent((current) => ({
      id: (current?.id ?? 0) + 1,
      ...pendingCameraRequest,
    }));
    setPendingCameraRequest(null);
  }, [pendingCameraRequest, visibleInsets]);

  useEffect(() => {
    setMapSelections((current) => sanitizeMapSelections(current, {
      allocationPlayerId,
      canControlActivePlayer,
      game,
      ownership,
      turnPlayerId,
    }));
  }, [allocationPlayerId, canControlActivePlayer, game, mapSelections, ownership, turnPlayerId]);

  useEffect(() => {
    if (!attackSetup) {
      return;
    }

    if (game.phase !== "turn" || game.turn?.stage !== "actions" || !turnPlayerId || syncJoinerBlocked) {
      setAttackSetup(null);
      return;
    }

    if (attackSetup.sourceTerritoryId && !canAttackFromTerritory(game, turnPlayerId, attackSetup.sourceTerritoryId)) {
      setAttackSetup(null);
      return;
    }

    if (
      attackSetup.sourceTerritoryId &&
      attackSetup.targetTerritoryId &&
      !canSelectAttackTargetTerritory(game, turnPlayerId, attackSetup.sourceTerritoryId, attackSetup.targetTerritoryId)
    ) {
      setAttackSetup((current) => current
        ? {
            ...current,
            targetTerritoryId: null,
            troops: createTroopCounts(),
          }
        : null);
      }
  }, [attackSetup, game, syncJoinerBlocked, turnPlayerId]);

  useEffect(() => {
    if (!fortifySetup) {
      return;
    }

    if (game.phase !== "turn" || game.turn?.stage !== "actions" || !turnPlayerId || syncJoinerBlocked) {
      setFortifySetup(null);
      return;
    }

    if (fortifySetup.targetTerritoryId && ownership[fortifySetup.targetTerritoryId] !== turnPlayerId) {
      setFortifySetup(null);
      return;
    }

    if (
      fortifySetup.targetTerritoryId &&
      fortifySetup.selectedSourceTerritoryId &&
      !fortifyEligibleSourceIds(game, ownership, fortifySetup.targetTerritoryId, turnPlayerId).has(fortifySetup.selectedSourceTerritoryId)
    ) {
      setFortifySetup((current) => current
        ? {
            ...current,
            selectedSourceTerritoryId: null,
          }
        : null);
    }
  }, [fortifySetup, game, ownership, syncJoinerBlocked, turnPlayerId]);

  useEffect(() => {
    if (game.mode === "local") {
      saveLocalGame(game);
    }
  }, [game]);

  useEffect(() => {
    if (game.phase !== "setup") {
      return;
    }

    if (game.mode === "local") {
      saveLocalSetupPreference(game.players, game.config);
      return;
    }

    const localPlayer = game.players.find((player) => player.id === localPlayerId);
    if (isSyncHost) {
      saveGameConfigPreference(game.config);
    }

    if (localPlayer && !localPlayer.nameLocked && !localPlayer.colorLocked) {
      saveSyncProfilePreference({
        name: localPlayer.name,
        color: localPlayer.color,
      });
    }
  }, [game.config, game.mode, game.phase, game.players, isSyncHost, localPlayerId]);

  useEffect(() => {
    if (isSyncHost) {
      broadcastSnapshot(game);
    }
  }, [game, isSyncHost, localPlayerId]);

  useEffect(() => {
    if (!isSyncHost || game.phase !== "paused") {
      return;
    }

    void createRecoveryOffer();
  }, [disconnectedSyncPlayers.map((player) => player.id).join("|"), game.phase, isSyncHost]);

  useEffect(() => {
    if (!restoredSyncHost || hostTransportRef.current || !isSyncHost || !localPlayerId) {
      return;
    }

    const hostPlayer = game.players.find((player) => player.id === localPlayerId);
    if (!hostPlayer?.color) {
      return;
    }

    hostTransportRef.current = new SyncHostTransport({
      callbacks: {
        onMessage: handleHostMessage,
        onPeerClosed: handleHostPeerClosed,
        onPeerStatus: handleHostPeerStatus,
      },
      hostColor: hostPlayer.color,
      hostName: hostPlayer.name,
      hostPlayerId: hostPlayer.id,
      roomId: crypto.randomUUID(),
    });
    setSyncSession("connected");

    if (game.phase === "paused") {
      void createRecoveryOffer();
    }
  }, [game.phase, game.players, isSyncHost, localPlayerId, restoredSyncHost]);

  useEffect(() => {
    if (!isSyncJoiner || !canSendSyncCommand || !localPlayerId || !game.allocation) {
      return;
    }

    const allocation = game.allocation.playerAllocations[localPlayerId];
    if (!allocation) {
      return;
    }

    const serialized = JSON.stringify(allocation);
    if (serialized === lastSentAllocationRef.current) {
      return;
    }

    lastSentAllocationRef.current = serialized;
    sendJoinerCommand({ type: "allocationUpdate", allocation });
  }, [canSendSyncCommand, game.allocation, isSyncJoiner, localPlayerId]);

  useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    previousPhaseRef.current = game.phase;

    if (previousPhase === "home" && game.phase === "draft" && game.draft && !game.draft.timerEndsAt) {
      setGame((current) => current.draft
        ? { ...current, draft: beginDraftTimer(current.draft, current.config, Date.now()) }
        : current);
    }

    if (game.mode === "local" && previousPhase !== game.phase && (game.phase === "allocationHandoff" || game.phase === "turnHandoff")) {
      requestHomeCameraIntent();
    }
  }, [game]);

  useEffect(() => {
    if (
      (game.phase !== "draft" || !game.draft?.timerEndsAt) &&
      (game.phase !== "allocation" || !game.allocation?.timerEndsAt)
    ) {
      return undefined;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [game.phase, game.draft?.timerEndsAt, game.allocation?.timerEndsAt]);

  useEffect(() => {
    if (isSyncGame && !isSyncHost) {
      return;
    }

    if (game.phase !== "draft" || !game.draft?.timerEndsAt || game.draft.timerEndsAt > now) {
      return;
    }

    setGame((current) => {
      const currentTime = Date.now();
      return completeTimedOutDraftPick(current, pendingDraftTerritoryId, currentTime);
    });
  }, [game.phase, game.draft?.timerEndsAt, isSyncGame, isSyncHost, now, pendingDraftTerritoryId]);

  useEffect(() => {
    if (
      !isSyncJoiner ||
      !canSendSyncCommand ||
      !pendingDraftTerritoryId ||
      !canControlActivePlayer ||
      game.phase !== "draft" ||
      !game.draft?.timerEndsAt ||
      game.draft.timerEndsAt > now
    ) {
      return;
    }

    sendJoinerCommand({ type: "draftConfirm", territoryId: pendingDraftTerritoryId });
    updateMapSelections({ pendingDraftTerritoryId: null });
  }, [canControlActivePlayer, canSendSyncCommand, game.draft?.timerEndsAt, game.phase, isSyncJoiner, now, pendingDraftTerritoryId]);

  useEffect(() => {
    if (isSyncGame && !isSyncHost) {
      return;
    }

    if (game.phase !== "allocation" || !game.allocation?.timerEndsAt || game.allocation.timerEndsAt > now) {
      return;
    }

    setGame((current) => {
      const currentTime = Date.now();
      return completeTimedOutAllocation(current, allocationPlayerId, currentTime);
    });
  }, [allocationPlayerId, game.phase, game.allocation?.timerEndsAt, isSyncGame, isSyncHost, now]);

  useEffect(() => {
    return () => {
      hostTransportRef.current?.close();
      joinTransportRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!draggingPlayerId) {
      return undefined;
    }

    const activeDraggingPlayerId = draggingPlayerId;

    function handlePointerMove(event: PointerEvent) {
      const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-player-id]");
      const overPlayerId = row?.dataset.playerId;

      if (overPlayerId && overPlayerId !== activeDraggingPlayerId) {
        reorderPlayer(activeDraggingPlayerId, overPlayerId);
      }
    }

    function handlePointerUp() {
      setDraggingPlayerId(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [draggingPlayerId, game.players]);

  function startLocalSetup() {
    endSyncTransports();
    clearSyncHostGame();
    setSyncEntryOpen(false);
    setSyncRole(null);
    setSyncSession("idle");
    setLocalPlayerId(null);
    lastSentAllocationRef.current = "";
    setSyncRecoveryOfferText("");
    setSyncRecoverySlots([]);
    setGame({
      ...createInitialGameState(),
      config: gameConfigFromPreferences(),
      phase: "setup",
      mode: "local",
      players: localPlayersFromPreferences(),
    });
  }

  function openSyncEntry() {
    const profile = syncProfileFromPreferences();

    clearLocalGame();
    clearSyncHostGame();
    endSyncTransports();
    syncRevisionRef.current = 0;
    lastSnapshotRevisionRef.current = 0;
    lastSentAllocationRef.current = "";
    setSyncEntryOpen(true);
    setSyncRole(null);
    setSyncSession("idle");
    setLocalPlayerId(null);
    setSyncName(profile.name);
    setSyncColor(profile.color ?? "green");
    setSyncAnswerText("");
    setSyncRecoveryOfferText("");
    setSyncRecoverySlots([]);
    setGame({
      ...createInitialGameState(),
      config: gameConfigFromPreferences(),
    });
  }

  function updateSyncName(name: string) {
    setSyncName(name);
    saveSyncProfilePreference({
      name,
      color: syncColor,
    });
  }

  function updateSyncColor(color: PlayerColor | null) {
    setSyncColor(color);
    saveSyncProfilePreference({
      name: syncName,
      color,
    });
  }

  async function beginSyncHost() {
    const name = syncName.trim();

    if (!name || !syncColor) {
      return;
    }

    const hostPlayer = { ...createPlayer(name), color: syncColor };
    const roomId = crypto.randomUUID();
    const hostTransport = new SyncHostTransport({
      callbacks: {
        onMessage: handleHostMessage,
        onPeerClosed: handleHostPeerClosed,
        onPeerStatus: handleHostPeerStatus,
      },
      hostColor: hostPlayer.color,
      hostName: hostPlayer.name,
      hostPlayerId: hostPlayer.id,
      roomId,
    });

    endSyncTransports();
    hostTransportRef.current = hostTransport;
    clearLocalGame();
    clearSyncHostGame();
    syncRevisionRef.current = 0;
    lastSnapshotRevisionRef.current = 0;
    lastSentAllocationRef.current = "";
    setSyncRole("host");
    setSyncSession("connected");
    setLocalPlayerId(hostPlayer.id);
    setSyncAnswerText("");
    setSyncRecoveryOfferText("");
    setSyncRecoverySlots([]);
    setSyncEntryOpen(false);
    setGame({
      ...createInitialGameState(),
      config: gameConfigFromPreferences(),
      phase: "setup",
      mode: "sync",
      players: [hostPlayer],
    });
    await createHostOffer();
  }

  async function createHostOffer(finalMessage = "") {
    const hostTransport = hostTransportRef.current;

    if (!hostTransport) {
      return;
    }

    setSyncMessage("Creating QR");
    try {
      setSyncQrText(await hostTransport.createOffer());
      setSyncMessage(finalMessage);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Could not create QR");
    }
  }

  async function createRecoveryOffer(finalMessage = "") {
    const hostTransport = hostTransportRef.current;

    if (!hostTransport || !isSyncHost || game.phase !== "paused") {
      return;
    }

    setSyncMessage(finalMessage || "Creating recovery QR");
    try {
      setSyncQrText(await hostTransport.createRecoveryOffer(disconnectedSyncPlayers));
      setSyncMessage(finalMessage);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Could not create recovery QR");
    }
  }

  async function acceptJoinAnswer(value: string) {
    const hostTransport = hostTransportRef.current;

    if (!hostTransport || !isSyncHost || isAcceptingAnswer) {
      return;
    }

    setSyncScannerMode(null);
    setIsAcceptingAnswer(true);
    setSyncMessage("QR found. Accepting answer");
    try {
      const recoveryAnswer = parseSyncRecoveryAnswer(value);
      const recoveryPlayer = recoveryAnswer
        ? game.players.find((player) => player.id === recoveryAnswer.playerId)
        : null;

      if (game.phase === "paused" && !recoveryAnswer) {
        throw new Error("this is not a recovery answer QR.");
      }

      if (game.phase !== "paused" && recoveryAnswer) {
        throw new Error("this is not a setup answer QR.");
      }

      if (recoveryAnswer && recoveryPlayer?.connectionStatus !== "disconnected") {
        throw new Error("that player is not currently disconnected.");
      }

      const joinedPlayer = recoveryAnswer
        ? await hostTransport.acceptRecoveryAnswer(value)
        : await hostTransport.acceptAnswer(value);

      setGame((current) => {
        const existing = current.players.find((player) => player.id === joinedPlayer.id);
        const players = existing
          ? current.players.map((player) => player.id === joinedPlayer.id ? { ...player, connectionStatus: "connected" as const } : player)
          : [
              ...current.players,
              {
                id: joinedPlayer.id,
                name: joinedPlayer.name,
                color: joinedPlayer.color,
                nameLocked: false,
                colorLocked: false,
                connectionStatus: "connected" as const,
              },
            ];

        return { ...current, players };
      });
      if (recoveryAnswer) {
        void createRecoveryOffer(`${joinedPlayer.name} rejoined`);
      } else {
        void createHostOffer(`${joinedPlayer.name} joined`);
      }
    } catch (error) {
      const message = formatQrHandshakeError(error);

      setSyncMessage(message);
      if (game.phase === "paused") {
        void createRecoveryOffer(message);
      } else {
        void createHostOffer(message);
      }
    } finally {
      setIsAcceptingAnswer(false);
    }
  }

  async function scanHostOffer(value: string) {
    const recoveryOffer = parseSyncRecoveryOffer(value);

    if (recoveryOffer) {
      setSyncScannerMode(null);
      setSyncAnswerText("");
      setSyncRecoveryOfferText(value);
      setSyncRecoverySlots(recoveryOffer.disconnectedPlayers);
      setSyncMessage(recoveryOffer.disconnectedPlayers.length > 0 ? "Choose player" : "No disconnected players");
      return;
    }

    const name = syncName.trim();

    if (!name || !syncColor) {
      setSyncMessage("Name and color first");
      return;
    }

    const localPlayer = { ...createPlayer(name), color: syncColor };
    const joinTransport = createJoinTransport(() => {
      joinTransportRef.current?.send({
        type: "profileUpdate",
        name: localPlayer.name,
        color: localPlayer.color,
      });
    });

    setSyncScannerMode(null);
    setSyncSession("connecting");
    setSyncMessage("QR found. Creating answer");
    try {
      const answer = await joinTransport.createAnswer(value, localPlayer);

      startJoinerAnswerSession(joinTransport, localPlayer.id, answer.answerText, [
        {
          id: answer.hostPlayerId,
          name: answer.hostName,
          color: answer.hostColor,
          nameLocked: true,
          colorLocked: true,
          connectionStatus: "connected",
        },
        localPlayer,
      ]);
    } catch (error) {
      joinTransport.close();
      setSyncMessage(formatQrHandshakeError(error));
    }
  }

  async function chooseRecoveryPlayer(slot: SyncRecoveryPlayerSlot) {
    const joinTransport = createJoinTransport();

    setSyncSession("connecting");
    setSyncMessage("Creating recovery answer");
    try {
      const answer = await joinTransport.createRecoveryAnswer(syncRecoveryOfferText, slot);

      startJoinerAnswerSession(joinTransport, slot.id, answer.answerText, [
        {
          id: answer.hostPlayerId,
          name: answer.hostName,
          color: answer.hostColor,
          nameLocked: true,
          colorLocked: true,
          connectionStatus: "connected",
        },
        {
          id: slot.id,
          name: slot.name,
          color: slot.color,
          nameLocked: true,
          colorLocked: true,
          connectionStatus: "connected",
        },
      ]);
    } catch (error) {
      joinTransport.close();
      setSyncMessage(formatQrHandshakeError(error));
    }
  }

  function createJoinTransport(onOpen?: () => void) {
    return new SyncJoinTransport({
      onClosed: resetAppToHome,
      onMessage: handleJoinerMessage,
      onOpen: () => {
        setSyncSession("connected");
        setSyncMessage("Connected");
        onOpen?.();
      },
      onStatus: handleJoinerConnectionStatus,
    });
  }

  function acceptHostTransfer(nextGame: GameState, revision: number) {
    const activeLocalPlayerId = localPlayerIdRef.current;
    const hostPlayer = activeLocalPlayerId
      ? nextGame.players.find((player) => player.id === activeLocalPlayerId)
      : null;
    if (!hostPlayer?.color) {
      resetAppToHome();
      return;
    }

    joinTransportRef.current?.close();
    joinTransportRef.current = null;
    hostTransportRef.current = new SyncHostTransport({
      callbacks: {
        onMessage: handleHostMessage,
        onPeerClosed: handleHostPeerClosed,
        onPeerStatus: handleHostPeerStatus,
      },
      hostColor: hostPlayer.color,
      hostName: hostPlayer.name,
      hostPlayerId: hostPlayer.id,
      roomId: crypto.randomUUID(),
    });
    syncRevisionRef.current = revision;
    lastSentAllocationRef.current = "";
    setSyncRole("host");
    setSyncSession("connected");
    setSyncMessage("Host transferred");
    setSyncRecoveryOfferText("");
    setSyncRecoverySlots([]);
    setGame(nextGame);
  }

  function startJoinerAnswerSession(joinTransport: SyncJoinTransport, playerId: string, answerText: string, players: GamePlayer[]) {
    endSyncTransports();
    joinTransportRef.current = joinTransport;
    clearLocalGame();
    setSyncRole("joiner");
    setSyncSession("connecting");
    setLocalPlayerId(playerId);
    lastSnapshotRevisionRef.current = 0;
    lastSentAllocationRef.current = "";
    setSyncAnswerText(answerText);
    setSyncQrText("");
    setSyncRecoveryOfferText("");
    setSyncRecoverySlots([]);
    setSyncEntryOpen(false);
    setGame({
      ...createInitialGameState(),
      phase: "setup",
      mode: "sync",
      players,
    });
    setSyncMessage("Show this answer to the host");
  }

  const handleHostMessage = useCallback((playerId: string, rawMessage: SyncWireMessage) => {
    if (!isArdatureSyncMessage(rawMessage)) {
      return;
    }

    if (rawMessage.type === "profileUpdate") {
      setGame((current) => applySyncProfileUpdate(current, playerId, {
        color: rawMessage.color,
        name: rawMessage.name,
      }));
      return;
    }

    if (rawMessage.type === "draftConfirm") {
      setGame((current) => applySyncDraftConfirm(current, playerId, rawMessage.territoryId, Date.now()));
      return;
    }

    if (rawMessage.type === "allocationUpdate") {
      setGame((current) => applySyncAllocationUpdate(current, playerId, rawMessage.allocation));
      return;
    }

    if (rawMessage.type === "turnCommand") {
      setGame((current) => applySyncTurnCommand(current, playerId, rawMessage.command));
      return;
    }

    if (rawMessage.type === "hostTransferAccepted") {
      if (pendingHostTransferPlayerRef.current === playerId) {
        if (pendingHostTransferTimeoutRef.current !== null) {
          window.clearTimeout(pendingHostTransferTimeoutRef.current);
        }
        pendingHostTransferPlayerRef.current = null;
        pendingHostTransferTimeoutRef.current = null;
        resetAppToHome();
      }
      return;
    }

    if (rawMessage.type === "quit") {
      hostTransportRef.current?.removePeer(playerId);
      setGame((current) => applySyncPlayerQuit(current, playerId));
    }
  }, []);

  const handleJoinerMessage = useCallback((_playerId: string, rawMessage: SyncWireMessage) => {
    if (!isArdatureSyncMessage(rawMessage)) {
      return;
    }

    if (rawMessage.type === "hostTransfer") {
      if (rawMessage.revision < lastSnapshotRevisionRef.current) {
        return;
      }

      lastSnapshotRevisionRef.current = rawMessage.revision;
      joinTransportRef.current?.send({ type: "hostTransferAccepted" });
      acceptHostTransfer(rawMessage.game, rawMessage.revision);
      return;
    }

    if (rawMessage.type === "hostEnded" || rawMessage.type === "removed") {
      resetAppToHome();
      return;
    }

    if (rawMessage.type !== "snapshot") {
      return;
    }

    if (rawMessage.revision <= lastSnapshotRevisionRef.current) {
      return;
    }

    lastSnapshotRevisionRef.current = rawMessage.revision;
    setSyncSession("connected");
    setGame(rawMessage.game);
  }, []);

  const handleHostPeerClosed = useCallback((playerId: string) => {
    setGame((current) => applySyncPlayerConnectionStatus(current, playerId, "disconnected"));
  }, []);

  const handleHostPeerStatus = useCallback((playerId: string, status: SyncConnectionStatus) => {
    const playerStatus = status === "connected" ? "connected" : status === "reconnecting" ? "reconnecting" : "disconnected";

    setGame((current) => applySyncPlayerConnectionStatus(current, playerId, playerStatus));
  }, []);

  const handleJoinerConnectionStatus = useCallback((status: SyncConnectionStatus) => {
    if (status === "gone") {
      resetAppToHome();
      return;
    }

    setSyncSession(status === "connected" ? "connected" : status === "reconnecting" ? "reconnecting" : "disconnected");
    setSyncMessage(status === "connected" ? "Connected" : status === "reconnecting" ? "Reconnecting" : "Disconnected");
  }, []);

  function addPlayer() {
    if (!draftName.trim() || game.players.length >= 6) {
      return;
    }

    setGame((current) => addSetupPlayer(current, draftName));
    setDraftName("");
  }

  function updatePlayer(playerId: string, updates: Partial<GamePlayer>) {
    if (isSyncJoiner) {
      if (!canSendSyncCommand) {
        return;
      }

      const player = game.players.find((candidate) => candidate.id === playerId);

      if (!player || player.id !== localPlayerId) {
        return;
      }

      const allowed: Partial<GamePlayer> = {};
      if (updates.name !== undefined && !player.nameLocked) {
        allowed.name = updates.name;
      }

      if (updates.color !== undefined && !player.colorLocked) {
        allowed.color = updates.color;
      }

      setGame((current) => updateUnlockedSetupPlayer(current, playerId, allowed));
      sendJoinerCommand({
        type: "profileUpdate",
        name: allowed.name,
        color: allowed.color,
      });
      return;
    }

    setGame((current) => updateSetupPlayer(current, playerId, updates, isSyncHost ? localPlayerId : null));
  }

  function unlockPlayerField(playerId: string, field: "name" | "color") {
    if (!isSyncHost) {
      return;
    }

    setGame((current) => unlockSetupPlayerField(current, playerId, field));
  }

  function removePlayer(playerId: string) {
    if (isSyncGame && !isSyncHost) {
      return;
    }

    if (isSyncHost) {
      hostTransportRef.current?.sendToPeer(playerId, { type: "removed" });
    }
    hostTransportRef.current?.removePeer(playerId);
    setGame((current) => removeSetupPlayer(current, playerId));
  }

  function reorderPlayer(playerId: string, overPlayerId: string) {
    if (!canControlSetup) {
      return;
    }

    setGame((current) => reorderSetupPlayers(current, playerId, overPlayerId));
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, playerId: string) {
    if (!canControlSetup) {
      return;
    }

    event.preventDefault();
    setDraggingPlayerId(playerId);
  }

  function randomizePlayers() {
    if (!canControlSetup) {
      return;
    }

    setGame(randomizeSetupPlayers);
  }

  function updateConfig(updates: Partial<GameConfig>) {
    if (!canControlSetup) {
      return;
    }

    setGame((current) => updateSetupConfig(current, updates));
  }

  function beginDraft() {
    if (!canControlSetup || !isSetupValid(game.players)) {
      return;
    }

    const draft = startDraft(game.players, game.config);
    const draftState = {
      ...game,
      phase: "draft" as const,
      caradhrasPassState: null,
      pathsOfTheDeadState: null,
      draft,
      allocation: null,
      turn: null,
      notifications: {},
      regionControl: createRegionControl(),
    };

    setGame(remainingTerritoryIds(draft.ownership).length === 0
      ? advanceAfterDraft(draftState, Date.now())
      : {
          ...draftState,
          draft: beginDraftTimer(draft, game.config, Date.now()),
        });
  }

  function sendJoinerCommand(command: JoinerSyncCommand) {
    if (!isSyncJoiner || !canSendSyncCommand) {
      return false;
    }

    joinTransportRef.current?.send(command);
    return true;
  }

  function sendTurnCommand(command: TurnCommand) {
    return sendJoinerCommand({ type: "turnCommand", command });
  }

  function pressTerritory(territoryId: string) {
    if (attackSetup) {
      pressAttackTerritory(territoryId);
      return;
    }

    if (fortifySetup) {
      pressFortifyTerritory(territoryId);
      return;
    }

    const updates = mapSelectionUpdateForPress({
      allocationPlayerId,
      game,
      mapPressMode,
      ownership,
      selections: mapSelections,
      territoryId,
      turnPlayerId,
    });

    if (updates) {
      updateMapSelections(updates);

      const territoryId = cameraTerritoryIdForSelectionUpdates(updates);
      if (autoFocusEnabled && territoryId) {
        requestTerritoryCameraIntent(territoryId);
      }
    }
  }

  function pressMapBackground() {
    if (attackSetup) {
      return;
    }

    if (fortifySetup) {
      clearFortifySourceSelection();
      return;
    }

    const updates = mapSelectionUpdateForBackgroundPress({
      mapPressMode,
      selections: mapSelections,
    });

    if (updates) {
      updateMapSelections(updates);
    }
  }

  function pressAttackTerritory(territoryId: string) {
    if (!turnPlayerId || !attackSetup) {
      return;
    }

    if (!attackSetup.sourceTerritoryId) {
      if (!canAttackFromTerritory(game, turnPlayerId, territoryId)) {
        return;
      }

      setAttackSetup({
        sourceTerritoryId: territoryId,
        targetTerritoryId: null,
        troops: createTroopCounts(),
      });
      if (autoFocusEnabled) {
        requestTerritoryCameraIntent(territoryId);
      }
      return;
    }

    if (!attackSetup.targetTerritoryId && canSelectAttackTargetTerritory(game, turnPlayerId, attackSetup.sourceTerritoryId, territoryId)) {
      setAttackSetup({
        ...attackSetup,
        targetTerritoryId: territoryId,
        troops: createTroopCounts(),
      });
      if (autoFocusEnabled) {
        requestTerritoryCameraIntent(territoryId);
      }
    }
  }

  function pressFortifyTerritory(territoryId: string) {
    if (!turnPlayerId || !fortifySetup) {
      return;
    }

    if (!fortifySetup.targetTerritoryId) {
      if (ownership[territoryId] !== turnPlayerId) {
        return;
      }

      setFortifySetup({
        movesBySource: {},
        selectedSourceTerritoryId: null,
        targetTerritoryId: territoryId,
      });
      if (autoFocusEnabled) {
        requestTerritoryCameraIntent(territoryId);
      }
      return;
    }

    if (territoryId === fortifySetup.targetTerritoryId) {
      clearFortifySourceSelection();
      return;
    }

    if (!fortifyEligibleSourceIds(game, ownership, fortifySetup.targetTerritoryId, turnPlayerId).has(territoryId)) {
      clearFortifySourceSelection();
      return;
    }

    setFortifySetup({
      ...fortifySetup,
      selectedSourceTerritoryId: fortifySetup.selectedSourceTerritoryId === territoryId ? null : territoryId,
    });
    if (autoFocusEnabled) {
      requestTerritoryCameraIntent(territoryId);
    }
  }

  function clearFortifySourceSelection() {
    if (!fortifySetup?.selectedSourceTerritoryId) {
      return;
    }

    setFortifySetup({
      ...fortifySetup,
      selectedSourceTerritoryId: null,
    });
  }

  function cancelPendingPick() {
    updateMapSelections({ pendingDraftTerritoryId: null });
  }

  function confirmPendingPick() {
    if (!pendingDraftTerritoryId) {
      return;
    }

    if (isSyncJoiner) {
      if (sendJoinerCommand({ type: "draftConfirm", territoryId: pendingDraftTerritoryId })) {
        updateMapSelections({ pendingDraftTerritoryId: null });
      }
      return;
    }

    setGame((current) => pendingDraftTerritoryId
      ? confirmTerritoryPick(current, pendingDraftTerritoryId, Date.now())
      : current);
    updateMapSelections({ pendingDraftTerritoryId: null });
  }

  function changeArmyMarker(marker: ArmyMarker) {
    if (!allocationPlayerId || syncJoinerBlocked) {
      return;
    }

    setGame((current) => updateArmyMarker(current, allocationPlayerId, marker));
  }

  function submitCurrentArmyBuild() {
    if (!allocationPlayerId || syncJoinerBlocked) {
      return;
    }

    setGame((current) => submitArmyBuild(current, allocationPlayerId));
  }

  function adjustSelectedTroop(troopType: TroopType, delta: 1 | -1) {
    if (!allocationPlayerId || !allocationSelectedTerritoryId || syncJoinerBlocked) {
      return;
    }

    setGame((current) => adjustTerritoryTroop(current, allocationPlayerId, allocationSelectedTerritoryId, troopType, delta));
  }

  function adjustAllSelectedTroops(delta: 1 | -1) {
    if (!allocationPlayerId || !allocationSelectedTerritoryId || syncJoinerBlocked) {
      return;
    }

    setGame((current) => {
      let next = current;
      for (let step = 0; step < 200; step += 1) {
        const allocation = next.allocation;
        const ownership = next.draft?.ownership;
        if (!allocation || !ownership) {
          break;
        }

        const troops = delta > 0
          ? remainingTroops(allocation, allocationPlayerId)
          : territoryTroops(allocation, allocationSelectedTerritoryId);
        const troopOrder = delta > 0 ? MOVE_FIRST_TROOP_TYPES : TROOP_TYPES;
        const troopType = troopOrder.find((candidate) => troops[candidate] > 0 && (delta < 0 || canAddTroop(allocation, ownership, allocationPlayerId, allocationSelectedTerritoryId, candidate)));
        if (!troopType) {
          break;
        }

        const updated = adjustTerritoryTroop(next, allocationPlayerId, allocationSelectedTerritoryId, troopType, delta);
        if (updated === next) {
          break;
        }

        next = updated;
      }

      return next;
    });
  }

  function finishCurrentAllocation() {
    if (!allocationPlayerId || syncJoinerBlocked) {
      return;
    }

    updateMapSelections({ allocationSelectedTerritoryId: null });
    setGame((current) => finishAllocationForPlayer(current, allocationPlayerId));
  }

  function startAllocatedGame() {
    setGame((current) => startGameMapAfterAllocation(current));
  }

  function startLocalTurn() {
    clearTurnSelections();
    setGame((current) => beginTurnAfterHandoff(current));
  }

  function startLocalAllocationTurn() {
    updateMapSelections({ allocationSelectedTerritoryId: null });
    setGame((current) => beginAllocationTurn(current));
  }

  function changeGameMapViewer(playerId: string) {
    setLocalPlayerId(playerId);
    updateMapSelections({ gameMapSelectedTerritoryId: null });
  }

  function cycleGameMapViewer() {
    if (game.mode !== "local" || game.players.length === 0) {
      return;
    }

    const currentIndex = game.players.findIndex((player) => player.id === gameMapViewerId);
    const nextPlayer = game.players[(currentIndex + 1) % game.players.length] ?? game.players[0];
    changeGameMapViewer(nextPlayer.id);
  }

  function changeAutoFocusEnabled(enabled: boolean) {
    setAutoFocusEnabled(enabled);
    saveMapPreferences({ autoFocusEnabled: enabled });
  }

  function clearTurnSelections() {
    setMapSelections(clearTurnMapSelections);
  }

  function clearNonDraftMapSelections() {
    setMapSelections(clearNonDraftMapSelectionState);
  }

  function beginTurnReinforcements() {
    if (!turnPlayerId || syncJoinerBlocked) {
      return;
    }

    setAttackSetup(null);
    setFortifySetup(null);
    updateMapSelections({ gameMapSelectedTerritoryId: null, pendingSpyTerritoryId: null });
    setGame((current) => startTurnReinforcements(current, turnPlayerId));
  }

  function changeReinforcementMarker(marker: ArmyMarker) {
    if (!turnPlayerId || syncJoinerBlocked) {
      return;
    }

    setGame((current) => updateReinforcementMarker(current, turnPlayerId, marker));
  }

  function submitCurrentReinforcementBuild() {
    if (!turnPlayerId || syncJoinerBlocked) {
      return;
    }

    setGame((current) => submitReinforcementBuild(current, turnPlayerId));
  }

  function adjustSelectedReinforcementTroop(troopType: TroopType, delta: 1 | -1) {
    if (!turnPlayerId || !turnSelectedTerritoryId || syncJoinerBlocked) {
      return;
    }

    setGame((current) => adjustReinforcementTroop(current, turnPlayerId, turnSelectedTerritoryId, troopType, delta));
  }

  function adjustAllSelectedReinforcementTroops(delta: 1 | -1) {
    if (!turnPlayerId || !turnSelectedTerritoryId || syncJoinerBlocked) {
      return;
    }

    setGame((current) => {
      let next = current;
      for (let step = 0; step < 200; step += 1) {
        const reinforcement = next.turn?.reinforcement;
        if (!reinforcement) {
          break;
        }

        const troops = delta > 0
          ? remainingReinforcementTroops(reinforcement)
          : reinforcement.territories[turnSelectedTerritoryId] ?? createTroopCounts();
        const troopType = TROOP_TYPES.find((candidate) => troops[candidate] > 0);
        if (!troopType) {
          break;
        }

        const updated = adjustReinforcementTroop(next, turnPlayerId, turnSelectedTerritoryId, troopType, delta);
        if (updated === next) {
          break;
        }

        next = updated;
      }

      return next;
    });
  }

  function finishCurrentReinforcements() {
    if (!turnPlayerId || !game.turn?.reinforcement || syncJoinerBlocked) {
      return;
    }

    const reinforcement = game.turn.reinforcement;
    setAttackSetup(null);
    setFortifySetup(null);
    updateMapSelections({ gameMapSelectedTerritoryId: null, turnSelectedTerritoryId: null });

    if (isSyncJoiner) {
      sendTurnCommand({ type: "commitReinforcements", reinforcement });
      setGame((current) => finishReinforcements(current, turnPlayerId));
      return;
    }

    setGame((current) => finishReinforcements(current, turnPlayerId));
  }

  function toggleTurnSpy() {
    if (game.turn?.stage === "spyTarget") {
      cancelTurnSpy();
      return;
    }

    if (!turnPlayerId || !canUseSpy(game, turnPlayerId) || syncJoinerBlocked) {
      return;
    }

    setAttackSetup(null);
    setFortifySetup(null);
    updateMapSelections({ gameMapSelectedTerritoryId: null, pendingSpyTerritoryId: null });
    setGame((current) => startSpySelection(current, turnPlayerId));
  }

  function confirmTurnSpy() {
    if (!turnPlayerId || !pendingSpyTerritoryId || syncJoinerBlocked) {
      return;
    }

    const territoryId = pendingSpyTerritoryId;
    updateMapSelections({ gameMapSelectedTerritoryId: null, pendingSpyTerritoryId: null });

    if (isSyncJoiner) {
      sendTurnCommand({ type: "confirmSpy", territoryId });
      return;
    }

    setGame((current) => confirmSpyAttempt(current, turnPlayerId, territoryId));
  }

  function cancelTurnSpy() {
    updateMapSelections({ gameMapSelectedTerritoryId: null, pendingSpyTerritoryId: null });
    setGame((current) => cancelSpySelection(current));
  }

  function dismissTurnSpy() {
    if (!turnPlayerId || syncJoinerBlocked) {
      return;
    }

    if (isSyncJoiner) {
      sendTurnCommand({ type: "dismissSpy" });
    }

    updateMapSelections({ gameMapSelectedTerritoryId: null });
    setGame((current) => dismissSpyIntel(current, turnPlayerId));
  }

  function beginTurnAttack() {
    if (!turnPlayerId || syncJoinerBlocked || game.turn?.stage !== "actions") {
      return;
    }

    updateMapSelections({ gameMapSelectedTerritoryId: null, pendingSpyTerritoryId: null, turnSelectedTerritoryId: null });
    setFortifySetup(null);
    setAttackSetup({
      sourceTerritoryId: null,
      targetTerritoryId: null,
      troops: createTroopCounts(),
    });
  }

  function cancelTurnAttack() {
    setAttackSetup(null);
    updateMapSelections({ gameMapSelectedTerritoryId: null });
  }

  function beginTurnFortify() {
    if (!turnPlayerId || syncJoinerBlocked || game.turn?.stage !== "actions") {
      return;
    }

    setAttackSetup(null);
    updateMapSelections({ gameMapSelectedTerritoryId: null, pendingSpyTerritoryId: null, turnSelectedTerritoryId: null });
    setFortifySetup({
      movesBySource: {},
      selectedSourceTerritoryId: null,
      targetTerritoryId: null,
    });
  }

  function cancelTurnFortify() {
    setFortifySetup(null);
    updateMapSelections({ gameMapSelectedTerritoryId: null });
  }

  function adjustFortifyTroop(troopType: TroopType, delta: 1 | -1) {
    if (!fortifySetup?.selectedSourceTerritoryId) {
      return;
    }

    const sourceTerritoryId = fortifySetup.selectedSourceTerritoryId;
    const sourceMove = fortifyMoveForSource(fortifySetup, sourceTerritoryId);
    if (delta > 0 && !canAddFortifyTroop(game, ownership, turnPlayerId, fortifySetup, troopType)) {
      return;
    }

    if (delta < 0 && sourceMove.troops[troopType] <= 0) {
      return;
    }

    const troops = {
      ...sourceMove.troops,
      [troopType]: Math.max(0, sourceMove.troops[troopType] + delta),
    };
    const nextMove = {
      ...sourceMove,
      troops,
      spyOwnerIds: troopType === "cavalry" && troops.cavalry === 0 && !fortifySourceIsImmediate(game, sourceTerritoryId, fortifySetup.targetTerritoryId)
        ? []
        : sourceMove.spyOwnerIds,
    };

    setFortifySetup(updateFortifySourceMove(fortifySetup, sourceTerritoryId, nextMove));
  }

  function adjustFortifySpy(spyOwnerId: string, delta: 1 | -1) {
    if (!fortifySetup?.selectedSourceTerritoryId) {
      return;
    }

    const sourceTerritoryId = fortifySetup.selectedSourceTerritoryId;
    const sourceMove = fortifyMoveForSource(fortifySetup, sourceTerritoryId);
    if (delta > 0 && !canAddFortifySpy(game, ownership, turnPlayerId, fortifySetup, spyOwnerId)) {
      return;
    }

    if (delta < 0 && !sourceMove.spyOwnerIds.includes(spyOwnerId)) {
      return;
    }

    const spyOwnerIds = delta > 0
      ? [...sourceMove.spyOwnerIds, spyOwnerId]
      : sourceMove.spyOwnerIds.filter((ownerId) => ownerId !== spyOwnerId);

    setFortifySetup(updateFortifySourceMove(fortifySetup, sourceTerritoryId, {
      ...sourceMove,
      spyOwnerIds,
    }));
  }

  function adjustAllFortifyUnits(delta: 1 | -1) {
    if (!turnPlayerId || !fortifySetup?.selectedSourceTerritoryId) {
      return;
    }

    const sourceTerritoryId = fortifySetup.selectedSourceTerritoryId;
    const sourceMove = fortifyMoveForSource(fortifySetup, sourceTerritoryId);
    if (delta < 0) {
      setFortifySetup(updateFortifySourceMove(fortifySetup, sourceTerritoryId, createFortifyMove()));
      return;
    }

    const sourceTroops = fortifySourceTroops(game, sourceTerritoryId, sourceMove);
    const immediate = fortifySourceIsImmediate(game, sourceTerritoryId, fortifySetup.targetTerritoryId);
    const regularSourceId = fortifyRegularSourceId(game, fortifySetup.targetTerritoryId, fortifySetup.movesBySource);
    const canUseRegularLane = immediate && (!regularSourceId || regularSourceId === sourceTerritoryId);
    const allowedTypes: TroopType[] = canUseRegularLane ? ["heavy", "cavalry", "elite", "leader"] : ["cavalry"];
    const movedTroops = movableTroopsLeavingOne(sourceTroops, allowedTypes);
    const movedSpyOwnerIds = fortifySourceSpies(game, sourceTerritoryId, sourceMove)
      .filter((spy) => immediate ? canUseRegularLane : movedTroops.cavalry > 0)
      .map((spy) => spy.ownerPlayerId);
    const nextMove = {
      spyOwnerIds: [...sourceMove.spyOwnerIds, ...movedSpyOwnerIds],
      troops: addTroops(sourceMove.troops, movedTroops),
    };

    setFortifySetup(updateFortifySourceMove(fortifySetup, sourceTerritoryId, nextMove));
  }

  function skipTurnFortify() {
    if (!turnPlayerId || syncJoinerBlocked) {
      return;
    }

    updateMapSelections({ gameMapSelectedTerritoryId: null });
    clearTurnSelections();
    setAttackSetup(null);
    setFortifySetup(null);

    if (isSyncJoiner) {
      sendTurnCommand({ type: "skipFortify" });
      return;
    }

    setGame((current) => skipFortifyAndFinishTurn(current, turnPlayerId));
  }

  function commitTurnFortify() {
    if (!turnPlayerId || !fortifySetup?.targetTerritoryId || syncJoinerBlocked || !canCommitFortify(game, turnPlayerId, fortifySetup.targetTerritoryId, fortifySetup.movesBySource)) {
      return;
    }

    const { movesBySource, targetTerritoryId } = fortifySetup;
    updateMapSelections({ gameMapSelectedTerritoryId: null });
    clearTurnSelections();
    setFortifySetup(null);

    if (isSyncJoiner) {
      sendTurnCommand({ type: "commitFortify", movesBySource, targetTerritoryId });
      setGame((current) => commitFortifyAndFinishTurn(current, turnPlayerId, targetTerritoryId, movesBySource));
      return;
    }

    setGame((current) => commitFortifyAndFinishTurn(current, turnPlayerId, targetTerritoryId, movesBySource));
  }

  function adjustAttackTroop(troopType: TroopType, delta: 1 | -1) {
    if (!attackSetup?.sourceTerritoryId || !attackSetup.targetTerritoryId) {
      return;
    }

    const sourceTroops = territoryTroops(game.allocation, attackSetup.sourceTerritoryId);
    const nextTroops = {
      ...attackSetup.troops,
      [troopType]: Math.max(0, attackSetup.troops[troopType] + delta),
    };
    const remaining = subtractTroops(sourceTroops, nextTroops);

    if (!canCommitAttackAdjustment(delta, nextTroops, remaining)) {
      return;
    }

    setAttackSetup({
      ...attackSetup,
      troops: nextTroops,
    });
  }

  function adjustAllAttackTroops(delta: 1 | -1) {
    if (!attackSetup?.sourceTerritoryId || !attackSetup.targetTerritoryId) {
      return;
    }

    if (delta < 0) {
      setAttackSetup({
        ...attackSetup,
        troops: createTroopCounts(),
      });
      return;
    }

    const sourceTroops = territoryTroops(game.allocation, attackSetup.sourceTerritoryId);
    setAttackSetup({
      ...attackSetup,
      troops: addTroops(attackSetup.troops, movableTroopsLeavingOne(subtractTroops(sourceTroops, attackSetup.troops))),
    });
  }

  function confirmTurnAttack() {
    if (!turnPlayerId || !attackSetup?.sourceTerritoryId || !attackSetup.targetTerritoryId || syncJoinerBlocked) {
      return;
    }

    const sourceTerritoryId = attackSetup.sourceTerritoryId;
    const targetTerritoryId = attackSetup.targetTerritoryId;
    const attackingTroops = attackSetup.troops;
    if (!canCommitAttack(game, turnPlayerId, sourceTerritoryId, targetTerritoryId, attackingTroops)) {
      return;
    }

    setAttackSetup(null);
    updateMapSelections({ gameMapSelectedTerritoryId: null });

    if (isSyncJoiner) {
      sendTurnCommand({ type: "commitAttack", sourceTerritoryId, targetTerritoryId, attackingTroops });
      setGame((current) => commitAttack(current, turnPlayerId, sourceTerritoryId, targetTerritoryId, attackingTroops));
      return;
    }

    setGame((current) => commitAttack(current, turnPlayerId, sourceTerritoryId, targetTerritoryId, attackingTroops));
  }

  function submitCurrentBattleChallenge() {
    if (!activeBattle || !battleViewerId || syncJoinerBlocked) {
      return;
    }

    const score = sampleBattleChallengeScore(game, battleViewerId, activeBattle.id);
    if (score === null) {
      return;
    }

    if (isSyncJoiner) {
      sendTurnCommand({ type: "submitBattleScore", battleId: activeBattle.id, score });
    }

    setGame((current) => submitBattleScore(current, battleViewerId, activeBattle.id, score));
  }

  function rollCurrentBattle() {
    if (!activeBattle || !turnPlayerId || !canControlBattle) {
      return;
    }

    if (isSyncJoiner) {
      sendTurnCommand({ type: "rollBattle", battleId: activeBattle.id });
      return;
    }

    setGame((current) => rollBattle(current, turnPlayerId, activeBattle.id));
  }

  function retreatCurrentBattle() {
    if (!activeBattle || !turnPlayerId || !canControlBattle) {
      return;
    }

    setDecisionPrompt(null);
    updateMapSelections({ gameMapSelectedTerritoryId: null });
    if (isSyncJoiner) {
      sendTurnCommand({ type: "retreatBattle", battleId: activeBattle.id });
      return;
    }

    setGame((current) => retreatBattle(current, turnPlayerId, activeBattle.id));
  }

  function dismissCurrentBattle() {
    if (!activeBattle || !turnPlayerId || !canControlBattle) {
      return;
    }

    updateMapSelections({ gameMapSelectedTerritoryId: null });
    if (isSyncJoiner) {
      sendTurnCommand({ type: "dismissBattle", battleId: activeBattle.id });
      return;
    }

    setGame((current) => dismissBattle(current, turnPlayerId, activeBattle.id));
  }

  function dismissCurrentNotification() {
    if (!currentNotificationPlayerId || !currentNotification || syncJoinerBlocked) {
      return;
    }

    if (isSyncJoiner) {
      sendTurnCommand({ type: "dismissNotification", notificationId: currentNotification.id });
    }

    setGame((current) => dismissNotification(current, currentNotificationPlayerId, currentNotification.id));
  }

  function confirmCurrentElimination() {
    const pending = game.pendingResolution;
    if (!pending || pending.type !== "elimination") {
      return;
    }

    const confirmingPlayerId = localPlayerId ?? turnPlayerId;
    if (!confirmingPlayerId) {
      return;
    }

    if (isSyncGame && !isSyncHost) {
      return;
    }

    if (isSyncHost && pending.eliminatedPlayerId !== localPlayerId) {
      hostTransportRef.current?.sendToPeer(pending.eliminatedPlayerId, { type: "removed" });
      hostTransportRef.current?.removePeer(pending.eliminatedPlayerId);
    }

    setGame((current) => confirmPendingElimination(current, confirmingPlayerId, isSyncHost ? localPlayerId : null));
  }

  function exitCurrentVictory() {
    if (isSyncHost) {
      hostTransportRef.current?.broadcast({ type: "hostEnded" });
    }

    resetAppToHome();
  }

  function restartCurrentVictory() {
    if (isSyncGame && !isSyncHost) {
      return;
    }

    clearActiveGameUiState();
    setGame(restartVictoryGameToSetup);
    if (isSyncHost) {
      setSyncQrText("");
      void createHostOffer();
    }
  }

  function transferHostToPlayer(playerId: string) {
    if (!isSyncHost || !localPlayerId || game.phase !== "paused") {
      return;
    }

    const nextGame = transferHostAuthority(game, localPlayerId, playerId);
    if (nextGame === game) {
      return;
    }

    const revision = syncRevisionRef.current + 1;
    syncRevisionRef.current = revision;
    pendingHostTransferPlayerRef.current = playerId;
    if (pendingHostTransferTimeoutRef.current !== null) {
      window.clearTimeout(pendingHostTransferTimeoutRef.current);
    }
    pendingHostTransferTimeoutRef.current = window.setTimeout(() => {
      pendingHostTransferPlayerRef.current = null;
      pendingHostTransferTimeoutRef.current = null;
      resetAppToHome();
    }, 6000);
    hostTransportRef.current?.sendToPeer(playerId, {
      type: "hostTransfer",
      revision,
      game: nextGame,
    });
    for (const player of game.players) {
      if (player.id !== localPlayerId && player.id !== playerId && player.connectionStatus === "connected") {
        hostTransportRef.current?.sendToPeer(player.id, { type: "hostEnded" });
      }
    }
  }

  function pauseCurrentGame() {
    if (isSyncGame && !isSyncHost) {
      return;
    }

    if (isSyncGame) {
      updateMapSelections({ pendingDraftTerritoryId: null });
    }
    setAttackSetup(null);
    setFortifySetup(null);
    clearNonDraftMapSelections();
    setPausedReturnPhase(game.phase === "gameMap" ? "gameMap" : null);
    setGame((current) => pauseGame(current, Date.now()));
  }

  function resumeCurrentGame() {
    const returnPhase = pausedReturnPhase;

    setPausedReturnPhase(null);
    setGame((current) => resumePausedGame(current, returnPhase, isSyncHost, Date.now()));
  }

  function returnHome() {
    if (game.phase !== "home") {
      setDecisionPrompt("exit");
      return;
    }

    endGame();
  }

  function endGame() {
    if (isSyncHost) {
      hostTransportRef.current?.broadcast({ type: "hostEnded" });
    }

    if (isSyncJoiner) {
      sendJoinerCommand({ type: "quit" });
    }

    resetAppToHome();
  }

  function restartPausedGame() {
    if (game.phase !== "paused" || (isSyncGame && !isSyncHost)) {
      return;
    }

    setDecisionPrompt(null);
    clearActiveGameUiState();
    setGame((current) => restartPausedGameToSetup(current, isSyncHost));
    if (isSyncHost) {
      setSyncQrText("");
      void createHostOffer();
    }
  }

  function clearActiveGameUiState() {
    setAttackSetup(null);
    setFortifySetup(null);
    setMapSelections(EMPTY_MAP_SELECTIONS);
    setSyncRecoveryOfferText("");
    setSyncRecoverySlots([]);
    setSyncScannerMode(null);
    setSyncMessage("");
  }

  function resetAppToHome() {
    if (pendingHostTransferTimeoutRef.current !== null) {
      window.clearTimeout(pendingHostTransferTimeoutRef.current);
    }
    pendingHostTransferPlayerRef.current = null;
    pendingHostTransferTimeoutRef.current = null;
    endSyncTransports();
    clearLocalGame();
    clearSyncHostGame();
    syncRevisionRef.current = 0;
    lastSnapshotRevisionRef.current = 0;
    lastSentAllocationRef.current = "";
    setSyncEntryOpen(false);
    setSyncRole(null);
    setSyncSession("idle");
    setLocalPlayerId(null);
    setSyncQrText("");
    setSyncAnswerText("");
    setSyncRecoveryOfferText("");
    setSyncRecoverySlots([]);
    setSyncScannerMode(null);
    setSyncMessage("");
    setDecisionPrompt(null);
    setAttackSetup(null);
    setFortifySetup(null);
    setGame(createInitialGameState());
  }

  function endSyncTransports() {
    hostTransportRef.current?.close();
    joinTransportRef.current?.close();
    hostTransportRef.current = null;
    joinTransportRef.current = null;
  }

  function broadcastSnapshot(nextGame: GameState) {
    if (!isSyncHost) {
      return;
    }

    const revision = syncRevisionRef.current + 1;
    syncRevisionRef.current = revision;
    saveSyncHostGame(nextGame, localPlayerId, revision);

    for (const player of nextGame.players) {
      if (player.id === localPlayerId || player.connectionStatus !== "connected") {
        continue;
      }

      hostTransportRef.current?.sendToPeer(player.id, {
        type: "snapshot",
        revision,
        game: syncSnapshotForViewer(nextGame, player.id),
      });
    }
  }

  function renderActiveOverlay() {
    if (!activeOverlay) {
      return null;
    }

    switch (activeOverlay.type) {
      case "armyBuild":
        if (activeOverlay.build === "allocation" && allocationPlayer) {
          return (
            <ArmyBuildModal
              allocation={game.allocation}
              onArmyMarkerChange={changeArmyMarker}
              onSubmitBuild={submitCurrentArmyBuild}
              player={allocationPlayer}
            />
          );
        }

        if (activeOverlay.build === "reinforcement" && turnActionPlayer && turnReinforcement && turnProjectedReinforcements) {
          return (
            <ArmyBuildModal
              marker={turnReinforcement.marker}
              onArmyMarkerChange={changeReinforcementMarker}
              onSubmitBuild={submitCurrentReinforcementBuild}
              player={turnActionPlayer}
              projectedTroops={turnProjectedReinforcements}
            />
          );
        }

        return null;
      case "confirm":
        if (activeOverlay.confirm === "draft" && viewerPendingTerritory) {
          return (
            <ConfirmSheet
              ariaLabel="Confirm territory"
              cancelLabel="Cancel pick"
              confirmLabel="Confirm pick"
              onCancel={cancelPendingPick}
              onConfirm={confirmPendingPick}
              title={viewerPendingTerritory.name}
            />
          );
        }

        if (activeOverlay.confirm === "spy" && spyTargetTerritory && spyCapturePercent !== null) {
          return (
            <ConfirmSheet
              ariaLabel="Confirm spy"
              cancelLabel="Cancel spy"
              confirmLabel="Send spy"
              text={`${spyCapturePercent}% captured`}
              onCancel={cancelTurnSpy}
              onConfirm={confirmTurnSpy}
              title={spyTargetTerritory.name}
            />
          );
        }

        return null;
      case "decision":
        if (activeOverlay.decision === "exit") {
          return (
            <DecisionDialog
              message="End this game and return home?"
              onCancel={() => setDecisionPrompt(null)}
              onConfirm={endGame}
            />
          );
        }

        if (activeOverlay.decision === "retreat") {
          return (
            <DecisionDialog
              confirmLabel="Retreat"
              message="Retreat from this attack?"
              onCancel={() => setDecisionPrompt(null)}
              onConfirm={retreatCurrentBattle}
            />
          );
        }

        return (
          <DecisionDialog
            confirmLabel="Restart game"
            message="Restart this game and return to setup?"
            onCancel={() => setDecisionPrompt(null)}
            onConfirm={restartPausedGame}
          />
        );
      case "battle": {
        const attacker = activeBattle ? game.players.find((player) => player.id === activeBattle.attackerPlayerId) ?? null : null;
        const defender = activeBattle ? game.players.find((player) => player.id === activeBattle.defenderPlayerId) ?? null : null;
        const sourceTerritory = activeBattle ? territoryForId(activeBattle.sourceTerritoryId) : null;
        const targetTerritory = activeBattle ? territoryForId(activeBattle.targetTerritoryId) : null;

        return activeBattle && attacker && defender && sourceTerritory && targetTerritory
          ? (
            <BattleModal
              attacker={attacker}
              attackerTerritoryName={sourceTerritory.name}
              battle={activeBattle}
              canChallenge={canChallengeBattle}
              canControl={canControlBattle}
              challengePlayerId={canChallengeBattle ? battleViewerId : null}
              defender={defender}
              defenderSpies={battleDefenderSpies}
              defenderTerritoryName={targetTerritory.name}
              onChallenge={submitCurrentBattleChallenge}
              onDismiss={dismissCurrentBattle}
              onRetreat={() => setDecisionPrompt("retreat")}
              onRoll={rollCurrentBattle}
              players={game.players}
            />
          )
          : null;
      }
      case "elimination": {
        const pending = game.pendingResolution?.type === "elimination" ? game.pendingResolution : null;
        const player = pending ? game.players.find((candidate) => candidate.id === pending.eliminatedPlayerId) : null;

        return player
          ? (
            <EliminationDialog
              canConfirm={game.mode === "local" || isSyncHost}
              message={`${player.name} has been eliminated`}
              onConfirm={confirmCurrentElimination}
            />
          )
          : null;
      }
      case "victory": {
        const pending = game.pendingResolution?.type === "victory" ? game.pendingResolution : null;
        const winner = pending ? game.players.find((candidate) => candidate.id === pending.winnerPlayerId) : null;

        return winner
          ? (
            <VictoryDialog
              message={`${winner.name} wins`}
              onExit={exitCurrentVictory}
              onRestart={restartCurrentVictory}
            />
          )
          : null;
      }
      case "handoff":
        if (activeOverlay.handoff === "allocation" && allocationPlayer) {
          return <HandoffPanel ariaLabel="Allocation handoff" buttonLabel="Begin allocation" onContinue={startLocalAllocationTurn} />;
        }

        return currentTurnPlayer
          ? <HandoffPanel ariaLabel="Turn handoff" buttonLabel="Begin turn" onContinue={startLocalTurn} />
          : null;
      case "notification":
        return currentNotification
          ? <NotificationDialog message={notificationMessage(currentNotification, game.players)} onClose={dismissCurrentNotification} />
          : null;
      case "pause":
        return (
          <PausePanel
            canRemove={pausePanelPolicy.canRemove}
            canResume={pausePanelPolicy.canResume}
            hostTransferRequired={pausePanelPolicy.hostTransferRequired}
            localPlayerId={localPlayerId}
            mode={game.mode}
            onRemovePlayer={removePlayer}
            onRestart={pausePanelPolicy.canRestart ? () => setDecisionPrompt("restart") : undefined}
            onResume={resumeCurrentGame}
            onScanRecoveryAnswer={pausePanelPolicy.canScanRecoveryAnswer ? () => setSyncScannerMode("joinAnswer") : undefined}
            onTransferHost={pausePanelPolicy.canTransferHost ? transferHostToPlayer : undefined}
            players={game.players}
            syncMessage={syncMessage}
            syncQrText={pausePanelPolicy.canScanRecoveryAnswer ? syncQrText : ""}
          />
        );
      case "scanner":
        return syncScannerMode
          ? (
            <QrScanner
              onCancel={() => setSyncScannerMode(null)}
              onScan={syncScannerMode === "hostOffer" ? scanHostOffer : acceptJoinAnswer}
              title={syncScannerMode === "hostOffer" ? "Scan host" : "Scan answer"}
            />
          )
          : null;
      case "syncBlocked":
        return <SyncSessionBlocker onHome={resetAppToHome} session={syncSession} />;
    }
  }

  function renderUpperSection() {
    if (!layout.upperSection) {
      return null;
    }

    switch (layout.upperSection.type) {
      case "troop": {
        const { troopSection } = layout.upperSection;

        if (troopSection.type === "allocation" && troopSection.source === "attack") {
          const sourceTerritory = territoryForId(attackSetup?.sourceTerritoryId);
          const targetTerritory = territoryForId(attackSetup?.targetTerritoryId);
          const sourceTroops = attackSetup?.sourceTerritoryId
            ? territoryTroops(game.allocation, attackSetup.sourceTerritoryId)
            : null;

          return turnActionPlayer && attackSetup && sourceTerritory && targetTerritory && sourceTroops ? (
            <TroopSection
              canFinish={Boolean(turnPlayerId && canCommitAttack(game, turnPlayerId, sourceTerritory.id, targetTerritory.id, attackSetup.troops))}
              committedTroops={attackSetup.troops}
              mode="attack"
              onAddAll={() => adjustAllAttackTroops(1)}
              onAdjustTroop={adjustAttackTroop}
              onFinish={confirmTurnAttack}
              onRemoveAll={() => adjustAllAttackTroops(-1)}
              player={turnActionPlayer}
              sourceTerritory={sourceTerritory}
              sourceTroops={sourceTroops}
              targetTerritory={targetTerritory}
            />
          ) : null;
        }

        if (troopSection.type === "allocation" && troopSection.source === "fortify") {
          return turnActionPlayer && fortifySetup && fortifySourceTerritory && fortifyTargetTerritory ? (
            <TroopSection
              canAddSpy={(spyOwnerId) => canAddFortifySpy(game, ownership, turnPlayerId, fortifySetup, spyOwnerId)}
              canAddType={(troopType) => canAddFortifyTroop(game, ownership, turnPlayerId, fortifySetup, troopType)}
              canFinish={Boolean(turnPlayerId && canCommitFortify(game, turnPlayerId, fortifyTargetTerritory.id, fortifySetup.movesBySource))}
              canRemoveSpy={(spyOwnerId) => fortifySourceMove.spyOwnerIds.includes(spyOwnerId)}
              canRemoveType={(troopType) => fortifySourceMove.troops[troopType] > 0}
              mode="fortify"
              onAddAll={() => adjustAllFortifyUnits(1)}
              onAdjustSpy={adjustFortifySpy}
              onAdjustTroop={adjustFortifyTroop}
              onFinish={commitTurnFortify}
              onRemoveAll={() => adjustAllFortifyUnits(-1)}
              player={turnActionPlayer}
              players={game.players}
              sourceSpies={fortifySourceSpyTokens}
              sourceTerritory={fortifySourceTerritory}
              sourceTroops={fortifySourceTroopCounts}
              targetSpies={fortifyTargetSpyTokens}
              targetTerritory={fortifyTargetTerritory}
              targetTroops={fortifyTargetTroopCounts}
            />
          ) : null;
        }

        if (troopSection.type === "allocation" && troopSection.source === "reinforcement") {
          return turnActionPlayer && turnReinforcement ? (
            <TroopSection
              allocation={game.allocation}
              canFinish={Boolean(turnPlayerId && reinforcementComplete(game, turnPlayerId))}
              capturedSpies={reinforcementCapturedSpies}
              mode="reinforcement"
              onAddAll={() => adjustAllSelectedReinforcementTroops(1)}
              onAdjustTroop={adjustSelectedReinforcementTroop}
              onFinish={finishCurrentReinforcements}
              onRemoveAll={() => adjustAllSelectedReinforcementTroops(-1)}
              player={turnActionPlayer}
              players={game.players}
              reinforcement={turnReinforcement}
              selectedTerritory={turnSelectedTerritory}
            />
          ) : null;
        }

        if (troopSection.type === "allocation") {
          return allocationPlayer ? (
            <TroopSection
              allocation={game.allocation}
              canFinish={Boolean(game.allocation && allocationComplete(game.allocation, ownership, allocationPlayer.id))}
              mode="initialAllocation"
              onAddAll={() => adjustAllSelectedTroops(1)}
              onAdjustTroop={adjustSelectedTroop}
              onFinish={finishCurrentAllocation}
              onRemoveAll={() => adjustAllSelectedTroops(-1)}
              ownership={ownership}
              player={allocationPlayer}
              selectedTerritoryId={allocationSelectedTerritoryId}
            />
          ) : null;
        }

        if (troopSection.source === "turn") {
          return (
            <TroopSection
              capturedSpies={turnMapInspection.capturedSpies}
              mode="info"
              players={game.players}
              selectedTerritory={turnMapInspection.selectedTerritory}
              troopBreakdown={turnMapInspection.troopBreakdown}
              troopPlayerId={turnMapInspection.troopPlayerId}
              viewerId={turnViewerId}
            />
          );
        }

        return (
          <TroopSection
            capturedSpies={gameMapInspection.capturedSpies}
            mode="info"
            players={game.players}
            selectedTerritory={gameMapInspection.selectedTerritory}
            troopBreakdown={gameMapInspection.troopBreakdown}
            troopPlayerId={gameMapInspection.troopPlayerId}
            viewerId={gameMapViewerId}
          />
        );
      }
      case "allocationWaiting":
        return allocationPlayer ? (
          <AllocationWaitingPanel
            players={game.players}
            allocation={game.allocation}
            canAdvance={canAdvanceAllocationWaiting(game, isSyncHost)}
            onAdvance={startAllocatedGame}
          />
        ) : null;
    }
  }

  function renderActionSection() {
    if (layout.actionSection !== "turn" || !turnActionPlayer) {
      return null;
    }

    const instruction = attackSetup
      ? attackSetup.sourceTerritoryId
        ? attackSetup.targetTerritoryId
          ? "Choose attacking troops"
          : "Select a territory to attack"
        : "Select a territory to attack from"
      : fortifySetup
        ? fortifySetup.targetTerritoryId
          ? "Select territories to fortify from"
          : "Select a territory to fortify"
      : turnActionInstructionForGame(game, turnSelectedTerritoryId);

    return (
      <TurnActionPanel
        attackSetupActive={Boolean(attackSetup)}
        canSpy={Boolean(turnPlayerId && (canUseSpy(game, turnPlayerId) || game.turn?.stage === "spyTarget"))}
        fortifySetupActive={Boolean(fortifySetup)}
        instruction={instruction}
        onAttack={beginTurnAttack}
        onCancelAttack={cancelTurnAttack}
        onCancelFortify={cancelTurnFortify}
        onDismissSpy={dismissTurnSpy}
        onFortify={beginTurnFortify}
        onReinforce={beginTurnReinforcements}
        onSkipFortify={skipTurnFortify}
        onSpy={toggleTurnSpy}
        player={turnActionPlayer}
        stage={game.turn?.stage ?? "reinforcementReady"}
        spyMissing={Boolean(turnPlayerId && game.turn?.spies[turnPlayerId]?.status !== "available")}
        spyReturnStage={game.turn?.spyReturnStage ?? null}
      />
    );
  }

  const upperSectionElement = renderUpperSection();
  const actionSectionElement = renderActionSection();
  const activeOverlayElement = renderActiveOverlay();

  return (
    <main
      className={`app-shell${layout.showGameStageLayout ? " game-layout" : ""}`}
      data-app-phase={game.phase}
      data-sync-role={syncRole ?? "none"}
    >
      {layout.showPlayerBar ? (
        <PlayerBar
          detail={playerBarProgress ? `${playerBarProgress.drafted} / ${playerBarProgress.total}` : null}
          onExit={returnHome}
          onPause={playerBarControls.canPause && !canChallengeBattle ? pauseCurrentGame : undefined}
          onTitlePress={playerBarControls.canCycleViewer ? cycleGameMapViewer : undefined}
          pauseLabel={playerBarControls.pauseLabel}
          player={playerBarPlayer}
          rootRef={playerBarRef}
          timerRemaining={timerRemaining}
          title={playerBarPlayer?.name ?? "Game"}
        />
      ) : null}

      {upperSectionElement ? (
        <div className="game-upper-slot" ref={upperSectionRef}>
          {upperSectionElement}
        </div>
      ) : null}

      <MapView
        autoFocusEnabled={autoFocusEnabled}
        cameraIntent={cameraIntent}
        frozen={layout.freezeMapGestures}
        mapData={generatedMapData}
        onTerritoryPress={!layout.freezeMapGestures && mapPressMode ? pressTerritory : undefined}
        onMapPress={!layout.freezeMapGestures && mapPressMode ? pressMapBackground : undefined}
        onAutoFocusChange={changeAutoFocusEnabled}
        showCameraControls={layout.canUseMapCameraControls}
        territoryStates={territoryStates}
        troopMarkers={troopMarkers}
        weatherMarkers={weatherMarkers}
        visibleInsets={visibleInsets}
      />

      {actionSectionElement ? (
        <div className="game-action-slot" ref={actionSectionRef}>
          {actionSectionElement}
        </div>
      ) : null}

      {game.phase === "home" && !syncEntryOpen ? (
        <HomePanel onStartLocal={startLocalSetup} onStartSync={openSyncEntry} />
      ) : null}

      {game.phase === "home" && syncEntryOpen ? (
        <SyncEntryPanel
          color={syncColor}
          message={syncMessage}
          name={syncName}
          onBack={returnHome}
          onColorChange={updateSyncColor}
          onChooseRecoveryPlayer={chooseRecoveryPlayer}
          onHost={beginSyncHost}
          onNameChange={updateSyncName}
          onScan={() => setSyncScannerMode("hostOffer")}
          recoverySlots={syncRecoverySlots}
        />
      ) : null}

      {game.phase === "setup" ? (
        <SetupPanel
          canControl={canControlSetup}
          canStart={canControlSetup && isSetupValid(game.players)}
          config={game.config}
          draftName={draftName}
          localPlayerId={localPlayerId}
          mode={game.mode}
          onAddPlayer={addPlayer}
          onBack={returnHome}
          onDraftNameChange={setDraftName}
          onBeginDrag={beginDrag}
          onRandomizePlayers={randomizePlayers}
          onRemovePlayer={removePlayer}
          onStartDraft={beginDraft}
          onUnlockPlayerField={unlockPlayerField}
          onUpdateConfig={updateConfig}
          onUpdatePlayer={updatePlayer}
          players={game.players}
          draggingPlayerId={draggingPlayerId}
          syncAnswerText={syncAnswerText}
          syncMessage={syncMessage}
          syncQrText={syncQrText}
          syncRole={syncRole}
          onScanAnswer={() => setSyncScannerMode("joinAnswer")}
        />
      ) : null}

      {activeOverlayElement}
    </main>
  );
}

export default App;
