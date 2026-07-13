import { type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  GripVertical,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ScanLine,
  Shuffle,
  Trash2,
  Unlock,
  Users,
  Wifi,
  X,
} from "lucide-react";
import {
  ALLOCATION_STYLES,
  PICK_TIME_LIMITS,
  LOCAL_GAME_KEY,
  MIXTURE_TROOP_TYPES,
  PLAYER_COLORS,
  TROOP_ALLOCATION_TIME_LIMITS,
  TROOP_TYPES,
  applySyncDraftConfirm,
  adjustReinforcementTroop,
  adjustTerritoryTroop,
  activePlayer,
  addTroops,
  allocationComplete,
  applySyncAllocationUpdate,
  applySyncPlayerConnectionStatus,
  applySyncPlayerQuit,
  applySyncProfileUpdate,
  applySyncTurnCommand,
  armyCountsForMarker,
  beginAllocationTurn,
  beginAllocationTimer,
  beginDraftTimer,
  beginTurnAfterHandoff,
  canAddReinforcementTroop,
  canAddTroop,
  canPickTerritory,
  canUseSpy,
  cancelSpySelection,
  capturedSpiesOnTerritory,
  clearLocalGame,
  clearSyncHostGame,
  completeTimedOutSyncAllocations,
  confirmSpyAttempt,
  confirmTerritoryPick,
  createInitialGameState,
  createOwnershipMap,
  createPlayer,
  createTerritoryStates,
  dismissNotification,
  dismissSpyIntel,
  emptyOwnedTerritoryCount,
  finishReinforcements,
  finishTurnWithFortify,
  finishAllocationForPlayer,
  formatTimerOption,
  formatTroopTimerOption,
  isSetupValid,
  pauseDraftTimer,
  pauseAllocationTimer,
  pauseLocalGameForStorage,
  randomCompleteAllocationForPlayer,
  randomPickForActivePlayer,
  pauseSyncGame,
  projectReinforcementTroops,
  readLocalGame,
  readSyncHostGame,
  reinforcementComplete,
  remainingReinforcementTroops,
  remainingTerritoryIds,
  remainingTroops,
  removeNonConnectedSyncLobbyPlayers,
  removePlayerFromDraft,
  saveLocalGame,
  saveSyncHostGame,
  spyCaptureProbability,
  advanceAfterDraft,
  startDraft,
  startGameMapAfterAllocation,
  startReinforcements,
  startSpySelection,
  submitArmyBuild,
  submitReinforcementBuild,
  territoryTroops,
  updateArmyMarker,
  updateReinforcementMarker,
  turnPlayer,
} from "./game/gameState";
import type {
  AllocationStyle,
  AppPhase,
  ArmyMarker,
  DraftStyle,
  GameConfig,
  GameNotification,
  GamePlayer,
  GameState,
  PickTimeLimit,
  PlayerColor,
  ReinforcementState,
  TerritoryOwnerMap,
  TroopCounts,
  TroopAllocationTimeLimit,
  TroopType,
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
import { colorCss, colorLabel, isLightColor } from "./game/playerColors";
import {
  createTroopMarkers,
  firstActiveOverlay,
  gameStageLayoutForState,
  mapPressModeForGame,
  notificationPlayerId,
  playerBarDraftProgress,
  playerBarPlayerForGame,
  playerBarTimerRemaining,
  selectedTerritoryForMap,
  syncSnapshotForViewer,
  territoryInspectionForViewer,
  visibleNotification,
  type ActiveOverlay,
  type CapturedSpyView,
  type MapPressMode,
  type SyncRole,
} from "./game/gameView";
import { spyIconSrc, troopIconSrc, troopName, TroopIconCount, TroopIconImage } from "./game/troopIcons";
import { generatedMapData } from "./map/generated/mapData";
import { MapView } from "./map/components/MapView";
import { readMapPreferences, saveMapPreferences } from "./map/mapPreferences";
import type { GeneratedTerritoryData } from "./map/mapTypes";
import { isArdatureSyncMessage, type ArdatureSyncMessage } from "./sync/syncMessages";
import { QrPanel, QrScanner } from "./sync/QrCodeUi";
import { ConfirmSheet, DecisionDialog, HandoffPanel, ModalActions, ModalIconButton, NotificationDialog } from "./ui/Overlays";
import {
  SyncHostTransport,
  SyncJoinTransport,
  parseSyncRecoveryAnswer,
  parseSyncRecoveryOffer,
  type SyncConnectionStatus,
  type SyncRecoveryPlayerSlot,
  type SyncWireMessage,
} from "./sync/syncTransport";

type SyncSessionState = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected" | "hostEnded";

type SyncCameraMode = "hostOffer" | "joinAnswer" | null;

type JoinerSyncCommand = Extract<ArdatureSyncMessage, { type: "profileUpdate" | "draftConfirm" | "allocationUpdate" | "turnCommand" | "quit" }>;

const DRAFT_STYLE_LABELS: Record<DraftStyle, string> = {
  random: "Random",
  roundRobin: "Round Robin",
  snake: "Snake",
};
const ALLOCATION_STYLE_LABELS: Record<AllocationStyle, string> = {
  manual: "Manual",
  random: "Random",
};

const EMPTY_TROOPS: TroopCounts = {
  heavy: 0,
  cavalry: 0,
  elite: 0,
  leader: 0,
};

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
  const [syncSession, setSyncSession] = useState<SyncSessionState>(() => restoredSyncHost ? "connected" : "idle");
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(() => restoredSyncHost?.localPlayerId ?? null);
  const [syncQrText, setSyncQrText] = useState("");
  const [syncAnswerText, setSyncAnswerText] = useState("");
  const [syncRecoveryOfferText, setSyncRecoveryOfferText] = useState("");
  const [syncRecoverySlots, setSyncRecoverySlots] = useState<SyncRecoveryPlayerSlot[]>([]);
  const [syncCameraMode, setSyncCameraMode] = useState<SyncCameraMode>(null);
  const [syncMessage, setSyncMessage] = useState("");
  const [isAcceptingAnswer, setIsAcceptingAnswer] = useState(false);
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null);
  const [isEndGamePromptOpen, setIsEndGamePromptOpen] = useState(false);
  const [isRestartGamePromptOpen, setIsRestartGamePromptOpen] = useState(false);
  const [pausedReturnPhase, setPausedReturnPhase] = useState<AppPhase | null>(null);
  const [resetCameraKey, setResetCameraKey] = useState(0);
  const [autoFocusEnabled, setAutoFocusEnabled] = useState(() => readMapPreferences().autoFocusEnabled);
  const [pendingDraftTerritoryId, setPendingDraftTerritoryId] = useState<string | null>(null);
  const [allocationSelectedTerritoryId, setAllocationSelectedTerritoryId] = useState<string | null>(null);
  const [gameMapSelectedTerritoryId, setGameMapSelectedTerritoryId] = useState<string | null>(null);
  const [turnSelectedTerritoryId, setTurnSelectedTerritoryId] = useState<string | null>(null);
  const [pendingSpyTerritoryId, setPendingSpyTerritoryId] = useState<string | null>(null);
  const hostTransportRef = useRef<SyncHostTransport | null>(null);
  const joinTransportRef = useRef<SyncJoinTransport | null>(null);
  const previousPhaseRef = useRef(game.phase);
  const latestGameRef = useRef(game);
  const latestSyncRoleRef = useRef(syncRole);
  const latestLocalPlayerIdRef = useRef(localPlayerId);
  const lastSentAllocationRef = useRef("");
  const syncRevisionRef = useRef(restoredSyncHost?.revision ?? 0);
  const lastSnapshotRevisionRef = useRef(0);
  const active = activePlayer(game);
  const currentTurnPlayer = turnPlayer(game);
  const ownership = game.draft?.ownership ?? createOwnershipMap();
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
  const canControlActivePlayer = game.mode === "local" || (isSyncGame && canSendSyncCommand && active?.id === localPlayerId);
  const canControlTurnPlayer = game.mode === "local" || (isSyncGame && canSendSyncCommand && game.turn?.currentPlayerId === localPlayerId);
  const turnPlayerId = game.turn?.currentPlayerId ?? null;
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
  const territoryStates = useMemo(
    () => createTerritoryStates(game.players, ownership, viewerSelectedTerritoryId),
    [game.players, ownership, viewerSelectedTerritoryId],
  );
  const troopMarkers = useMemo(
    () => createTroopMarkers(game, allocationPlayerId, gameMapViewerId, turnViewerId),
    [allocationPlayerId, game, gameMapViewerId, turnViewerId],
  );
  const disconnectedSyncPlayers = game.mode === "sync"
    ? game.players
        .flatMap((player) => player.id !== localPlayerId && player.connectionStatus === "disconnected" && player.color
          ? [{ color: player.color, id: player.id, name: player.name }]
          : [])
    : [];
  const gameMapSelectedTerritory = gameMapSelectedTerritoryId
    ? generatedMapData.territories.find((territory) => territory.id === gameMapSelectedTerritoryId) ?? null
    : null;
  const gameMapViewer = game.players.find((player) => player.id === turnViewerId) ?? game.players[0] ?? null;
  const turnActionPlayer = currentTurnPlayer;
  const turnReinforcement = game.turn?.reinforcement ?? null;
  const turnProjectedReinforcements = turnPlayerId ? projectReinforcementTroops(game, turnPlayerId) : null;
  const turnBuildSubmitted = Boolean(turnReinforcement?.buildSubmitted);
  const turnSelectedTerritory = turnSelectedTerritoryId
    ? generatedMapData.territories.find((territory) => territory.id === turnSelectedTerritoryId) ?? null
    : null;
  const spyIntelTerritory = canControlTurnPlayer && game.turn?.spyIntel?.targetTerritoryId
    ? generatedMapData.territories.find((territory) => territory.id === game.turn?.spyIntel?.targetTerritoryId) ?? null
    : null;
  const spyTargetTerritory = pendingSpyTerritoryId
    ? generatedMapData.territories.find((territory) => territory.id === pendingSpyTerritoryId) ?? null
    : null;
  const spyCapturePercent = pendingSpyTerritoryId && turnPlayerId ? spyCaptureProbability(game, turnPlayerId, pendingSpyTerritoryId) : null;
  const currentNotificationPlayerId = notificationPlayerId(game, syncRole, localPlayerId, turnViewerId);
  const currentNotification = visibleNotification(game, currentNotificationPlayerId, syncJoinerBlocked);
  const gameMapInspection = territoryInspectionForViewer({
    game,
    ownership,
    selectedTerritory: gameMapSelectedTerritory,
    selectedTerritoryId: gameMapSelectedTerritoryId,
    viewerId: turnViewerId,
  });
  const turnMapInspection = territoryInspectionForViewer({
    game,
    ownership,
    revealedTerritory: spyIntelTerritory,
    selectedTerritory: gameMapSelectedTerritory,
    selectedTerritoryId: gameMapSelectedTerritoryId,
    viewerId: turnViewerId,
  });
  const reinforcementCapturedSpies = turnSelectedTerritory ? capturedSpiesOnTerritory(game, turnSelectedTerritory.id) : [];
  const viewerPendingTerritory = pendingDraftTerritoryId
    ? generatedMapData.territories.find((territory) => territory.id === pendingDraftTerritoryId) ?? null
    : null;
  const timerRemaining = playerBarTimerRemaining(game, now);
  const canControlSetup = game.mode === "local" || isSyncHost;
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
  const canShowConfirm = Boolean(viewerPendingTerritory && active && canControlActivePlayer);
  const canShowAllocationSection = game.phase === "allocation" && !localAllocationReady;
  const needsAllocationArmyBuild = Boolean(canShowAllocationSection && allocationPlayer && !allocationBuildSubmitted);
  const needsReinforcementArmyBuild = game.phase === "turn" && canControlTurnPlayer && turnActionPlayer && game.turn?.stage === "reinforcementBuild";
  const activeOverlay = firstActiveOverlay(
    syncJoinerBlocked ? { type: "syncBlocked" } : null,
    syncCameraMode ? { type: "scanner" } : null,
    isEndGamePromptOpen ? { type: "decision", decision: "exit" } : null,
    isRestartGamePromptOpen ? { type: "decision", decision: "restart" } : null,
    game.phase === "paused" ? { type: "pause" } : null,
    game.phase === "allocationHandoff" ? { type: "handoff", handoff: "allocation" } : null,
    game.phase === "turnHandoff" ? { type: "handoff", handoff: "turn" } : null,
    needsAllocationArmyBuild ? { type: "armyBuild", build: "allocation" } : null,
    needsReinforcementArmyBuild ? { type: "armyBuild", build: "reinforcement" } : null,
    currentNotification ? { type: "notification" } : null,
    spyTargetTerritory && spyCapturePercent !== null ? { type: "confirm", confirm: "spy" } : null,
    canShowConfirm ? { type: "confirm", confirm: "draft" } : null,
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
  const layout = gameStageLayoutForState({
    activeOverlay,
    canControlTurnPlayer,
    canShowAllocationSection,
    game,
    gameMapInspection,
    localAllocationReady,
    playerBarPlayer,
    turnActionPlayer,
    turnMapInspection,
  });

  useEffect(() => {
    latestGameRef.current = game;
  }, [game]);

  useEffect(() => {
    latestSyncRoleRef.current = syncRole;
  }, [syncRole]);

  useEffect(() => {
    latestLocalPlayerIdRef.current = localPlayerId;
  }, [localPlayerId]);

  useEffect(() => {
    const isPausedLocalDraft = game.mode === "local" && game.phase === "paused" && Boolean(game.draft) && !game.allocation;
    if (game.phase !== "draft" && !isPausedLocalDraft) {
      setPendingDraftTerritoryId(null);
    }
  }, [game.allocation, game.draft, game.mode, game.phase]);

  useEffect(() => {
    if (game.phase !== "allocation") {
      setAllocationSelectedTerritoryId(null);
    }
  }, [game.phase]);

  useEffect(() => {
    if (game.phase !== "gameMap") {
      setGameMapSelectedTerritoryId(null);
    }
  }, [game.phase]);

  useEffect(() => {
    if (game.phase !== "turn") {
      setTurnSelectedTerritoryId(null);
      setPendingSpyTerritoryId(null);
    }
  }, [game.phase]);

  useEffect(() => {
    if (!pendingDraftTerritoryId) {
      return;
    }

    if (!canControlActivePlayer || !canPickTerritory(game, pendingDraftTerritoryId)) {
      setPendingDraftTerritoryId(null);
    }
  }, [canControlActivePlayer, game, pendingDraftTerritoryId]);

  useEffect(() => {
    if (!allocationSelectedTerritoryId) {
      return;
    }

    if (!allocationPlayerId || ownership[allocationSelectedTerritoryId] !== allocationPlayerId) {
      setAllocationSelectedTerritoryId(null);
    }
  }, [allocationPlayerId, allocationSelectedTerritoryId, ownership]);

  useEffect(() => {
    if (!gameMapSelectedTerritoryId) {
      return;
    }

    if (!ownership || !(gameMapSelectedTerritoryId in ownership)) {
      setGameMapSelectedTerritoryId(null);
    }
  }, [gameMapSelectedTerritoryId, ownership]);

  useEffect(() => {
    if (!turnSelectedTerritoryId || !turnPlayerId || ownership[turnSelectedTerritoryId] === turnPlayerId) {
      return;
    }

    setTurnSelectedTerritoryId(null);
  }, [ownership, turnPlayerId, turnSelectedTerritoryId]);

  useEffect(() => {
    if (!pendingSpyTerritoryId || !turnPlayerId || (ownership[pendingSpyTerritoryId] && ownership[pendingSpyTerritoryId] !== turnPlayerId)) {
      return;
    }

    setPendingSpyTerritoryId(null);
  }, [ownership, pendingSpyTerritoryId, turnPlayerId]);

  useEffect(() => {
    if (game.mode === "local") {
      saveLocalGame(game);
    }
  }, [game]);

  useEffect(() => {
    function savePausedLocalGame() {
      const current = latestGameRef.current;

      if (current.mode === "local" && current.phase !== "home" && current.phase !== "setup" && localStorage.getItem(LOCAL_GAME_KEY)) {
        saveLocalGame(pauseLocalGameForStorage(current, Date.now()));
      }
    }

    window.addEventListener("pagehide", savePausedLocalGame);
    window.addEventListener("beforeunload", savePausedLocalGame);

    return () => {
      window.removeEventListener("pagehide", savePausedLocalGame);
      window.removeEventListener("beforeunload", savePausedLocalGame);
    };
  }, []);

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
      setResetCameraKey((current) => current + 1);
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
      if (current.phase !== "draft" || !current.draft?.timerEndsAt || current.draft.timerEndsAt > Date.now()) {
        return current;
      }

      return pendingDraftTerritoryId && canPickTerritory(current, pendingDraftTerritoryId)
        ? confirmTerritoryPick(current, pendingDraftTerritoryId, Date.now())
        : randomPickForActivePlayer(current, Date.now());
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
    setPendingDraftTerritoryId(null);
  }, [canControlActivePlayer, canSendSyncCommand, game.draft?.timerEndsAt, game.phase, isSyncJoiner, now, pendingDraftTerritoryId]);

  useEffect(() => {
    if (isSyncGame && !isSyncHost) {
      return;
    }

    if (game.phase !== "allocation" || !game.allocation?.timerEndsAt || game.allocation.timerEndsAt > now) {
      return;
    }

    setGame((current) => {
      if (current.phase !== "allocation" || !current.allocation?.timerEndsAt || current.allocation.timerEndsAt > Date.now()) {
        return current;
      }

      if (current.mode === "sync") {
        return completeTimedOutSyncAllocations(current);
      }

      return allocationPlayerId
        ? finishAllocationForPlayer(randomCompleteAllocationForPlayer(current, allocationPlayerId), allocationPlayerId)
        : current;
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

    setSyncCameraMode(null);
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
      setSyncCameraMode(null);
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
    const joinTransport = new SyncJoinTransport({
      onClosed: resetAppToHome,
      onMessage: handleJoinerMessage,
      onOpen: () => {
        setSyncSession("connected");
        setSyncMessage("Connected");
        joinTransportRef.current?.send({
          type: "profileUpdate",
          name: localPlayer.name,
          color: localPlayer.color,
        });
      },
      onStatus: handleJoinerConnectionStatus,
    });

    setSyncCameraMode(null);
    setSyncSession("connecting");
    setSyncMessage("QR found. Creating answer");
    try {
      const answer = await joinTransport.createAnswer(value, localPlayer);

      endSyncTransports();
      joinTransportRef.current = joinTransport;
      clearLocalGame();
      setSyncRole("joiner");
      setSyncSession("connecting");
      setLocalPlayerId(localPlayer.id);
      lastSnapshotRevisionRef.current = 0;
      lastSentAllocationRef.current = "";
      setSyncAnswerText(answer.answerText);
      setSyncRecoveryOfferText("");
      setSyncRecoverySlots([]);
      setSyncQrText("");
      setSyncEntryOpen(false);
      setGame({
        ...createInitialGameState(),
        phase: "setup",
        mode: "sync",
        players: [
          {
            id: answer.hostPlayerId,
            name: answer.hostName,
            color: answer.hostColor,
            nameLocked: true,
            colorLocked: true,
            connectionStatus: "connected",
          },
          localPlayer,
        ],
      });
      setSyncMessage("Show this answer to the host");
    } catch (error) {
      joinTransport.close();
      setSyncMessage(formatQrHandshakeError(error));
    }
  }

  async function chooseRecoveryPlayer(slot: SyncRecoveryPlayerSlot) {
    const joinTransport = new SyncJoinTransport({
      onClosed: resetAppToHome,
      onMessage: handleJoinerMessage,
      onOpen: () => {
        setSyncSession("connected");
        setSyncMessage("Connected");
      },
      onStatus: handleJoinerConnectionStatus,
    });

    setSyncSession("connecting");
    setSyncMessage("Creating recovery answer");
    try {
      const answer = await joinTransport.createRecoveryAnswer(syncRecoveryOfferText, slot);

      endSyncTransports();
      joinTransportRef.current = joinTransport;
      clearLocalGame();
      setSyncRole("joiner");
      setSyncSession("connecting");
      setLocalPlayerId(slot.id);
      lastSnapshotRevisionRef.current = 0;
      lastSentAllocationRef.current = "";
      setSyncAnswerText(answer.answerText);
      setSyncQrText("");
      setSyncRecoveryOfferText("");
      setSyncRecoverySlots([]);
      setSyncEntryOpen(false);
      setGame({
        ...createInitialGameState(),
        phase: "setup",
        mode: "sync",
        players: [
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
        ],
      });
      setSyncMessage("Show this answer to the host");
    } catch (error) {
      joinTransport.close();
      setSyncMessage(formatQrHandshakeError(error));
    }
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

    if (rawMessage.type === "quit") {
      hostTransportRef.current?.removePeer(playerId);
      setGame((current) => applySyncPlayerQuit(current, playerId));
    }
  }, []);

  const handleJoinerMessage = useCallback((_playerId: string, rawMessage: SyncWireMessage) => {
    if (!isArdatureSyncMessage(rawMessage)) {
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

    setGame((current) => ({
      ...current,
      players: [
        ...current.players,
        {
          ...createPlayer(draftName),
          color: firstAvailableColor(current.players),
        },
      ],
    }));
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

      setGame((current) => ({
        ...current,
        players: current.players.map((candidate) => candidate.id === playerId ? { ...candidate, ...allowed } : candidate),
      }));
      sendJoinerCommand({
        type: "profileUpdate",
        name: allowed.name,
        color: allowed.color,
      });
      return;
    }

    setGame((current) => ({
      ...current,
      players: current.players.map((player) => {
        if (player.id !== playerId) {
          return player;
        }

        const hostLockedUpdates = current.mode === "sync" && isSyncHost && player.id !== localPlayerId
          ? {
              nameLocked: updates.name !== undefined ? true : player.nameLocked,
              colorLocked: updates.color !== undefined ? true : player.colorLocked,
            }
          : {};

        return { ...player, ...updates, ...hostLockedUpdates };
      }),
    }));
  }

  function unlockPlayerField(playerId: string, field: "name" | "color") {
    if (!isSyncHost) {
      return;
    }

    setGame((current) => ({
      ...current,
      players: current.players.map((player) => player.id === playerId
        ? {
            ...player,
            nameLocked: field === "name" ? false : player.nameLocked,
            colorLocked: field === "color" ? false : player.colorLocked,
          }
        : player),
    }));
  }

  function removePlayer(playerId: string) {
    if (isSyncGame && !isSyncHost) {
      return;
    }

    if (isSyncHost) {
      hostTransportRef.current?.sendToPeer(playerId, { type: "removed" });
    }
    hostTransportRef.current?.removePeer(playerId);
    setGame((current) => current.phase === "paused"
      ? removePlayerFromDraft(current, playerId)
      : {
          ...current,
          players: current.players.filter((player) => player.id !== playerId),
        });
  }

  function reorderPlayer(playerId: string, overPlayerId: string) {
    if (!canControlSetup) {
      return;
    }

    setGame((current) => {
      const fromIndex = current.players.findIndex((player) => player.id === playerId);
      const toIndex = current.players.findIndex((player) => player.id === overPlayerId);

      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
        return current;
      }

      return { ...current, players: moveItem(current.players, fromIndex, toIndex) };
    });
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

    setGame((current) => {
      const players = [...current.players];
      for (let index = players.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [players[index], players[swapIndex]] = [players[swapIndex], players[index]];
      }

      return { ...current, players };
    });
  }

  function updateConfig(updates: Partial<GameConfig>) {
    if (!canControlSetup) {
      return;
    }

    setGame((current) => {
      const config = { ...current.config, ...updates };

      return {
        ...current,
        config: {
          ...config,
          pickTimeLimit: config.draftStyle === "random" ? 0 : config.pickTimeLimit,
          troopAllocationTimeLimit: config.allocationStyle === "random" ? 0 : config.troopAllocationTimeLimit,
        },
      };
    });
  }

  function beginDraft() {
    if (!canControlSetup || !isSetupValid(game.players)) {
      return;
    }

    const draft = startDraft(game.players, game.config);
    const draftState = {
      ...game,
      phase: "draft" as const,
      draft,
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
    switch (mapPressMode) {
      case "allocation":
        if (allocationPlayerId && ownership[territoryId] === allocationPlayerId) {
          setAllocationSelectedTerritoryId(territoryId);
        }
        break;
      case "draft":
        if (canPickTerritory(game, territoryId)) {
          setPendingDraftTerritoryId(territoryId);
        }
        break;
      case "inspect":
        setGameMapSelectedTerritoryId(territoryId);
        break;
      case "reinforcement":
        if (turnPlayerId && ownership[territoryId] === turnPlayerId) {
          setTurnSelectedTerritoryId(territoryId);
        }
        break;
      case "spy":
        if (turnPlayerId && ownership[territoryId] && ownership[territoryId] !== turnPlayerId) {
          setPendingSpyTerritoryId(territoryId);
        }
        break;
      default:
        break;
    }
  }

  function cancelPendingPick() {
    setPendingDraftTerritoryId(null);
  }

  function confirmPendingPick() {
    if (!pendingDraftTerritoryId) {
      return;
    }

    if (isSyncJoiner) {
      if (sendJoinerCommand({ type: "draftConfirm", territoryId: pendingDraftTerritoryId })) {
        setPendingDraftTerritoryId(null);
      }
      return;
    }

    setGame((current) => pendingDraftTerritoryId
      ? confirmTerritoryPick(current, pendingDraftTerritoryId, Date.now())
      : current);
    setPendingDraftTerritoryId(null);
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

  function finishCurrentAllocation() {
    if (!allocationPlayerId || syncJoinerBlocked) {
      return;
    }

    setAllocationSelectedTerritoryId(null);
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
    setAllocationSelectedTerritoryId(null);
    setGame((current) => beginAllocationTurn(current));
  }

  function changeGameMapViewer(playerId: string) {
    setLocalPlayerId(playerId);
    setGameMapSelectedTerritoryId(null);
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
    setTurnSelectedTerritoryId(null);
    setPendingSpyTerritoryId(null);
  }

  function clearNonDraftMapSelections() {
    setAllocationSelectedTerritoryId(null);
    setGameMapSelectedTerritoryId(null);
    clearTurnSelections();
  }

  function beginTurnReinforcements() {
    if (!turnPlayerId || syncJoinerBlocked) {
      return;
    }

    setPendingSpyTerritoryId(null);
    setGame((current) => startReinforcements(cancelSpySelection(current), turnPlayerId));
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

  function finishCurrentReinforcements() {
    if (!turnPlayerId || !game.turn?.reinforcement || syncJoinerBlocked) {
      return;
    }

    const reinforcement = game.turn.reinforcement;
    setTurnSelectedTerritoryId(null);

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

    setPendingSpyTerritoryId(null);
    setGame((current) => startSpySelection(current, turnPlayerId));
  }

  function confirmTurnSpy() {
    if (!turnPlayerId || !pendingSpyTerritoryId || syncJoinerBlocked) {
      return;
    }

    const territoryId = pendingSpyTerritoryId;
    setPendingSpyTerritoryId(null);

    if (isSyncJoiner) {
      sendTurnCommand({ type: "confirmSpy", territoryId });
      return;
    }

    setGame((current) => confirmSpyAttempt(current, turnPlayerId, territoryId));
  }

  function cancelTurnSpy() {
    setPendingSpyTerritoryId(null);
    setGame((current) => cancelSpySelection(current));
  }

  function dismissTurnSpy() {
    if (!turnPlayerId || syncJoinerBlocked) {
      return;
    }

    if (isSyncJoiner) {
      sendTurnCommand({ type: "dismissSpy" });
    }

    setGame((current) => dismissSpyIntel(current, turnPlayerId));
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

  function endTurnWithFortify() {
    if (!turnPlayerId || syncJoinerBlocked) {
      return;
    }

    setGameMapSelectedTerritoryId(null);
    clearTurnSelections();

    if (isSyncJoiner) {
      sendTurnCommand({ type: "fortify" });
      return;
    }

    setGame((current) => finishTurnWithFortify(cancelSpySelection(current), turnPlayerId));
  }

  function pauseDraft() {
    if (isSyncGame && !isSyncHost) {
      return;
    }

    if (isSyncGame) {
      setPendingDraftTerritoryId(null);
    }
    clearNonDraftMapSelections();
    setPausedReturnPhase(game.phase === "gameMap" ? "gameMap" : null);

    setGame((current) => {
      if (current.phase === "draft" && current.draft) {
        return current.mode === "sync"
          ? pauseSyncGame(current)
          : {
              ...current,
              phase: "paused",
              draft: pauseDraftTimer(current.draft, Date.now()),
            };
      }

      if (current.phase === "allocation" && current.allocation) {
        return {
          ...current,
          phase: "paused",
          allocation: current.mode === "sync"
            ? {
                ...current.allocation,
                timerEndsAt: null,
                timerRemainingMs: current.allocation.timerRemainingMs,
              }
            : pauseAllocationTimer(current.allocation, Date.now()),
        };
      }

      if (current.phase === "gameMap") {
        return {
          ...current,
          phase: "paused",
          allocation: current.allocation
            ? {
                ...current.allocation,
                timerEndsAt: null,
              }
            : current.allocation,
        };
      }

      if (current.phase === "turn" || current.phase === "turnHandoff") {
        return current.mode === "sync"
          ? pauseSyncGame(current)
          : {
              ...current,
              phase: "paused",
            };
      }

      return current;
    });
  }

  function resumeDraft() {
    const returnPhase = pausedReturnPhase;

    setPausedReturnPhase(null);

    setGame((current) => {
      if (current.phase !== "paused") {
        return current;
      }

      if (returnPhase === "gameMap") {
        return {
          ...current,
          phase: "gameMap",
        };
      }

      if (current.turn) {
        if (current.mode === "sync") {
          if (!isSyncHost || current.players.some((player) => player.connectionStatus !== "connected")) {
            return current;
          }

          return {
            ...current,
            phase: "turn",
          };
        }

        return {
          ...current,
          phase: "turn",
        };
      }

      if (current.allocation) {
        if (current.mode === "sync") {
          if (!isSyncHost || current.players.some((player) => player.connectionStatus !== "connected")) {
            return current;
          }

          return {
            ...current,
            phase: "allocation",
            allocation: beginAllocationTimer(current.allocation, current.config, Date.now()),
          };
        }

        return {
          ...current,
          phase: "allocation",
          allocation: beginAllocationTimer(current.allocation, current.config, Date.now()),
        };
      }

      if (!current.draft) {
        return current;
      }

      if (current.mode === "sync") {
        if (!isSyncHost || current.players.some((player) => player.connectionStatus !== "connected")) {
          return current;
        }

        return {
          ...current,
          phase: "draft",
          draft: beginDraftTimer(current.draft, current.config, Date.now()),
        };
      }

      return {
        ...current,
        phase: "draft",
        draft: beginDraftTimer(current.draft, current.config, Date.now()),
      };
    });
  }

  function returnHome() {
    if (game.phase !== "home") {
      setIsEndGamePromptOpen(true);
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

    setIsRestartGamePromptOpen(false);
    setGame((current) => current.phase === "paused" && (current.mode === "local" || isSyncHost)
      ? removeNonConnectedSyncLobbyPlayers({
          ...current,
          phase: "setup",
          draft: null,
          allocation: null,
          turn: null,
        })
      : current);
  }

  function resetAppToHome() {
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
    setSyncMessage("");
    setIsEndGamePromptOpen(false);
    setIsRestartGamePromptOpen(false);
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
              troopTypes={MIXTURE_TROOP_TYPES}
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
        return activeOverlay.decision === "exit"
          ? (
            <DecisionDialog
              message="End this game and return home?"
              onCancel={() => setIsEndGamePromptOpen(false)}
              onConfirm={endGame}
            />
          )
          : (
            <DecisionDialog
              confirmLabel="Restart game"
              message="Restart this game and return to setup?"
              onCancel={() => setIsRestartGamePromptOpen(false)}
              onConfirm={restartPausedGame}
            />
          );
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
            canRemove={game.mode === "local" || isSyncHost}
            canResume={game.mode === "local" || (isSyncHost && game.players.every((player) => player.connectionStatus === "connected"))}
            localPlayerId={localPlayerId}
            mode={game.mode}
            onRemovePlayer={removePlayer}
            onRestart={game.mode === "local" || isSyncHost ? () => setIsRestartGamePromptOpen(true) : undefined}
            onResume={resumeDraft}
            onScanRecoveryAnswer={isSyncHost ? () => setSyncCameraMode("joinAnswer") : undefined}
            players={game.players}
            syncMessage={syncMessage}
            syncQrText={isSyncHost ? syncQrText : ""}
          />
        );
      case "scanner":
        return syncCameraMode
          ? (
            <QrScanner
              onCancel={() => setSyncCameraMode(null)}
              onScan={syncCameraMode === "hostOffer" ? scanHostOffer : acceptJoinAnswer}
              title={syncCameraMode === "hostOffer" ? "Scan host" : "Scan answer"}
            />
          )
          : null;
      case "syncBlocked":
        return <SyncSessionBlocker onHome={resetAppToHome} session={syncSession} />;
    }
  }

  function renderTroopSection() {
    switch (layout.troopSection) {
      case "allocation":
        return allocationPlayer ? (
          <AllocationPanel
            allocation={game.allocation}
            canFinish={Boolean(game.allocation && allocationComplete(game.allocation, ownership, allocationPlayer.id))}
            onAdjustTroop={adjustSelectedTroop}
            onFinish={finishCurrentAllocation}
            ownership={ownership}
            player={allocationPlayer}
            selectedTerritoryId={allocationSelectedTerritoryId}
          />
        ) : null;
      case "allocationWaiting":
        return allocationPlayer ? (
          <AllocationWaitingPanel
            players={game.players}
            allocation={game.allocation}
            canAdvance={isSyncHost && Boolean(game.allocation && game.players.every((player) => game.allocation?.playerAllocations[player.id]?.ready))}
            onAdvance={startAllocatedGame}
          />
        ) : null;
      case "gameMapInfo":
        return (
          <GameMapPanel
            capturedSpies={gameMapInspection.capturedSpies}
            players={game.players}
            selectedTerritory={gameMapInspection.selectedTerritory}
            troopBreakdown={gameMapInspection.troopBreakdown}
            troopPlayerId={gameMapInspection.troopPlayerId}
            viewerId={gameMapViewerId}
          />
        );
      case "reinforcement":
        return turnActionPlayer && turnReinforcement ? (
          <ReinforcementPanel
            allocation={game.allocation}
            canFinish={Boolean(turnPlayerId && reinforcementComplete(game, turnPlayerId))}
            onAdjustTroop={adjustSelectedReinforcementTroop}
            onFinish={finishCurrentReinforcements}
            player={turnActionPlayer}
            players={game.players}
            reinforcement={turnReinforcement}
            capturedSpies={reinforcementCapturedSpies}
            selectedTerritory={turnSelectedTerritory}
          />
        ) : null;
      case "turnInfo":
        return (
          <GameMapPanel
            capturedSpies={turnMapInspection.capturedSpies}
            players={game.players}
            selectedTerritory={turnMapInspection.selectedTerritory}
            troopBreakdown={turnMapInspection.troopBreakdown}
            troopPlayerId={turnMapInspection.troopPlayerId}
            viewerId={turnViewerId}
          />
        );
      case "none":
        return null;
    }
  }

  function renderActionSection() {
    if (layout.actionSection !== "turn" || !turnActionPlayer) {
      return null;
    }

    return (
      <TurnActionPanel
        canSpy={Boolean(turnPlayerId && (canUseSpy(game, turnPlayerId) || game.turn?.stage === "spyTarget"))}
        onDismissSpy={dismissTurnSpy}
        onFortify={endTurnWithFortify}
        onReinforce={beginTurnReinforcements}
        onSpy={toggleTurnSpy}
        player={turnActionPlayer}
        stage={game.turn?.stage ?? "reinforcementReady"}
        spyMissing={Boolean(turnPlayerId && game.turn?.spies[turnPlayerId]?.status !== "available")}
        spyReturnStage={game.turn?.spyReturnStage ?? null}
      />
    );
  }

  const troopSectionElement = renderTroopSection();
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
          onPause={game.phase !== "paused" && (game.mode === "local" || isSyncHost) ? pauseDraft : undefined}
          onTitlePress={game.phase === "gameMap" && game.mode === "local" ? cycleGameMapViewer : undefined}
          pauseLabel={game.phase === "draft" ? "Pause draft" : game.phase === "gameMap" || game.phase === "turn" ? "Pause map" : "Pause allocation"}
          player={playerBarPlayer}
          timerRemaining={timerRemaining}
          title={playerBarPlayer?.name ?? "Game"}
        />
      ) : null}

      {troopSectionElement}

      <MapView
        autoFocusEnabled={autoFocusEnabled}
        frozen={layout.freezeMapGestures}
        mapData={generatedMapData}
        onTerritoryPress={!layout.freezeMapGestures && mapPressMode ? pressTerritory : undefined}
        onAutoFocusChange={changeAutoFocusEnabled}
        resetCameraKey={resetCameraKey}
        selectedTerritoryId={viewerSelectedTerritoryId}
        showCameraControls={layout.canUseMapCameraControls}
        territoryStates={territoryStates}
        troopMarkers={troopMarkers}
      />

      {actionSectionElement}

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
          onScan={() => setSyncCameraMode("hostOffer")}
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
          onScanAnswer={() => setSyncCameraMode("joinAnswer")}
        />
      ) : null}

      {activeOverlayElement}
    </main>
  );
}

function HomePanel({ onStartLocal, onStartSync }: { onStartLocal: () => void; onStartSync: () => void }) {
  return (
    <section className="hud-panel home-panel">
      <div className="brand-row">
        <img src="./app-icons/icon-192.png" alt="" />
        <div>
          <h1>Ardatúrë</h1>
        </div>
      </div>
      <div className="mode-grid">
        <button className="primary icon-text-button" type="button" onClick={onStartLocal}>
          <Users size={20} />
          Local
        </button>
        <button className="secondary icon-text-button" type="button" onClick={onStartSync}>
          <Wifi size={20} />
          Sync
        </button>
      </div>
    </section>
  );
}

function PlayerIdentity({ color, name }: { color: PlayerColor | null; name: string }) {
  return (
    <span className="player-identity">
      <span className="player-dot" style={{ background: colorCss(color) }} />
      <strong>{name}</strong>
    </span>
  );
}

function SyncEntryPanel({
  color,
  message,
  name,
  onBack,
  onColorChange,
  onChooseRecoveryPlayer,
  onHost,
  onNameChange,
  onScan,
  recoverySlots,
}: {
  color: PlayerColor | null;
  message: string;
  name: string;
  onBack: () => void;
  onColorChange: (color: PlayerColor) => void;
  onChooseRecoveryPlayer: (slot: SyncRecoveryPlayerSlot) => void;
  onHost: () => void;
  onNameChange: (name: string) => void;
  onScan: () => void;
  recoverySlots: SyncRecoveryPlayerSlot[];
}) {
  const ready = Boolean(name.trim() && color);
  const isRecovery = recoverySlots.length > 0 || message === "No disconnected players";

  return (
    <section className="hud-panel sync-entry-panel">
      <PanelHeader onClose={onBack} />
      {isRecovery ? (
        <div className="recovery-slot-list">
          {recoverySlots.map((slot) => (
            <button className="secondary recovery-slot-button wide-button" type="button" key={slot.id} onClick={() => onChooseRecoveryPlayer(slot)}>
              <PlayerIdentity color={slot.color} name={slot.name} />
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="sync-player-entry-row">
            <input
              aria-label="Sync player name"
              autoComplete="off"
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Name"
              value={name}
            />
            <ColorSelect
              label="Sync player color"
              selectedColor={color}
              onSelect={onColorChange}
            />
          </div>
          <div className="mode-grid">
            <button className="primary icon-text-button" type="button" onClick={onHost} disabled={!ready}>
              <Wifi size={19} />
              Host
            </button>
            <button className="secondary icon-text-button" type="button" onClick={onScan} disabled={!ready}>
              <ScanLine size={19} />
              Join
            </button>
          </div>
        </>
      )}
      {message ? <p className="sync-status">{message}</p> : null}
    </section>
  );
}

function SetupPanel({
  canControl,
  canStart,
  config,
  draggingPlayerId,
  draftName,
  localPlayerId,
  mode,
  onAddPlayer,
  onBeginDrag,
  onBack,
  onDraftNameChange,
  onRandomizePlayers,
  onRemovePlayer,
  onScanAnswer,
  onStartDraft,
  onUnlockPlayerField,
  onUpdateConfig,
  onUpdatePlayer,
  players,
  syncAnswerText,
  syncMessage,
  syncQrText,
  syncRole,
}: {
  canControl: boolean;
  canStart: boolean;
  config: GameConfig;
  draggingPlayerId: string | null;
  draftName: string;
  localPlayerId: string | null;
  mode: "local" | "sync";
  onAddPlayer: () => void;
  onBeginDrag: (event: ReactPointerEvent<HTMLButtonElement>, playerId: string) => void;
  onBack: () => void;
  onDraftNameChange: (name: string) => void;
  onRandomizePlayers: () => void;
  onRemovePlayer: (playerId: string) => void;
  onScanAnswer: () => void;
  onStartDraft: () => void;
  onUnlockPlayerField: (playerId: string, field: "name" | "color") => void;
  onUpdateConfig: (updates: Partial<GameConfig>) => void;
  onUpdatePlayer: (playerId: string, updates: Partial<GamePlayer>) => void;
  players: GamePlayer[];
  syncAnswerText: string;
  syncMessage: string;
  syncQrText: string;
  syncRole: SyncRole;
}) {
  return (
    <section className="hud-panel setup-panel">
      <PanelHeader onClose={onBack} />

      {mode === "local" ? (
        <form
          className="add-player"
          onSubmit={(event) => {
            event.preventDefault();
            onAddPlayer();
          }}
        >
          <input
            aria-label="Player name"
            autoComplete="off"
            onChange={(event) => onDraftNameChange(event.target.value)}
            placeholder="Name"
            value={draftName}
          />
          <button className="icon-button primary" type="submit" disabled={!draftName.trim() || players.length >= 6} aria-label="Add player">
            <Plus size={18} />
          </button>
        </form>
      ) : null}

      {mode === "sync" && syncRole === "host" ? (
        <div className="sync-lobby-tools">
          {syncQrText ? <QrPanel text={syncQrText} /> : null}
          <button className="secondary icon-text-button scan-answer-button" type="button" onClick={onScanAnswer}>
            <ScanLine size={18} />
            Scan
          </button>
        </div>
      ) : null}

      {mode === "sync" && syncRole === "joiner" && syncAnswerText ? (
        <QrPanel text={syncAnswerText} />
      ) : null}

      {syncMessage ? <p className="sync-status">{syncMessage}</p> : null}

      <div className="player-list">
        {players.map((player) => {
          const canEditPlayer = mode === "local" || canControl || player.id === localPlayerId;
          const nameLocked = mode === "sync" && !canControl && player.nameLocked;
          const colorLocked = mode === "sync" && !canControl && player.colorLocked;

          return (
            <article
              className={draggingPlayerId === player.id ? "player-row dragging" : "player-row"}
              data-player-id={player.id}
              data-player-status={player.connectionStatus}
              key={player.id}
            >
              <button
                className="drag-handle"
                type="button"
                onPointerDown={(event) => onBeginDrag(event, player.id)}
                disabled={!canControl}
                aria-label={`Move ${player.name}`}
              >
                <GripVertical size={18} />
              </button>
              <input
                aria-label={`${player.name || "Player"} name`}
                autoComplete="off"
                disabled={!canEditPlayer || nameLocked}
                onChange={(event) => onUpdatePlayer(player.id, { name: event.target.value })}
                value={player.name}
              />
              {canControl && player.nameLocked ? (
                <button className="icon-button" type="button" onClick={() => onUnlockPlayerField(player.id, "name")} aria-label={`Unlock ${player.name} name`}>
                  <Unlock size={15} />
                </button>
              ) : null}
              <ColorSelect
                disabled={!canEditPlayer || colorLocked}
                label={`${player.name || "Player"} color`}
                selectedColor={player.color}
                onSelect={(color) => onUpdatePlayer(player.id, { color })}
              />
              {canControl && player.colorLocked ? (
                <button className="icon-button" type="button" onClick={() => onUnlockPlayerField(player.id, "color")} aria-label={`Unlock ${player.name} color`}>
                  <Unlock size={15} />
                </button>
              ) : null}
              {mode === "local" || canControl ? (
                player.id === localPlayerId ? (
                  <span className="icon-button-spacer" aria-hidden="true" />
                ) : (
                  <button className="icon-button danger" type="button" onClick={() => onRemovePlayer(player.id)} aria-label={`Remove ${player.name || "player"}`}>
                    <Trash2 size={16} />
                  </button>
                )
              ) : null}
            </article>
          );
        })}
      </div>

      {mode === "local" || (mode === "sync" && syncRole === "host") ? (
        <div className="setup-actions">
          <button className="secondary icon-text-button" type="button" onClick={onRandomizePlayers} disabled={!canControl || players.length < 2}>
            <Shuffle size={18} />
            Randomize
          </button>
        </div>
      ) : null}

      <div className="config-grid">
        <ConfigSelectSection headingId="territory-draft-heading" title="Territory Draft">
          <SelectField
            disabled={!canControl}
            hideLabel
            label="Draft style"
            options={(["snake", "roundRobin", "random"] as DraftStyle[]).map((value) => ({ value, label: DRAFT_STYLE_LABELS[value] }))}
            value={config.draftStyle}
            onChange={(value) => onUpdateConfig({ draftStyle: value as DraftStyle })}
          />
          <SelectField
            disabled={!canControl || config.draftStyle === "random"}
            hideLabel
            label="Pick time"
            options={PICK_TIME_LIMITS.map((value) => ({ value: String(value), label: formatTimerOption(value) }))}
            value={String(config.pickTimeLimit)}
            onChange={(value) => onUpdateConfig({ pickTimeLimit: Number(value) as PickTimeLimit })}
          />
        </ConfigSelectSection>
        <ConfigSelectSection headingId="troop-allocation-heading" title="Troop Allocation">
          <SelectField
            disabled={!canControl}
            hideLabel
            label="Allocation style"
            options={ALLOCATION_STYLES.map((value) => ({ value, label: ALLOCATION_STYLE_LABELS[value] }))}
            value={config.allocationStyle}
            onChange={(value) => onUpdateConfig({ allocationStyle: value as AllocationStyle })}
          />
          <SelectField
            disabled={!canControl || config.allocationStyle === "random"}
            hideLabel
            label="Allocation time"
            options={TROOP_ALLOCATION_TIME_LIMITS.map((value) => ({ value: String(value), label: formatTroopTimerOption(value) }))}
            value={String(config.troopAllocationTimeLimit)}
            onChange={(value) => onUpdateConfig({ troopAllocationTimeLimit: Number(value) as TroopAllocationTimeLimit })}
          />
        </ConfigSelectSection>
      </div>

      {canControl ? (
        <button className="primary icon-text-button wide-button" type="button" onClick={onStartDraft} disabled={!canStart} aria-label="Start game">
          <Check size={20} />
        </button>
      ) : null}
    </section>
  );
}

function AllocationPanel({
  allocation,
  canFinish,
  onAdjustTroop,
  onFinish,
  ownership,
  player,
  selectedTerritoryId,
}: {
  allocation: GameState["allocation"];
  canFinish: boolean;
  onAdjustTroop: (troopType: TroopType, delta: 1 | -1) => void;
  onFinish: () => void;
  ownership: TerritoryOwnerMap;
  player: GamePlayer;
  selectedTerritoryId: string | null;
}) {
  const playerAllocation = allocation?.playerAllocations[player.id] ?? null;

  return (
    <section className="game-section-panel allocation-panel">
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

function TurnActionPanel({
  canSpy,
  spyMissing,
  onDismissSpy,
  onFortify,
  onReinforce,
  onSpy,
  player,
  stage,
  spyReturnStage,
}: {
  canSpy: boolean;
  spyMissing: boolean;
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
  const spySelected = stage === "spyTarget";

  return (
    <section className="game-section-panel turn-action-panel">
      {spyMissing ? (
        <span className="turn-spy-button turn-spy-spacer" aria-hidden="true" />
      ) : (
        <button className="troop-icon-button turn-spy-button" type="button" onClick={onSpy} disabled={!canSpy} data-selected={spySelected ? "true" : undefined} aria-label="Spy">
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
          <button className="secondary icon-text-button turn-stage-button" type="button" disabled>
            Attack
          </button>
          <button className="primary icon-text-button turn-stage-button" type="button" onClick={onFortify}>
            Fortify
          </button>
        </>
      )}
    </section>
  );
}

function ReinforcementPanel({
  allocation,
  canFinish,
  capturedSpies,
  onAdjustTroop,
  onFinish,
  player,
  players,
  reinforcement,
  selectedTerritory,
}: {
  allocation: GameState["allocation"];
  canFinish: boolean;
  capturedSpies: CapturedSpyView[];
  onAdjustTroop: (troopType: TroopType, delta: 1 | -1) => void;
  onFinish: () => void;
  player: GamePlayer;
  players: GamePlayer[];
  reinforcement: ReinforcementState;
  selectedTerritory: GeneratedTerritoryData | null;
}) {
  const selectedReinforcementTroops = selectedTerritory ? reinforcement.territories[selectedTerritory.id] ?? EMPTY_TROOPS : null;
  const selectedTroops = selectedTerritory
    ? addTroops(territoryTroops(allocation, selectedTerritory.id), selectedReinforcementTroops ?? EMPTY_TROOPS)
    : null;
  const remaining = remainingReinforcementTroops(reinforcement);
  const canAddType = (troopType: TroopType) => selectedTroops !== null && remaining[troopType] > 0;
  const canRemoveType = (troopType: TroopType) => Boolean(selectedReinforcementTroops && selectedReinforcementTroops[troopType] > 0);

  return (
    <section className="game-section-panel allocation-panel reinforcement-panel">
      <div className="allocation-controls">
        <TroopPlacementRows
          canAddType={canAddType}
          canRemoveType={canRemoveType}
          onAdjustTroop={onAdjustTroop}
          player={player}
          remaining={remaining}
          selectedTroops={selectedTroops}
          territoryName={selectedTerritory?.name ?? null}
        />
        {selectedTerritory && selectedTroops ? <CapturedSpyRow players={players} spies={capturedSpies} /> : null}
        <button className="primary icon-text-button wide-button" type="button" onClick={onFinish} disabled={!canFinish} aria-label="Finish reinforcements">
          <Check size={20} />
        </button>
      </div>
    </section>
  );
}

function PlayerBar({
  detail,
  onExit,
  onPause,
  onTitlePress,
  pauseLabel,
  player,
  timerRemaining,
  title,
}: {
  detail?: string | null;
  onExit: () => void;
  onPause?: () => void;
  onTitlePress?: () => void;
  pauseLabel?: string;
  player: GamePlayer | null;
  timerRemaining?: number | null;
  title: string;
}) {
  const light = isLightColor(player?.color ?? null);

  return (
    <div className="player-bar" data-tone={light ? "light" : "dark"} style={{ "--bar-color": colorCss(player?.color ?? null) } as CSSProperties}>
      <button className="icon-button player-bar-button" type="button" onClick={onExit} aria-label="End game">
        <X size={18} />
      </button>
      <button
        className="player-bar-player"
        type="button"
        onClick={onTitlePress}
        disabled={!onTitlePress}
        aria-label={onTitlePress ? "Change viewer" : undefined}
      >
        <strong>{title}</strong>
        {detail ? <span>{detail}</span> : null}
      </button>
      <div className="player-bar-tools">
        {timerRemaining ? <span className="timer-chip player-bar-timer">{Math.ceil(timerRemaining / 1000)}s</span> : null}
        {onPause ? (
          <button className="icon-button player-bar-button" type="button" onClick={onPause} aria-label={pauseLabel ?? "Pause"}>
            <Pause size={18} />
          </button>
        ) : null}
      </div>
    </div>
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
  const selectedTerritory = generatedMapData.territories.find((territory) => territory.id === selectedTerritoryId);
  const canAddType = (troopType: TroopType) => Boolean(selectedTerritoryId && canAddTroop(allocation, ownership, player.id, selectedTerritoryId, troopType));
  const canRemoveType = (troopType: TroopType) => Boolean(selectedTroops && selectedTroops[troopType] > 0);

  return (
    <div className="allocation-controls">
      <TroopPlacementRows
        canAddType={canAddType}
        canRemoveType={canRemoveType}
        onAdjustTroop={onAdjustTroop}
        player={player}
        remaining={remaining}
        selectedTroops={selectedTroops}
        territoryName={selectedTerritory?.name ?? null}
      />
      <button className="primary icon-text-button wide-button" type="button" onClick={onFinish} disabled={!canFinish} aria-label="Ready">
        <Check size={20} />
      </button>
    </div>
  );
}

function TroopPlacementRows({
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
  selectedTroops: TroopCounts | null;
  territoryName: string | null;
}) {
  const canAddAny = TROOP_TYPES.some(canAddType);
  const canRemoveAny = TROOP_TYPES.some(canRemoveType);

  if (!territoryName || !selectedTroops) {
    return (
      <div className="allocation-target">
        <strong>Select a territory</strong>
      </div>
    );
  }

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

function ArmyBuildModal({
  allocation,
  marker,
  onArmyMarkerChange,
  onSubmitBuild,
  player,
  projectedTroops,
  troopTypes = TROOP_TYPES,
}: {
  allocation?: GameState["allocation"];
  marker?: ArmyMarker;
  onArmyMarkerChange: (marker: ArmyMarker) => void;
  onSubmitBuild: () => void;
  player: GamePlayer;
  projectedTroops?: TroopCounts | null;
  troopTypes?: TroopType[];
}) {
  const playerAllocation = allocation?.playerAllocations[player.id] ?? null;
  const modalMarker = marker ?? playerAllocation?.marker ?? null;
  const modalTroops = projectedTroops ?? (playerAllocation ? armyCountsForMarker(playerAllocation.marker, player.color, allocation?.originalPlayerCount ?? 2) : null);

  return (
    <div className="modal-scrim army-build-scrim">
      <section className="modal-panel army-build-modal" role="dialog" aria-label="Build army">
        {modalTroops ? <TroopCountRow counts={modalTroops} player={player} troopTypes={troopTypes} variant="large" /> : null}
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

function AllocationWaitingPanel({
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

function GameMapPanel({
  capturedSpies,
  players,
  selectedTerritory,
  troopBreakdown,
  troopPlayerId,
  viewerId,
}: {
  capturedSpies: CapturedSpyView[];
  players: GamePlayer[];
  selectedTerritory: GeneratedTerritoryData | null;
  troopBreakdown: TroopCounts | null;
  troopPlayerId?: string | null;
  viewerId: string | null;
}) {
  const troopPlayer = players.find((player) => player.id === (troopPlayerId ?? viewerId)) ?? players[0] ?? null;

  return (
    <section className="game-section-panel game-map-panel">
      {selectedTerritory ? <strong className="selected-territory-name">{selectedTerritory.name}</strong> : null}
      {selectedTerritory && troopBreakdown && troopPlayer ? <TroopCountRow counts={troopBreakdown} player={troopPlayer} /> : null}
      {selectedTerritory ? <CapturedSpyRow players={players} spies={capturedSpies} /> : null}
    </section>
  );
}

function TroopCountRow({ counts, player, troopTypes = TROOP_TYPES, variant = "compact" }: { counts: TroopCounts; player: GamePlayer; troopTypes?: TroopType[]; variant?: "compact" | "large" }) {
  return (
    <div className={`troop-count-row ${variant}`}>
      {troopTypes.map((troopType) => (
        <TroopIconCount count={counts[troopType]} key={troopType} player={player} troopType={troopType} />
      ))}
    </div>
  );
}

function CapturedSpyRow({ players, spies }: { players: GamePlayer[]; spies: CapturedSpyView[] }) {
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

function PausePanel({
  canRemove,
  canResume,
  localPlayerId,
  mode,
  onRemovePlayer,
  onRestart,
  onResume,
  onScanRecoveryAnswer,
  players,
  syncMessage,
  syncQrText,
}: {
  canRemove: boolean;
  canResume: boolean;
  localPlayerId: string | null;
  mode: "local" | "sync";
  onRemovePlayer: (playerId: string) => void;
  onRestart?: () => void;
  onResume: () => void;
  onScanRecoveryAnswer?: () => void;
  players: GamePlayer[];
  syncMessage?: string;
  syncQrText?: string;
}) {
  const showRecoveryTools = mode === "sync" && Boolean(onScanRecoveryAnswer);

  return (
    <div className="modal-scrim">
      <section className="modal-panel pause-modal" role="dialog" aria-label="Paused">
        <div className="panel-header">
          <h1>Paused</h1>
          {onRestart ? (
            <button className="icon-button" type="button" onClick={onRestart} aria-label="Restart game">
              <RotateCcw size={18} />
            </button>
          ) : null}
        </div>
        <div className="player-list paused-list">
          {players.map((player) => (
            <article className="player-row compact-row" data-player-status={player.connectionStatus} key={player.id}>
              <PlayerIdentity color={player.color} name={player.name} />
              <span className="connection-label" aria-hidden={mode !== "sync"}>
                {mode === "sync" ? player.connectionStatus : ""}
              </span>
              {canRemove && player.id !== localPlayerId ? (
                <button className="icon-button danger" type="button" onClick={() => onRemovePlayer(player.id)} aria-label={`Remove ${player.name}`}>
                  <Trash2 size={16} />
                </button>
              ) : (
                <span className="icon-button-spacer" aria-hidden="true" />
              )}
            </article>
          ))}
        </div>
        {showRecoveryTools ? (
          <div className="pause-recovery-tools">
            {syncQrText ? <QrPanel text={syncQrText} /> : <div className="qr-placeholder" />}
            <button className="secondary icon-text-button scan-answer-button" type="button" onClick={onScanRecoveryAnswer}>
              <ScanLine size={18} />
              Scan
            </button>
            {syncMessage ? <p className="sync-status">{syncMessage}</p> : null}
          </div>
        ) : null}
        <button className="primary icon-text-button wide-button" type="button" onClick={onResume} disabled={!canResume || players.length < 2}>
          <Play size={20} />
          Resume
        </button>
      </section>
    </div>
  );
}

function SyncSessionBlocker({ onHome, session }: { onHome?: () => void; session: SyncSessionState }) {
  const message = session === "hostEnded"
    ? "Host ended the game"
    : session === "disconnected"
      ? "Host disconnected"
      : "Reconnecting...";
  const Icon = session === "reconnecting" ? X : Check;
  const label = session === "reconnecting" ? "Stop reconnecting" : "Return home";

  return (
    <div className="modal-scrim sync-session-scrim">
      <section className="modal-panel decision-modal sync-session-dialog" role="alertdialog" aria-label="Sync connection">
        <h2>{message}</h2>
        {onHome ? (
          <div className="sync-session-actions">
            <button className="icon-button primary large" type="button" onClick={onHome} aria-label={label}>
              <Icon size={24} />
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function PanelHeader({ closeLabel = "Close", onClose, title }: { closeLabel?: string; onClose: () => void; title?: string }) {
  return (
    <div className={title ? "panel-header" : "panel-header icon-only"}>
      {title ? <h1>{title}</h1> : null}
      <button className="icon-button" type="button" onClick={onClose} aria-label={closeLabel}>
        <X size={18} />
      </button>
    </div>
  );
}

function ColorSelect({
  disabled = false,
  label,
  onSelect,
  selectedColor,
}: {
  disabled?: boolean;
  label: string;
  onSelect: (color: PlayerColor) => void;
  selectedColor: PlayerColor | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function closeOnOutsidePress(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [isOpen]);

  return (
    <div
      className="color-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
      ref={rootRef}
      style={{ "--selected-color": colorCss(selectedColor) } as CSSProperties}
    >
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={label}
        className="color-select-trigger"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="color-select-menu" role="menu">
          {PLAYER_COLORS.map((color) => (
            <button
              aria-label={colorLabel(color)}
              className={selectedColor === color ? "color-select-option selected" : "color-select-option"}
              key={color}
              onClick={() => {
                onSelect(color);
                setIsOpen(false);
              }}
              role="menuitemradio"
              style={{ "--option-color": colorCss(color) } as CSSProperties}
              type="button"
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ConfigSelectSection({ children, headingId, title }: { children: ReactNode; headingId: string; title: string }) {
  return (
    <section className="config-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      <div className="config-select-row">
        {children}
      </div>
    </section>
  );
}

function SelectField({
  disabled = false,
  hideLabel = false,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  hideLabel?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  value: string;
}) {
  return (
    <label className="select-field">
      {hideLabel ? null : <span>{label}</span>}
      <select aria-label={label} disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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

  if (total <= 0) {
    return { heavy: 1 / 3, cavalry: 1 / 3, elite: 1 / 3 };
  }

  return {
    heavy: clamped.heavy / total,
    cavalry: clamped.cavalry / total,
    elite: clamped.elite / total,
  };
}

const REGION_NAMES: Record<string, string> = {
  eriador: "Eriador",
  gondor: "Gondor",
  mordor: "Mordor",
  rhovanion: "Rhovanion",
  rhun: "Rhun",
  rohan: "Rohan",
};

function notificationMessage(notification: GameNotification, players: GamePlayer[]) {
  if (notification.type === "spyLost") {
    return `Your spy was captured in ${territoryName(notification.territoryId)}`;
  }

  if (notification.type === "spyCaptured") {
    const spyOwner = players.find((player) => player.id === notification.spyOwnerId);
    return `You captured ${spyOwner?.name ?? "someone"}'s spy in ${territoryName(notification.territoryId)}`;
  }

  const regionName = REGION_NAMES[notification.regionId] ?? notification.regionId;
  return notification.type === "regionGained"
    ? `You control ${regionName}`
    : `You lost ${regionName}`;
}

function territoryName(territoryId: string) {
  return generatedMapData.territories.find((territory) => territory.id === territoryId)?.name ?? territoryId;
}

function formatQrHandshakeError(error: unknown) {
  const message = error instanceof Error ? error.message : "the handshake failed.";

  if (message.startsWith("this ")) {
    return `QR found, but ${message}`;
  }

  return `QR found, but the handshake failed. ${message}`;
}

function firstAvailableColor(players: GamePlayer[]) {
  const usedColors = new Set(players.map((player) => player.color).filter(Boolean));
  return PLAYER_COLORS.find((color) => !usedColors.has(color)) ?? null;
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

export default App;
