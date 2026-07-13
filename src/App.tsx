import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalPauseRecovery } from "./app/useLocalPauseRecovery";
import {
  applySyncDraftConfirm,
  adjustReinforcementTroop,
  adjustTerritoryTroop,
  activePlayer,
  allocationComplete,
  applySyncAllocationUpdate,
  applySyncPlayerConnectionStatus,
  applySyncPlayerQuit,
  applySyncProfileUpdate,
  applySyncTurnCommand,
  beginAllocationTurn,
  beginAllocationTimer,
  beginDraftTimer,
  beginTurnAfterHandoff,
  canAddReinforcementTroop,
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
  isSetupValid,
  pauseDraftTimer,
  pauseAllocationTimer,
  randomCompleteAllocationForPlayer,
  randomPickForActivePlayer,
  pauseSyncGame,
  projectReinforcementTroops,
  readLocalGame,
  readSyncHostGame,
  reinforcementComplete,
  remainingTerritoryIds,
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
  updateArmyMarker,
  updateReinforcementMarker,
  turnPlayer,
} from "./game/gameState";
import type {
  AppPhase,
  ArmyMarker,
  GameConfig,
  GamePlayer,
  GameState,
  PlayerColor,
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
import { firstAvailableColor, moveItem } from "./game/setupUtils";
import { notificationMessage } from "./game/notificationText";
import {
  activeOverlayForState,
  createTroopMarkers,
  gameStageLayoutForState,
  mapPressModeForGame,
  mapSelectionUpdateForPress,
  notificationPlayerId,
  playerBarControlsForGame,
  playerBarDraftProgress,
  playerBarPlayerForGame,
  playerBarTimerRemaining,
  sanitizeMapSelections,
  selectedTerritoryForMap,
  syncSnapshotForViewer,
  territoryInspectionForViewer,
  visibleNotification,
  type ActiveOverlay,
  type MapSelectionState,
  type MapPressMode,
  type SyncRole,
} from "./game/gameView";
import { generatedMapData } from "./map/generated/mapData";
import { MapView } from "./map/components/MapView";
import { readMapPreferences, saveMapPreferences } from "./map/mapPreferences";
import { territoryForId } from "./map/territoryLookup";
import { isArdatureSyncMessage, type ArdatureSyncMessage } from "./sync/syncMessages";
import { formatQrHandshakeError } from "./sync/syncErrors";
import { QrScanner } from "./sync/QrCodeUi";
import { ArmyBuildModal } from "./ui/ArmyBuildModal";
import { AllocationWaitingPanel, TroopSection, TurnActionPanel } from "./ui/GameSections";
import { ConfirmSheet, DecisionDialog, HandoffPanel, NotificationDialog } from "./ui/Overlays";
import { PausePanel } from "./ui/PausePanel";
import { PlayerBar } from "./ui/PlayerChrome";
import { HomePanel, SetupPanel, SyncEntryPanel } from "./ui/SetupPanels";
import { SyncSessionBlocker, type SyncSessionState } from "./ui/SyncSessionBlocker";
import {
  SyncHostTransport,
  SyncJoinTransport,
  parseSyncRecoveryAnswer,
  parseSyncRecoveryOffer,
  type SyncConnectionStatus,
  type SyncRecoveryPlayerSlot,
  type SyncWireMessage,
} from "./sync/syncTransport";

type SyncCameraMode = "hostOffer" | "joinAnswer" | null;

type JoinerSyncCommand = Extract<ArdatureSyncMessage, { type: "profileUpdate" | "draftConfirm" | "allocationUpdate" | "turnCommand" | "quit" }>;

const EMPTY_MAP_SELECTIONS: MapSelectionState = {
  allocationSelectedTerritoryId: null,
  gameMapSelectedTerritoryId: null,
  pendingDraftTerritoryId: null,
  pendingSpyTerritoryId: null,
  turnSelectedTerritoryId: null,
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
  const [mapSelections, setMapSelections] = useState<MapSelectionState>(EMPTY_MAP_SELECTIONS);
  const hostTransportRef = useRef<SyncHostTransport | null>(null);
  const joinTransportRef = useRef<SyncJoinTransport | null>(null);
  const previousPhaseRef = useRef(game.phase);
  const lastSentAllocationRef = useRef("");
  const syncRevisionRef = useRef(restoredSyncHost?.revision ?? 0);
  const lastSnapshotRevisionRef = useRef(0);
  const active = activePlayer(game);
  const {
    allocationSelectedTerritoryId,
    gameMapSelectedTerritoryId,
    pendingDraftTerritoryId,
    pendingSpyTerritoryId,
    turnSelectedTerritoryId,
  } = mapSelections;
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
  const gameMapViewer = game.players.find((player) => player.id === turnViewerId) ?? game.players[0] ?? null;
  const turnActionPlayer = currentTurnPlayer;
  const turnReinforcement = game.turn?.reinforcement ?? null;
  const turnProjectedReinforcements = turnPlayerId ? projectReinforcementTroops(game, turnPlayerId) : null;
  const turnSelectedTerritory = territoryForId(turnSelectedTerritoryId);
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
  const activeOverlay = activeOverlayForState({
    allocationBuildSubmitted,
    allocationPlayerId,
    canControlActivePlayer,
    canControlTurnPlayer,
    game,
    hasCurrentNotification: Boolean(currentNotification),
    isEndGamePromptOpen,
    isRestartGamePromptOpen,
    localAllocationReady,
    pendingDraftTerritoryId,
    pendingSpyTerritoryId,
    syncCameraMode: Boolean(syncCameraMode),
    syncJoinerBlocked,
    turnPlayerId,
  });
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
  const layout = gameStageLayoutForState({
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
  });

  useLocalPauseRecovery(game);

  function updateMapSelections(updates: Partial<MapSelectionState>) {
    setMapSelections((current) => ({ ...current, ...updates }));
  }

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
    const joinTransport = createJoinTransport(() => {
      joinTransportRef.current?.send({
        type: "profileUpdate",
        name: localPlayer.name,
        color: localPlayer.color,
      });
    });

    setSyncCameraMode(null);
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
    }
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
    updateMapSelections({
      pendingSpyTerritoryId: null,
      turnSelectedTerritoryId: null,
    });
  }

  function clearNonDraftMapSelections() {
    updateMapSelections({
      allocationSelectedTerritoryId: null,
      gameMapSelectedTerritoryId: null,
      pendingSpyTerritoryId: null,
      turnSelectedTerritoryId: null,
    });
  }

  function beginTurnReinforcements() {
    if (!turnPlayerId || syncJoinerBlocked) {
      return;
    }

    updateMapSelections({ pendingSpyTerritoryId: null });
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
    updateMapSelections({ turnSelectedTerritoryId: null });

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

    updateMapSelections({ pendingSpyTerritoryId: null });
    setGame((current) => startSpySelection(current, turnPlayerId));
  }

  function confirmTurnSpy() {
    if (!turnPlayerId || !pendingSpyTerritoryId || syncJoinerBlocked) {
      return;
    }

    const territoryId = pendingSpyTerritoryId;
    updateMapSelections({ pendingSpyTerritoryId: null });

    if (isSyncJoiner) {
      sendTurnCommand({ type: "confirmSpy", territoryId });
      return;
    }

    setGame((current) => confirmSpyAttempt(current, turnPlayerId, territoryId));
  }

  function cancelTurnSpy() {
    updateMapSelections({ pendingSpyTerritoryId: null });
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

    updateMapSelections({ gameMapSelectedTerritoryId: null });
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
      updateMapSelections({ pendingDraftTerritoryId: null });
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
    if (!layout.troopSection) {
      return null;
    }

    switch (layout.troopSection.type) {
      case "allocation":
        if (layout.troopSection.source === "reinforcement") {
          return turnActionPlayer && turnReinforcement ? (
            <TroopSection
              allocation={game.allocation}
              canFinish={Boolean(turnPlayerId && reinforcementComplete(game, turnPlayerId))}
              capturedSpies={reinforcementCapturedSpies}
              mode="reinforcement"
              onAdjustTroop={adjustSelectedReinforcementTroop}
              onFinish={finishCurrentReinforcements}
              player={turnActionPlayer}
              players={game.players}
              reinforcement={turnReinforcement}
              selectedTerritory={turnSelectedTerritory}
            />
          ) : null;
        }

        return allocationPlayer ? (
          <TroopSection
            allocation={game.allocation}
            canFinish={Boolean(game.allocation && allocationComplete(game.allocation, ownership, allocationPlayer.id))}
            mode="initialAllocation"
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
      case "info":
        if (layout.troopSection.source === "turn") {
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
          onPause={playerBarControls.canPause ? pauseDraft : undefined}
          onTitlePress={playerBarControls.canCycleViewer ? cycleGameMapViewer : undefined}
          pauseLabel={playerBarControls.pauseLabel}
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

export default App;
