import { type CSSProperties, type ClipboardEvent as ReactClipboardEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import {
  ArrowRight,
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
  clearLocalGame,
  clearSyncHostGame,
  commitReinforcements,
  completeTimedOutSyncAllocations,
  confirmSpyAttempt,
  confirmTerritoryPick,
  createInitialGameState,
  createOwnershipMap,
  createPlayer,
  createTerritoryStates,
  dismissSpyIntel,
  draftProgressForPlayer,
  emptyOwnedTerritoryCount,
  finishReinforcements,
  finishTurnWithFortify,
  finishAllocationForPlayer,
  formatTimerOption,
  formatTroopTimerOption,
  isSetupValid,
  ownedTerritoryIds,
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
  removePlayerFromDraft,
  saveLocalGame,
  saveSyncHostGame,
  spyCaptureProbability,
  startDraft,
  startAllocation,
  startGameMapAfterAllocation,
  startReinforcements,
  startSpySelection,
  submitArmyBuild,
  submitReinforcementBuild,
  territoryTroopTotal,
  territoryTroops,
  troopTotal,
  updateArmyMarker,
  updateReinforcementMarker,
  turnPlayer,
} from "./game/gameState";
import type {
  AppPhase,
  ArmyMarker,
  DraftStyle,
  GameConfig,
  GamePlayer,
  GameState,
  PickTimeLimit,
  PlayerColor,
  ReinforcementState,
  TerritoryOwnerMap,
  TroopCounts,
  TroopAllocationTimeLimit,
  TroopType,
} from "./game/gameTypes";
import {
  gameConfigFromPreferences,
  localPlayersFromPreferences,
  saveGameConfigPreference,
  saveLocalSetupPreference,
  saveSyncProfilePreference,
  syncProfileFromPreferences,
} from "./game/setupPreferences";
import { generatedMapData } from "./map/generated/mapData";
import { generatedMapConnections } from "./map/generated/mapConnections";
import { MapView } from "./map/components/MapView";
import { readMapPreferences, saveMapPreferences } from "./map/mapPreferences";
import type { GeneratedTerritoryData } from "./map/mapTypes";
import { isArdatureSyncMessage, type TurnCommand } from "./sync/syncMessages";
import {
  SyncHostTransport,
  SyncJoinTransport,
  parseSyncRecoveryAnswer,
  parseSyncRecoveryOffer,
  type SyncConnectionStatus,
  type SyncRecoveryPlayerSlot,
  type SyncWireMessage,
} from "./sync/syncTransport";

type SyncRole = "host" | "joiner" | null;

type SyncSessionState = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected" | "hostEnded";

type SyncCameraMode = "hostOffer" | "joinAnswer" | null;

type SyncDraftNotice = {
  key: string;
  playerId: string;
  territoryId: string;
};

type SpyCaptureNotice = {
  key: string;
  playerId: string;
  territoryId: string;
};

type BarcodeDetectorResult = {
  rawValue: string;
};

type BarcodeDetectorInstance = {
  detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]>;
};

type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance;

type ExtendedMediaTrackCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  torch?: boolean;
};

type ExtendedMediaTrackConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string;
  torch?: boolean;
};

const DRAFT_STYLE_LABELS: Record<DraftStyle, string> = {
  random: "Random",
  roundRobin: "Round robin",
  snake: "Snake",
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
  const [syncDraftNotice, setSyncDraftNotice] = useState<SyncDraftNotice | null>(null);
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
  const [spyCaptureNotice, setSpyCaptureNotice] = useState<SpyCaptureNotice | null>(null);
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
  const syncJoinerBlocked = game.mode === "sync" && syncRole === "joiner" && (syncSession === "reconnecting" || syncSession === "disconnected" || syncSession === "hostEnded");
  const canSendSyncCommand = game.mode !== "sync" || syncRole !== "joiner" || syncSession === "connected";
  const canControlActivePlayer = game.mode === "local" || (game.mode === "sync" && canSendSyncCommand && active?.id === localPlayerId);
  const canControlTurnPlayer = game.mode === "local" || (game.mode === "sync" && canSendSyncCommand && game.turn?.currentPlayerId === localPlayerId);
  const turnPlayerId = game.turn?.currentPlayerId ?? null;
  const viewerSelectedTerritoryId = game.phase === "draft"
    ? canControlActivePlayer ? pendingDraftTerritoryId : null
    : game.phase === "allocation" && allocationPlayerId
      ? allocationSelectedTerritoryId
      : game.phase === "turn" && canControlTurnPlayer && (game.turn?.stage === "reinforcementPlace" || game.turn?.stage === "spyTarget" || game.turn?.stage === "spyIntel")
        ? game.turn.stage === "spyIntel"
          ? game.turn.spyIntel?.targetTerritoryId ?? null
          : pendingSpyTerritoryId ?? turnSelectedTerritoryId
      : game.phase === "gameMap" || game.phase === "turn"
        ? gameMapSelectedTerritoryId
        : null;
  const territoryStates = useMemo(
    () => createTerritoryStates(game.players, ownership, viewerSelectedTerritoryId),
    [game.players, ownership, viewerSelectedTerritoryId],
  );
  const troopMarkers = useMemo(
    () => createTroopMarkers(game, allocationPlayerId, gameMapViewerId, turnViewerId),
    [allocationPlayerId, game, gameMapViewerId, turnViewerId],
  );
  const remainingCount = game.draft ? remainingTerritoryIds(game.draft.ownership).length : generatedMapData.territories.length;
  const blockingResultTerritory = game.draft?.resultTerritoryId
    ? generatedMapData.territories.find((territory) => territory.id === game.draft?.resultTerritoryId) ?? null
    : null;
  const blockingResultPlayer = game.draft?.resultPlayerId
    ? game.players.find((player) => player.id === game.draft?.resultPlayerId) ?? null
    : null;
  const noticeTerritory = syncDraftNotice
    ? generatedMapData.territories.find((territory) => territory.id === syncDraftNotice.territoryId) ?? null
    : null;
  const noticePlayer = syncDraftNotice
    ? game.players.find((player) => player.id === syncDraftNotice.playerId) ?? null
    : null;
  const disconnectedSyncPlayers = game.mode === "sync"
    ? game.players
        .filter((player) => player.id !== localPlayerId && player.connectionStatus === "disconnected")
        .map((player) => ({ color: player.color, id: player.id, name: player.name }))
    : [];
  const gameMapSelectedTerritory = gameMapSelectedTerritoryId
    ? generatedMapData.territories.find((territory) => territory.id === gameMapSelectedTerritoryId) ?? null
    : null;
  const gameMapSelectedOwnTerritory = Boolean(gameMapSelectedTerritoryId && turnViewerId && ownership[gameMapSelectedTerritoryId] === turnViewerId);
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
  const spyNoticeTerritory = spyCaptureNotice
    ? generatedMapData.territories.find((territory) => territory.id === spyCaptureNotice.territoryId) ?? null
    : null;
  const spyNoticePlayer = spyCaptureNotice
    ? game.players.find((player) => player.id === spyCaptureNotice.playerId) ?? null
    : null;
  const turnMapSelectedTerritory = spyIntelTerritory ?? gameMapSelectedTerritory;
  const turnMapTroopBreakdown = spyIntelTerritory
    ? territoryTroops(game.allocation, spyIntelTerritory.id)
    : gameMapSelectedTerritoryId && gameMapSelectedOwnTerritory
      ? territoryTroops(game.allocation, gameMapSelectedTerritoryId)
      : null;
  const turnMapTroopPlayerId = spyIntelTerritory
    ? ownership[spyIntelTerritory.id]
    : turnViewerId;
  const viewerPendingTerritory = pendingDraftTerritoryId
    ? generatedMapData.territories.find((territory) => territory.id === pendingDraftTerritoryId) ?? null
    : null;
  const timerRemaining = game.phase === "draft" && game.draft?.timerEndsAt
    ? Math.max(0, game.draft.timerEndsAt - now)
    : game.phase === "allocation" && game.allocation?.timerEndsAt
      ? Math.max(0, game.allocation.timerEndsAt - now)
      : game.phase === "allocation" || game.phase === "allocationHandoff" || (game.phase === "paused" && Boolean(game.allocation))
        ? game.allocation?.timerRemainingMs ?? null
        : game.draft?.timerRemainingMs ?? null;
  const canControlSetup = game.mode === "local" || syncRole === "host";
  const canDraftOnMap = !syncJoinerBlocked &&
    game.phase === "draft" &&
    canControlActivePlayer &&
    Boolean(active) &&
    !game.draft?.resultTerritoryId;
  const canAllocateOnMap = !syncJoinerBlocked && game.phase === "allocation" && Boolean(allocationPlayerId) && allocationBuildSubmitted && !localAllocationReady;
  const canReinforceOnMap = !syncJoinerBlocked && game.phase === "turn" && canControlTurnPlayer && game.turn?.stage === "reinforcementPlace";
  const canSpyOnMap = !syncJoinerBlocked && game.phase === "turn" && canControlTurnPlayer && game.turn?.stage === "spyTarget";
  const canInspectGameMap = !syncJoinerBlocked && (game.phase === "gameMap" || (game.phase === "turn" && !canReinforceOnMap && !canSpyOnMap));
  const canShowConfirm = Boolean(viewerPendingTerritory && active && canControlActivePlayer);
  const showAllocationControls = game.phase === "allocation" && !localAllocationReady && !isEndGamePromptOpen && !isRestartGamePromptOpen && !syncCameraMode;
  const showArmyBuildModal = Boolean(showAllocationControls && allocationPlayer && !allocationBuildSubmitted);
  const showDraftPanel = game.phase === "draft" &&
    !syncCameraMode &&
    !isEndGamePromptOpen &&
    !isRestartGamePromptOpen;
  const showAllocationWaiting = game.mode === "sync" && game.phase === "allocation" && localAllocationReady && !isEndGamePromptOpen && !isRestartGamePromptOpen && !syncCameraMode;
  const showAllocationHandoff = game.phase === "allocationHandoff" && !isEndGamePromptOpen && !isRestartGamePromptOpen && !syncCameraMode;
  const showGameMapControls = game.phase === "gameMap" && !isEndGamePromptOpen && !isRestartGamePromptOpen && !syncCameraMode;
  const showTurnControls = game.phase === "turn" && canControlTurnPlayer && Boolean(turnActionPlayer) && !isEndGamePromptOpen && !isRestartGamePromptOpen && !syncCameraMode;
  const showReinforcementControls = game.phase === "turn" && canControlTurnPlayer && turnActionPlayer && game.turn?.stage === "reinforcementPlace" && !isEndGamePromptOpen && !isRestartGamePromptOpen && !syncCameraMode;
  const showReinforcementBuildModal = game.phase === "turn" && canControlTurnPlayer && turnActionPlayer && game.turn?.stage === "reinforcementBuild" && !isEndGamePromptOpen && !isRestartGamePromptOpen && !syncCameraMode;
  const showTurnMapControls = game.phase === "turn" &&
    game.turn?.stage !== "reinforcementBuild" &&
    game.turn?.stage !== "reinforcementPlace" &&
    game.turn?.stage !== "spyTarget" &&
    (Boolean(gameMapSelectedTerritoryId) || !canControlTurnPlayer || game.turn?.stage === "spyIntel") &&
    !isEndGamePromptOpen &&
    !isRestartGamePromptOpen &&
    !syncCameraMode;
  const pausedDraftPlayer = game.phase === "paused" && game.draft && !game.allocation
    ? activePlayer({ ...game, phase: "draft" })
    : null;
  const gameTopBarPlayer = game.phase === "draft"
    ? active
    : game.phase === "allocation" || game.phase === "allocationHandoff"
      ? allocationPlayer
    : game.phase === "turn" || game.phase === "turnHandoff"
      ? currentTurnPlayer
    : game.phase === "gameMap"
        ? gameMapViewer
        : game.phase === "paused" && game.turn
          ? currentTurnPlayer
        : game.phase === "paused" && pausedReturnPhase === "gameMap"
          ? gameMapViewer
          : game.phase === "paused" && game.allocation
            ? allocationPlayer
            : game.phase === "paused"
              ? pausedDraftPlayer
              : null;
  const gameTopBarIsDraft = game.phase === "draft" || (game.phase === "paused" && Boolean(game.draft) && !game.allocation);
  const gameTopBarProgress = gameTopBarIsDraft && gameTopBarPlayer
    ? draftProgressForPlayer(game, gameTopBarPlayer.id)
    : null;
  const showGameTopBar = game.phase !== "home" && game.phase !== "setup" && Boolean(gameTopBarPlayer);
  const showGameStageLayout = showGameTopBar || showDraftPanel || showAllocationControls || showAllocationWaiting || showAllocationHandoff || showGameMapControls || showTurnControls || showReinforcementControls || showTurnMapControls;
  const canUseMapCameraControls = !Boolean(
    game.phase === "home" ||
    game.phase === "setup" ||
    showArmyBuildModal ||
    syncCameraMode ||
    syncJoinerBlocked ||
    isEndGamePromptOpen ||
    isRestartGamePromptOpen ||
    game.phase === "paused" ||
    showAllocationHandoff ||
    showAllocationWaiting ||
    game.phase === "turnHandoff" ||
    canShowConfirm ||
    Boolean(spyTargetTerritory) ||
    Boolean(spyNoticeTerritory && spyNoticePlayer) ||
    Boolean(blockingResultTerritory && blockingResultPlayer) ||
    Boolean(noticeTerritory && noticePlayer)
  );

  useEffect(() => {
    const notice = syncDraftNoticeFromOwnershipChange(latestGameRef.current, game);
    if (notice) {
      setSyncDraftNotice({
        ...notice,
        key: `${notice.playerId}:${notice.territoryId}:${Date.now()}`,
      });
    }

    const spyNotice = spyCaptureNoticeFromTurnChange(latestGameRef.current, game, localPlayerId);
    if (spyNotice) {
      setSpyCaptureNotice({
        ...spyNotice,
        key: `${spyNotice.playerId}:${spyNotice.territoryId}:${Date.now()}`,
      });
    }

    latestGameRef.current = game;
  }, [game, localPlayerId]);

  useEffect(() => {
    latestSyncRoleRef.current = syncRole;
  }, [syncRole]);

  useEffect(() => {
    latestLocalPlayerIdRef.current = localPlayerId;
  }, [localPlayerId]);

  useEffect(() => {
    const isPausedLocalDraft = game.mode === "local" && game.phase === "paused" && Boolean(game.draft) && !game.allocation;
    if (game.phase !== "draft" && !isPausedLocalDraft) {
      setSyncDraftNotice(null);
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
    if (syncRole === "host") {
      saveGameConfigPreference(game.config);
    }

    if (localPlayer && !localPlayer.nameLocked && !localPlayer.colorLocked) {
      saveSyncProfilePreference({
        name: localPlayer.name,
        color: localPlayer.color,
      });
    }
  }, [game.config, game.mode, game.phase, game.players, localPlayerId, syncRole]);

  useEffect(() => {
    if (game.mode === "sync" && syncRole === "host") {
      broadcastSnapshot(game);
    }
  }, [game, localPlayerId, syncRole]);

  useEffect(() => {
    if (game.mode !== "sync" || syncRole !== "host" || game.phase !== "paused") {
      return;
    }

    void createRecoveryOffer();
  }, [disconnectedSyncPlayers.map((player) => player.id).join("|"), game.mode, game.phase, syncRole]);

  useEffect(() => {
    if (!restoredSyncHost || hostTransportRef.current || game.mode !== "sync" || syncRole !== "host" || !localPlayerId) {
      return;
    }

    const hostPlayer = game.players.find((player) => player.id === localPlayerId);
    if (!hostPlayer) {
      return;
    }

    hostTransportRef.current = new SyncHostTransport({
      callbacks: {
        onMessage: handleHostMessage,
        onPeerClosed: handleHostPeerClosed,
        onPeerStatus: handleHostPeerStatus,
      },
      hostName: hostPlayer.name,
      hostPlayerId: hostPlayer.id,
      roomId: crypto.randomUUID(),
    });
    setSyncSession("connected");

    if (game.phase === "paused") {
      void createRecoveryOffer();
    }
  }, [game.mode, game.phase, game.players, localPlayerId, restoredSyncHost, syncRole]);

  useEffect(() => {
    if (game.mode !== "sync" || syncRole !== "joiner" || !canSendSyncCommand || !localPlayerId || !game.allocation) {
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
    joinTransportRef.current?.send({ type: "allocationUpdate", allocation });
  }, [canSendSyncCommand, game.allocation, game.mode, localPlayerId, syncRole]);

  useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    previousPhaseRef.current = game.phase;

    if (previousPhase === "home" && game.phase === "draft" && game.draft && !game.draft.timerEndsAt && !game.draft.resultTerritoryId) {
      setGame((current) => current.draft
        ? { ...current, draft: beginDraftTimer(current.draft, current.config, Date.now()) }
        : current);
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
    if (game.mode === "sync" && syncRole !== "host") {
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
  }, [game.mode, game.phase, game.draft?.timerEndsAt, now, pendingDraftTerritoryId, syncRole]);

  useEffect(() => {
    if (
      game.mode !== "sync" ||
      syncRole !== "joiner" ||
      !canSendSyncCommand ||
      !pendingDraftTerritoryId ||
      !canControlActivePlayer ||
      game.phase !== "draft" ||
      !game.draft?.timerEndsAt ||
      game.draft.timerEndsAt > now
    ) {
      return;
    }

    joinTransportRef.current?.send({ type: "draftConfirm", territoryId: pendingDraftTerritoryId });
    setPendingDraftTerritoryId(null);
  }, [canControlActivePlayer, canSendSyncCommand, game.draft?.timerEndsAt, game.mode, game.phase, now, pendingDraftTerritoryId, syncRole]);

  useEffect(() => {
    if (game.mode === "sync" && syncRole !== "host") {
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
  }, [allocationPlayerId, game.mode, game.phase, game.allocation?.timerEndsAt, now, syncRole]);

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

    if (!hostTransport || game.mode !== "sync" || syncRole !== "host" || game.phase !== "paused") {
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

    if (!hostTransport || syncRole !== "host" || isAcceptingAnswer) {
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
                color: null,
                nameLocked: false,
                colorLocked: false,
                connectionStatus: "connected" as const,
              },
            ];

        return { ...current, players };
      });
      if (recoveryAnswer) {
        await createRecoveryOffer(`${joinedPlayer.name} rejoined`);
      } else {
        await createHostOffer(`${joinedPlayer.name} joined`);
      }
    } catch (error) {
      const message = formatQrHandshakeError(error);

      setSyncMessage(message);
      if (game.phase === "paused") {
        await createRecoveryOffer(message);
      } else {
        await createHostOffer(message);
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
            color: null,
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
            color: null,
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

  function applySyncTurnCommand(current: GameState, playerId: string, command: TurnCommand) {
    if (command.type === "confirmSpy") {
      return confirmSpyAttempt(startSpySelection(current, playerId), playerId, command.territoryId);
    }

    if (command.type === "dismissSpy") {
      return dismissSpyIntel(current, playerId);
    }

    if (command.type === "commitReinforcements") {
      return commitReinforcements(current, playerId, command.reinforcement);
    }

    return finishTurnWithFortify(cancelSpySelection(current), playerId);
  }

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
    if (game.mode === "sync" && syncRole === "joiner") {
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
      joinTransportRef.current?.send({
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

        const hostLockedUpdates = current.mode === "sync" && syncRole === "host" && player.id !== localPlayerId
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
    if (syncRole !== "host") {
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
    if (game.mode === "sync" && syncRole !== "host") {
      return;
    }

    if (game.mode === "sync" && syncRole === "host") {
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
      ? startAllocation(draftState, Date.now())
      : {
          ...draftState,
          draft: beginDraftTimer(draft, game.config, Date.now()),
        });
  }

  function pressTerritory(territoryId: string) {
    if (syncJoinerBlocked) {
      return;
    }

    if (game.phase === "allocation" && allocationPlayerId) {
      if (ownership[territoryId] === allocationPlayerId) {
        setAllocationSelectedTerritoryId(territoryId);
      }
      return;
    }

    if (game.phase === "gameMap" && gameMapViewerId) {
      setGameMapSelectedTerritoryId(territoryId);
      return;
    }

    if (game.phase === "turn") {
      if (canReinforceOnMap && turnPlayerId && ownership[territoryId] === turnPlayerId) {
        setTurnSelectedTerritoryId(territoryId);
        return;
      }

      if (canSpyOnMap && turnPlayerId && ownership[territoryId] && ownership[territoryId] !== turnPlayerId) {
        setPendingSpyTerritoryId(territoryId);
        return;
      }

      if (turnViewerId) {
        setGameMapSelectedTerritoryId(territoryId);
      }
      return;
    }

    if (!canPickTerritory(game, territoryId)) {
      return;
    }

    setPendingDraftTerritoryId(territoryId);
  }

  function cancelPendingPick() {
    setPendingDraftTerritoryId(null);
  }

  function confirmPendingPick() {
    if (!pendingDraftTerritoryId) {
      return;
    }

    if (game.mode === "sync" && syncRole === "joiner") {
      if (!canSendSyncCommand) {
        return;
      }

      joinTransportRef.current?.send({ type: "draftConfirm", territoryId: pendingDraftTerritoryId });
      setPendingDraftTerritoryId(null);
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
    setTurnSelectedTerritoryId(null);
    setPendingSpyTerritoryId(null);
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

    if (game.mode === "sync" && syncRole === "joiner") {
      joinTransportRef.current?.send({ type: "turnCommand", command: { type: "commitReinforcements", reinforcement } });
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

    if (game.mode === "sync" && syncRole === "joiner") {
      joinTransportRef.current?.send({ type: "turnCommand", command: { type: "confirmSpy", territoryId } });
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

    if (game.mode === "sync" && syncRole === "joiner") {
      joinTransportRef.current?.send({ type: "turnCommand", command: { type: "dismissSpy" } });
    }

    setGame((current) => dismissSpyIntel(current, turnPlayerId));
  }

  function endTurnWithFortify() {
    if (!turnPlayerId || syncJoinerBlocked) {
      return;
    }

    setGameMapSelectedTerritoryId(null);
    setTurnSelectedTerritoryId(null);
    setPendingSpyTerritoryId(null);

    if (game.mode === "sync" && syncRole === "joiner") {
      joinTransportRef.current?.send({ type: "turnCommand", command: { type: "fortify" } });
      return;
    }

    setGame((current) => finishTurnWithFortify(cancelSpySelection(current), turnPlayerId));
  }

  function nextDraftTurn() {
    setResetCameraKey((current) => current + 1);

    setGame((current) => current.draft
      ? {
          ...current,
          draft: beginDraftTimer({
            ...current.draft,
            resultTerritoryId: null,
            resultPlayerId: null,
          }, current.config, Date.now()),
        }
      : current);
  }

  function pauseDraft() {
    if (game.mode === "sync" && syncRole !== "host") {
      return;
    }

    if (game.mode === "sync") {
      setPendingDraftTerritoryId(null);
    }
    setAllocationSelectedTerritoryId(null);
    setGameMapSelectedTerritoryId(null);
    setTurnSelectedTerritoryId(null);
    setPendingSpyTerritoryId(null);
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
          if (syncRole !== "host" || current.players.some((player) => player.connectionStatus !== "connected")) {
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
          if (syncRole !== "host" || current.players.some((player) => player.connectionStatus !== "connected")) {
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
        if (syncRole !== "host" || current.players.some((player) => player.connectionStatus !== "connected")) {
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
        draft: current.draft.resultTerritoryId
          ? current.draft
          : beginDraftTimer(current.draft, current.config, Date.now()),
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
    if (game.mode === "sync" && syncRole === "host") {
      hostTransportRef.current?.broadcast({ type: "hostEnded" });
    }

    if (game.mode === "sync" && syncRole === "joiner") {
      joinTransportRef.current?.send({ type: "quit" });
    }

    resetAppToHome();
  }

  function restartPausedGame() {
    if (game.phase !== "paused" || (game.mode === "sync" && syncRole !== "host")) {
      return;
    }

    setSyncDraftNotice(null);
    setIsRestartGamePromptOpen(false);
    setGame((current) => current.phase === "paused" && (current.mode === "local" || syncRole === "host")
      ? {
          ...current,
          phase: "setup",
          draft: null,
          allocation: null,
          turn: null,
        }
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
    setSyncDraftNotice(null);
    setIsEndGamePromptOpen(false);
    setIsRestartGamePromptOpen(false);
    setGame(createInitialGameState());
  }

  function dismissNotice() {
    setSyncDraftNotice(null);
  }

  function endSyncTransports() {
    hostTransportRef.current?.close();
    joinTransportRef.current?.close();
    hostTransportRef.current = null;
    joinTransportRef.current = null;
  }

  function broadcastSnapshot(nextGame: GameState) {
    if (syncRole !== "host") {
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

  return (
      <main
      className={`app-shell${showGameStageLayout ? " game-layout" : ""}`}
      data-app-phase={game.phase}
      data-draft-controls={showDraftPanel ? "visible" : "hidden"}
      data-sync-role={syncRole ?? "none"}
    >
      {showGameTopBar ? (
        <GameTopBar
          detail={gameTopBarProgress ? `${gameTopBarProgress.drafted} / ${gameTopBarProgress.total}` : null}
          onExit={returnHome}
          onPause={game.phase !== "paused" && (game.mode === "local" || syncRole === "host") ? pauseDraft : undefined}
          onTitlePress={game.phase === "gameMap" && game.mode === "local" ? cycleGameMapViewer : undefined}
          pauseLabel={game.phase === "draft" ? "Pause draft" : game.phase === "gameMap" || game.phase === "turn" ? "Pause map" : "Pause allocation"}
          player={gameTopBarPlayer}
          timerRemaining={timerRemaining}
          title={gameTopBarPlayer?.name ?? "Game"}
        />
      ) : null}

      {showAllocationControls && allocationPlayer ? (
        <AllocationPanel
          allocation={game.allocation}
          canFinish={Boolean(game.allocation && allocationComplete(game.allocation, ownership, allocationPlayer.id))}
          onAdjustTroop={adjustSelectedTroop}
          onFinish={finishCurrentAllocation}
          ownership={ownership}
          player={allocationPlayer}
          selectedTerritoryId={allocationSelectedTerritoryId}
        />
      ) : null}

      {showGameMapControls ? (
        <GameMapPanel
          players={game.players}
          selectedTerritory={gameMapSelectedTerritory}
          troopBreakdown={gameMapSelectedTerritoryId && gameMapSelectedOwnTerritory ? territoryTroops(game.allocation, gameMapSelectedTerritoryId) : null}
          viewerId={gameMapViewerId}
        />
      ) : null}

      {showAllocationWaiting && allocationPlayer ? (
        <AllocationWaitingPanel
          players={game.players}
          allocation={game.allocation}
          canAdvance={syncRole === "host" && Boolean(game.allocation && game.players.every((player) => game.allocation?.playerAllocations[player.id]?.ready))}
          onAdvance={startAllocatedGame}
        />
      ) : null}

      {showReinforcementControls && turnActionPlayer && turnReinforcement ? (
        <ReinforcementPanel
          allocation={game.allocation}
          canFinish={Boolean(turnPlayerId && reinforcementComplete(game, turnPlayerId))}
          onAdjustTroop={adjustSelectedReinforcementTroop}
          onFinish={finishCurrentReinforcements}
          player={turnActionPlayer}
          reinforcement={turnReinforcement}
          selectedTerritory={turnSelectedTerritory}
        />
      ) : null}

      {showTurnMapControls ? (
        <GameMapPanel
          players={game.players}
          selectedTerritory={turnMapSelectedTerritory}
          troopBreakdown={turnMapTroopBreakdown}
          troopPlayerId={turnMapTroopPlayerId}
          viewerId={turnViewerId}
        />
      ) : null}

      <MapView
        autoFocusEnabled={autoFocusEnabled}
        mapData={generatedMapData}
        onMapPress={canShowConfirm ? cancelPendingPick : undefined}
        onTerritoryPress={canDraftOnMap || canAllocateOnMap || canReinforceOnMap || canSpyOnMap || canInspectGameMap ? pressTerritory : undefined}
        onAutoFocusChange={changeAutoFocusEnabled}
        resetCameraKey={resetCameraKey}
        selectedTerritoryId={viewerSelectedTerritoryId}
        showCameraControls={canUseMapCameraControls}
        territoryStates={territoryStates}
        troopMarkers={troopMarkers}
      />

      {showTurnControls && turnActionPlayer ? (
        <TurnActionPanel
          canSpy={Boolean(turnPlayerId && (canUseSpy(game, turnPlayerId) || game.turn?.stage === "spyTarget"))}
          onDismissSpy={dismissTurnSpy}
          onFortify={endTurnWithFortify}
          onReinforce={beginTurnReinforcements}
          onSpy={toggleTurnSpy}
          player={turnActionPlayer}
          stage={game.turn?.stage ?? "reinforcementReady"}
          spyReturnStage={game.turn?.spyReturnStage ?? null}
        />
      ) : null}

      {showArmyBuildModal && allocationPlayer ? (
        <ArmyBuildModal
          allocation={game.allocation}
          onArmyMarkerChange={changeArmyMarker}
          onSubmitBuild={submitCurrentArmyBuild}
          player={allocationPlayer}
        />
      ) : null}

      {showReinforcementBuildModal && turnActionPlayer && turnReinforcement && turnProjectedReinforcements ? (
        <ArmyBuildModal
          marker={turnReinforcement.marker}
          onArmyMarkerChange={changeReinforcementMarker}
          onSubmitBuild={submitCurrentReinforcementBuild}
          player={turnActionPlayer}
          projectedTroops={turnProjectedReinforcements}
          troopTypes={MIXTURE_TROOP_TYPES}
        />
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

      {game.phase === "paused" ? (
        <PausePanel
          canRemove={game.mode === "local" || syncRole === "host"}
          canResume={game.mode === "local" || (syncRole === "host" && game.players.every((player) => player.connectionStatus === "connected"))}
          localPlayerId={localPlayerId}
          mode={game.mode}
          onRemovePlayer={removePlayer}
          onRestart={game.mode === "local" || syncRole === "host" ? () => setIsRestartGamePromptOpen(true) : undefined}
          onResume={resumeDraft}
          onScanRecoveryAnswer={game.mode === "sync" && syncRole === "host" ? () => setSyncCameraMode("joinAnswer") : undefined}
          players={game.players}
          remainingCount={remainingCount}
          syncMessage={syncMessage}
          syncQrText={game.mode === "sync" && syncRole === "host" ? syncQrText : ""}
        />
      ) : null}

      {game.phase === "allocationHandoff" && allocationPlayer ? (
        <HandoffPanel ariaLabel="Allocation handoff" buttonLabel="Begin allocation" onContinue={startLocalAllocationTurn} />
      ) : null}

      {game.phase === "turnHandoff" && currentTurnPlayer ? (
        <HandoffPanel ariaLabel="Turn handoff" buttonLabel="Begin turn" onContinue={startLocalTurn} />
      ) : null}

      {canShowConfirm && viewerPendingTerritory && active ? (
        <ConfirmPickDialog
          onCancel={cancelPendingPick}
          onConfirm={confirmPendingPick}
          territory={viewerPendingTerritory}
        />
      ) : null}

      {spyTargetTerritory && spyCapturePercent !== null ? (
        <SpyConfirmDialog
          capturePercent={spyCapturePercent}
          onCancel={cancelTurnSpy}
          onConfirm={confirmTurnSpy}
          territory={spyTargetTerritory}
        />
      ) : null}

      {spyNoticeTerritory && spyNoticePlayer ? (
        <SpyCaptureDialog
          onClose={() => setSpyCaptureNotice(null)}
          player={spyNoticePlayer}
          territory={spyNoticeTerritory}
        />
      ) : null}

      {blockingResultTerritory && blockingResultPlayer ? (
        <PickResultDialog
          activePlayer={blockingResultPlayer}
          onClose={nextDraftTurn}
          resultKey={`local:${blockingResultPlayer.id}:${blockingResultTerritory.id}`}
          territory={blockingResultTerritory}
        />
      ) : null}

      {noticeTerritory && noticePlayer ? (
        <PickResultDialog
          activePlayer={noticePlayer}
          onClose={dismissNotice}
          resultKey={syncDraftNotice?.key ?? `sync:${noticePlayer.id}:${noticeTerritory.id}`}
          territory={noticeTerritory}
        />
      ) : null}

      {syncCameraMode ? (
        <QrScanner
          onCancel={() => setSyncCameraMode(null)}
          onScan={syncCameraMode === "hostOffer" ? scanHostOffer : acceptJoinAnswer}
          title={syncCameraMode === "hostOffer" ? "Scan host" : "Scan answer"}
        />
      ) : null}

      {isEndGamePromptOpen ? (
        <DecisionDialog
          message="End this game and return home?"
          onCancel={() => setIsEndGamePromptOpen(false)}
          onConfirm={endGame}
        />
      ) : null}

      {isRestartGamePromptOpen ? (
        <DecisionDialog
          confirmLabel="Restart game"
          message="Restart this game and return to setup?"
          onCancel={() => setIsRestartGamePromptOpen(false)}
          onConfirm={restartPausedGame}
        />
      ) : null}

      {syncJoinerBlocked ? (
        <SyncSessionBlocker
          onHome={resetAppToHome}
          session={syncSession}
        />
      ) : null}
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
              <span className="player-dot" style={{ background: colorCss(slot.color) }} />
              <strong>{slot.name}</strong>
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
        <SegmentedControl
          disabled={!canControl}
          options={(["snake", "roundRobin", "random"] as DraftStyle[]).map((value) => ({ value, label: DRAFT_STYLE_LABELS[value] }))}
          value={config.draftStyle}
          onChange={(value) => onUpdateConfig({ draftStyle: value as DraftStyle })}
        />
        <div className="time-select-grid">
          <SelectField
            disabled={!canControl || config.draftStyle === "random"}
            label="PICK TIME"
            options={PICK_TIME_LIMITS.map((value) => ({ value: String(value), label: formatTimerOption(value) }))}
            value={String(config.pickTimeLimit)}
            onChange={(value) => onUpdateConfig({ pickTimeLimit: Number(value) as PickTimeLimit })}
          />
          <SelectField
            disabled={!canControl}
            label="TROOP TIME"
            options={TROOP_ALLOCATION_TIME_LIMITS.map((value) => ({ value: String(value), label: formatTroopTimerOption(value) }))}
            value={String(config.troopAllocationTimeLimit)}
            onChange={(value) => onUpdateConfig({ troopAllocationTimeLimit: Number(value) as TroopAllocationTimeLimit })}
          />
        </div>
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
    <section className="game-controls-panel allocation-panel">
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
  onDismissSpy,
  onFortify,
  onReinforce,
  onSpy,
  player,
  stage,
  spyReturnStage,
}: {
  canSpy: boolean;
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

  return (
    <section className="game-controls-panel turn-action-panel">
      <button className="troop-icon-button turn-spy-button" type="button" onClick={onSpy} disabled={!canSpy} aria-label="Spy">
        <TroopIconImage src={spyIconSrc(player.color)} />
      </button>
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
  onAdjustTroop,
  onFinish,
  player,
  reinforcement,
  selectedTerritory,
}: {
  allocation: GameState["allocation"];
  canFinish: boolean;
  onAdjustTroop: (troopType: TroopType, delta: 1 | -1) => void;
  onFinish: () => void;
  player: GamePlayer;
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
  const canAddAny = MIXTURE_TROOP_TYPES.some(canAddType);
  const canRemoveAny = MIXTURE_TROOP_TYPES.some(canRemoveType);

  return (
    <section className="game-controls-panel allocation-panel reinforcement-panel">
      <div className="allocation-controls">
        {selectedTerritory && selectedTroops ? (
          <>
            <div className="troop-action-row three-troops">
              <span className="troop-row-spacer" aria-hidden="true" />
              <span className="troop-row-affordance" data-muted={canAddAny ? undefined : "true"} aria-hidden="true">
                <Plus size={17} />
              </span>
              <div className="troop-action-icons three-troops">
                {MIXTURE_TROOP_TYPES.map((troopType) => (
                  <button className="troop-icon-button" type="button" key={troopType} onClick={() => onAdjustTroop(troopType, 1)} disabled={!canAddType(troopType)} aria-label={`Add ${troopType}`}>
                    <TroopIconCount
                      count={remaining[troopType]}
                      label={`${troopName(player.color, troopType)} remaining: ${remaining[troopType]}`}
                      player={player}
                      troopType={troopType}
                    />
                  </button>
                ))}
              </div>
              <span className="troop-row-spacer" aria-hidden="true" />
            </div>
            <div className="allocation-target">
              <strong>{selectedTerritory.name}</strong>
            </div>
            <div className="troop-action-row three-troops">
              <span className="troop-row-spacer" aria-hidden="true" />
              <span className="troop-row-affordance" data-muted={canRemoveAny ? undefined : "true"} aria-hidden="true">
                <Minus size={17} />
              </span>
              <div className="troop-action-icons three-troops">
                {MIXTURE_TROOP_TYPES.map((troopType) => (
                  <button className="troop-icon-button" type="button" key={troopType} onClick={() => onAdjustTroop(troopType, -1)} disabled={!canRemoveType(troopType)} aria-label={`Remove ${troopType}`}>
                    <TroopIconCount
                      count={selectedTroops[troopType]}
                      label={`${troopName(player.color, troopType)} added here: ${selectedTroops[troopType]}`}
                      player={player}
                      troopType={troopType}
                    />
                  </button>
                ))}
              </div>
              <span className="troop-row-spacer" aria-hidden="true" />
            </div>
          </>
        ) : (
          <div className="allocation-target">
            <strong>Select a territory</strong>
          </div>
        )}
        <button className="primary icon-text-button wide-button" type="button" onClick={onFinish} disabled={!canFinish} aria-label="Finish reinforcements">
          <Check size={20} />
        </button>
      </div>
    </section>
  );
}

function GameTopBar({
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
    <div className="game-top-bar" data-tone={light ? "light" : "dark"} style={{ "--bar-color": colorCss(player?.color ?? null) } as CSSProperties}>
      <button className="icon-button game-top-button" type="button" onClick={onExit} aria-label="End game">
        <X size={18} />
      </button>
      <button
        className="game-top-player"
        type="button"
        onClick={onTitlePress}
        disabled={!onTitlePress}
        aria-label={onTitlePress ? "Change viewer" : undefined}
      >
        <strong>{title}</strong>
        {detail ? <span>{detail}</span> : null}
      </button>
      <div className="game-top-tools">
        {timerRemaining ? <span className="timer-chip game-top-timer">{Math.ceil(timerRemaining / 1000)}s</span> : null}
        {onPause ? (
          <button className="icon-button game-top-button" type="button" onClick={onPause} aria-label={pauseLabel ?? "Pause"}>
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
  const canAddAny = TROOP_TYPES.some(canAddType);
  const canRemoveAny = TROOP_TYPES.some(canRemoveType);

  return (
    <div className="allocation-controls">
      {selectedTerritoryId && selectedTroops ? (
        <>
          <div className="troop-action-row">
            <span className="troop-row-spacer" aria-hidden="true" />
            <span className="troop-row-affordance" data-muted={canAddAny ? undefined : "true"} aria-hidden="true">
              <Plus size={17} />
            </span>
            <div className="troop-action-icons">
              {TROOP_TYPES.map((troopType) => (
                <button className="troop-icon-button" type="button" key={troopType} onClick={() => onAdjustTroop(troopType, 1)} disabled={!canAddType(troopType)} aria-label={`Add ${troopType}`}>
                  <TroopIconCount
                    count={remaining[troopType]}
                    label={`${troopName(player.color, troopType)} remaining: ${remaining[troopType]}`}
                    player={player}
                    troopType={troopType}
                  />
                </button>
              ))}
            </div>
            <span className="troop-row-spacer" aria-hidden="true" />
          </div>
          <div className="allocation-target">
            <strong>{selectedTerritory?.name ?? "Select a territory"}</strong>
          </div>
          <div className="troop-action-row">
            <span className="troop-row-spacer" aria-hidden="true" />
            <span className="troop-row-affordance" data-muted={canRemoveAny ? undefined : "true"} aria-hidden="true">
              <Minus size={17} />
            </span>
            <div className="troop-action-icons">
              {TROOP_TYPES.map((troopType) => (
                <button className="troop-icon-button" type="button" key={troopType} onClick={() => onAdjustTroop(troopType, -1)} disabled={!canRemoveType(troopType)} aria-label={`Remove ${troopType}`}>
                  <TroopIconCount
                    count={selectedTroops[troopType]}
                    label={`${troopName(player.color, troopType)} on territory: ${selectedTroops[troopType]}`}
                    player={player}
                    troopType={troopType}
                  />
                </button>
              ))}
            </div>
            <span className="troop-row-spacer" aria-hidden="true" />
          </div>
        </>
      ) : (
        <div className="allocation-target">
          <strong>Select a territory</strong>
        </div>
      )}
      <button className="primary icon-text-button wide-button" type="button" onClick={onFinish} disabled={!canFinish} aria-label="Ready">
        <Check size={20} />
      </button>
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
        <image
          className="army-triangle-icon"
          height={iconSize}
          href={troopIconSrc(player.color, troopType)}
          key={troopType}
          width={iconSize}
          x={corners[troopType].x - iconSize / 2}
          y={corners[troopType].y - iconSize / 2}
        />
      ))}
      <g className="army-triangle-marker">
        <circle className="army-triangle-marker-halo" cx={markerPoint.x} cy={markerPoint.y} r="16" />
        <circle className="army-triangle-marker-handle" cx={markerPoint.x} cy={markerPoint.y} r="10" />
        <circle className="army-triangle-marker-dot" cx={markerPoint.x} cy={markerPoint.y} r="3" />
      </g>
    </svg>
  );
}

function HandoffPanel({ ariaLabel, buttonLabel, onContinue }: { ariaLabel: string; buttonLabel: string; onContinue: () => void }) {
  return (
    <div className="modal-scrim handoff-scrim">
      <section className="modal-panel handoff-panel" role="dialog" aria-label={ariaLabel}>
        <button className="primary icon-text-button wide-button" type="button" onClick={onContinue} aria-label={buttonLabel}>
          <ArrowRight size={20} />
        </button>
      </section>
    </div>
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
    <section className="game-controls-panel allocation-waiting-panel" role="status">
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
            <span className="player-dot" style={{ background: colorCss(player.color) }} />
            <strong>{player.name}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function GameMapPanel({
  players,
  selectedTerritory,
  troopBreakdown,
  troopPlayerId,
  viewerId,
}: {
  players: GamePlayer[];
  selectedTerritory: GeneratedTerritoryData | null;
  troopBreakdown: TroopCounts | null;
  troopPlayerId?: string | null;
  viewerId: string | null;
}) {
  const troopPlayer = players.find((player) => player.id === (troopPlayerId ?? viewerId)) ?? players[0] ?? null;

  return (
    <section className="game-controls-panel game-map-panel">
      {selectedTerritory ? <strong className="selected-territory-name">{selectedTerritory.name}</strong> : null}
      {selectedTerritory && troopBreakdown && troopPlayer ? <TroopCountRow counts={troopBreakdown} player={troopPlayer} /> : null}
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

function TroopIconCount({
  className = "",
  count,
  label,
  player,
  troopType,
}: {
  className?: string;
  count: number;
  label?: string;
  player: GamePlayer;
  troopType: TroopType;
}) {
  const name = troopName(player.color, troopType);

  return (
    <span className={`troop-icon-count${className ? ` ${className}` : ""}`} aria-label={label ?? `${name}: ${count}`}>
      <TroopIconImage src={troopIconSrc(player.color, troopType)} />
      <span className="troop-count-bubble">{count}</span>
    </span>
  );
}

function TroopIconImage({ src }: { src: string }) {
  return <img alt="" draggable={false} src={src} />;
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
  remainingCount,
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
  remainingCount: number;
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
        <p className="muted">{remainingCount} territories remain.</p>
        <div className="player-list paused-list">
          {players.map((player) => (
            <article className="player-row compact-row" data-player-status={player.connectionStatus} key={player.id}>
              <span className="player-dot" style={{ background: colorCss(player.color) }} />
              <strong>{player.name}</strong>
              {mode === "sync" ? <span className="connection-label">{player.connectionStatus}</span> : null}
              {canRemove || mode === "sync" ? (
                player.id === localPlayerId ? (
                  <span className="icon-button-spacer" aria-hidden="true" />
                ) : (
                  canRemove ? (
                    <button className="icon-button danger" type="button" onClick={() => onRemovePlayer(player.id)} aria-label={`Remove ${player.name}`}>
                      <Trash2 size={16} />
                    </button>
                  ) : (
                    <span className="icon-button-spacer" aria-hidden="true" />
                  )
                )
              ) : null}
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

function ConfirmPickDialog({
  onCancel,
  onConfirm,
  territory,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  territory: GeneratedTerritoryData;
}) {
  return (
    <div className="draft-sheet-scrim">
      <section className="modal-panel draft-sheet" role="dialog" aria-label="Confirm territory">
        <h2>{territory.name}</h2>
        <div className="modal-actions">
          <button className="icon-button danger large" type="button" onClick={onCancel} aria-label="Cancel pick">
            <X size={24} />
          </button>
          <button className="icon-button primary large" type="button" onClick={onConfirm} aria-label="Confirm pick">
            <Check size={24} />
          </button>
        </div>
      </section>
    </div>
  );
}

function PickResultDialog({
  activePlayer,
  onClose,
  resultKey,
  territory,
}: {
  activePlayer: GamePlayer;
  onClose: () => void;
  resultKey: string;
  territory: GeneratedTerritoryData;
}) {
  const closedRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const closeOnce = useCallback(() => {
    if (closedRef.current) {
      return;
    }

    closedRef.current = true;
    onCloseRef.current();
  }, []);

  useEffect(() => {
    closedRef.current = false;
    const timeout = window.setTimeout(closeOnce, 1000);
    return () => window.clearTimeout(timeout);
  }, [closeOnce, resultKey]);

  return (
    <div className="draft-sheet-scrim pick-result-scrim" onClick={closeOnce}>
      <section className="modal-panel draft-sheet pick-result-modal" role="status" aria-live="polite">
        <p className="muted">{activePlayer.name} drafted</p>
        <h2>{territory.name}</h2>
        <div className="draft-sheet-action-spacer" aria-hidden="true" />
      </section>
    </div>
  );
}

function SpyConfirmDialog({
  capturePercent,
  onCancel,
  onConfirm,
  territory,
}: {
  capturePercent: number;
  onCancel: () => void;
  onConfirm: () => void;
  territory: GeneratedTerritoryData;
}) {
  return (
    <div className="draft-sheet-scrim turn-sheet-scrim">
      <section className="modal-panel draft-sheet spy-sheet" role="dialog" aria-label="Confirm spy">
        <h2>{territory.name}</h2>
        <p className="muted">{capturePercent}% captured</p>
        <div className="modal-actions">
          <button className="icon-button danger large" type="button" onClick={onCancel} aria-label="Cancel spy">
            <X size={24} />
          </button>
          <button className="icon-button primary large" type="button" onClick={onConfirm} aria-label="Send spy">
            <Check size={24} />
          </button>
        </div>
      </section>
    </div>
  );
}

function SpyCaptureDialog({
  onClose,
  player,
  territory,
}: {
  onClose: () => void;
  player: GamePlayer;
  territory: GeneratedTerritoryData;
}) {
  const closedRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const closeOnce = useCallback(() => {
    if (closedRef.current) {
      return;
    }

    closedRef.current = true;
    onCloseRef.current();
  }, []);

  useEffect(() => {
    closedRef.current = false;
    const timeout = window.setTimeout(closeOnce, 1600);
    return () => window.clearTimeout(timeout);
  }, [closeOnce, player.id, territory.id]);

  return (
    <div className="draft-sheet-scrim turn-sheet-scrim pick-result-scrim" onClick={closeOnce}>
      <section className="modal-panel draft-sheet spy-sheet" role="status" aria-live="polite">
        <p className="muted">{player.name}'s spy was captured in</p>
        <h2>{territory.name}</h2>
        <div className="draft-sheet-action-spacer" aria-hidden="true" />
      </section>
    </div>
  );
}

function DecisionDialog({
  confirmLabel = "End game",
  message,
  onCancel,
  onConfirm,
}: {
  confirmLabel?: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-scrim">
      <section className="modal-panel decision-modal" role="dialog" aria-label={message}>
        <h2>{message}</h2>
        <div className="modal-actions">
          <button className="icon-button large" type="button" onClick={onCancel} aria-label="Cancel">
            <X size={24} />
          </button>
          <button className="icon-button danger large" type="button" onClick={onConfirm} aria-label={confirmLabel}>
            <Check size={24} />
          </button>
        </div>
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

function SegmentedControl({
  disabled = false,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  value: string;
}) {
  return (
    <div className="segmented-field">
      <div className="segmented-control">
        {options.map((option) => (
          <button
            className={value === option.value ? "selected" : ""}
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectField({
  disabled = false,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  value: string;
}) {
  return (
    <label className="select-field">
      <span>{label}</span>
      <select disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function QrPanel({ text }: { text: string }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let alive = true;

    QRCode.toString(text, { errorCorrectionLevel: "L", margin: 4, type: "svg" })
      .then((nextSvg) => {
        if (alive) {
          setSvg(nextSvg.replace("<svg ", '<svg shape-rendering="crispEdges" '));
        }
      })
      .catch(() => {
        if (alive) {
          setSvg("");
        }
      });

    return () => {
      alive = false;
    };
  }, [text]);

  return (
    <div className="qr-panel">
      {svg ? <div className="qr-code" role="img" aria-label="QR code" data-qr-text={text} dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="qr-placeholder" />}
    </div>
  );
}

function QrScanner({
  onCancel,
  onScan,
  title,
}: {
  onCancel: () => void;
  onScan: (value: string) => void;
  title: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scannedRef = useRef(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Looking for QR");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    let frame = 0;
    let scanTimeout = 0;
    let stream: MediaStream | null = null;
    const scanSize = 1024;
    const detectorConstructor = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    let detector: BarcodeDetectorInstance | null = null;

    try {
      detector = detectorConstructor ? new detectorConstructor({ formats: ["qr_code"] }) : null;
    } catch {
      detector = null;
    }

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            aspectRatio: { ideal: 1 },
            facingMode: { ideal: "environment" },
            height: { ideal: 1440 },
            width: { ideal: 1440 },
          },
        });
        const [track] = stream.getVideoTracks();
        trackRef.current = track ?? null;

        if (track) {
          const capabilities = track.getCapabilities?.() as ExtendedMediaTrackCapabilities | undefined;
          const advanced: ExtendedMediaTrackConstraintSet[] = [];

          if (capabilities?.focusMode?.includes("continuous")) {
            advanced.push({ focusMode: "continuous" });
          }

          if (capabilities?.torch) {
            setTorchSupported(true);
          }

          if (advanced.length > 0) {
            await track.applyConstraints({ advanced }).catch(() => undefined);
          }
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          scan();
        }
      } catch {
        setError("Camera unavailable");
        setStatus("");
      }
    }

    async function readQrCode(canvas: HTMLCanvasElement, image: ImageData) {
      if (detector) {
        const results = await detector.detect(canvas).catch(() => []);
        const value = results[0]?.rawValue;

        if (value) {
          return value;
        }
      }

      return jsQR(image.data, image.width, image.height, {
        inversionAttempts: "attemptBoth",
      })?.data ?? null;
    }

    async function scanFrame() {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || scannedRef.current) {
        return;
      }

      if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
        const sourceSize = Math.min(video.videoWidth, video.videoHeight);
        const sourceX = Math.floor((video.videoWidth - sourceSize) / 2);
        const sourceY = Math.floor((video.videoHeight - sourceSize) / 2);
        canvas.width = scanSize;
        canvas.height = scanSize;
        const context = canvas.getContext("2d", { willReadFrequently: true });

        if (context) {
          // Match the visible scanner square so decoding ignores cropped camera edges.
          context.drawImage(video, sourceX, sourceY, sourceSize, sourceSize, 0, 0, scanSize, scanSize);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = await readQrCode(canvas, image);

          if (code) {
            scannedRef.current = true;
            setStatus("QR found");
            scanTimeout = window.setTimeout(() => onScan(code), 120);
            return;
          }
        }
      }

      frame = window.requestAnimationFrame(scan);
    }

    function scan() {
      void scanFrame();
    }

    void startCamera();

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(scanTimeout);
      stream?.getTracks().forEach((track) => track.stop());
      trackRef.current = null;
    };
  }, [onScan]);

  async function toggleTorch() {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    const nextTorch = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: nextTorch } as ExtendedMediaTrackConstraintSet] }).catch(() => undefined);
    setTorchOn(nextTorch);
  }

  function handlePaste(event: ReactClipboardEvent<HTMLElement>) {
    const value = event.clipboardData.getData("text").trim();
    if (!value || scannedRef.current) {
      return;
    }

    scannedRef.current = true;
    setStatus("QR found");
    onScan(value);
  }

  return (
    <div className="modal-scrim" role="presentation">
      <section className="scanner-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-title" onPaste={handlePaste}>
        <div className="panel-header">
          <h1 id="scanner-title">{title}</h1>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="Cancel">
            <X size={18} />
          </button>
        </div>
        <div className="scanner-frame">
          <video ref={videoRef} muted playsInline />
          <span className="scanner-target" aria-hidden="true" />
        </div>
        {torchSupported ? (
          <button className="secondary wide-button" type="button" onClick={toggleTorch}>
            {torchOn ? "Torch off" : "Torch on"}
          </button>
        ) : null}
        <canvas ref={canvasRef} hidden />
        <p className="sync-status">{error || status}</p>
      </section>
    </div>
  );
}

function createTroopMarkers(game: GameState, allocationPlayerId: string | null, gameMapViewerId: string | null, turnViewerId: string | null) {
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

function isLightColor(color: PlayerColor | null) {
  return color === "green" || color === "blue" || color === "yellow";
}

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

function troopSide(color: PlayerColor | null) {
  return isLightColor(color) ? "light" : "dark";
}

function troopIconSrc(color: PlayerColor | null, troopType: TroopType) {
  return `./troops/icons/${TROOP_ICON_BY_SIDE[troopSide(color)][troopType]}.png`;
}

function spyIconSrc(color: PlayerColor | null) {
  return `./troops/icons/${isLightColor(color) ? "smeagul" : "crow"}.png`;
}

function troopName(color: PlayerColor | null, troopType: TroopType) {
  return TROOP_NAME_BY_SIDE[troopSide(color)][troopType];
}

function syncDraftNoticeFromOwnershipChange(previous: GameState, next: GameState): Omit<SyncDraftNotice, "key"> | null {
  if (previous.mode !== "sync" || next.mode !== "sync" || !previous.draft || !next.draft || next.phase !== "draft") {
    return null;
  }

  // Treat a newly owned territory as a local drafted notification.
  for (const territory of generatedMapData.territories) {
    const previousOwner = previous.draft.ownership[territory.id];
    const nextOwner = next.draft.ownership[territory.id];

    if (!previousOwner && nextOwner) {
      return {
        playerId: nextOwner,
        territoryId: territory.id,
      };
    }
  }

  return null;
}

function spyCaptureNoticeFromTurnChange(previous: GameState, next: GameState, localPlayerId: string | null): Omit<SpyCaptureNotice, "key"> | null {
  if (!next.turn || !next.draft) {
    return null;
  }

  for (const [playerId, spy] of Object.entries(next.turn.spies)) {
    const previousSpy = previous.turn?.spies[playerId];
    const defenderId = spy.capturedTerritoryId ? next.draft.ownership[spy.capturedTerritoryId] : null;
    const shouldShow = next.mode === "local" || playerId === localPlayerId || defenderId === localPlayerId;

    if (
      previousSpy?.available !== false &&
      spy.available === false &&
      spy.capturedTerritoryId &&
      shouldShow
    ) {
      return {
        playerId,
        territoryId: spy.capturedTerritoryId,
      };
    }
  }

  return null;
}

function syncSnapshotForViewer(game: GameState, viewerId: string): GameState {
  if (game.phase !== "turn" || !game.turn || game.turn.currentPlayerId === viewerId) {
    return game;
  }

  return {
    ...game,
    turn: {
      ...game.turn,
      stage: publicTurnStage(game.turn.stage, game.turn.spyReturnStage),
      spyReturnStage: null,
      spyIntel: null,
      reinforcement: null,
    },
  };
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

function colorLabel(color: PlayerColor) {
  switch (color) {
    case "green":
      return "Green";
    case "blue":
      return "Blue";
    case "yellow":
      return "Yellow";
    case "red":
      return "Red";
    case "purple":
      return "Purple";
    case "black":
      return "Black";
  }
}

function colorCss(color: PlayerColor | null) {
  switch (color) {
    case "green":
      return "#5ca76b";
    case "blue":
      return "#5fb7c0";
    case "yellow":
      return "#d9c75f";
    case "red":
      return "#b3444a";
    case "purple":
      return "#8a5fc4";
    case "black":
      return "#3f3f3f";
    default:
      return "#efe9d9";
  }
}

export default App;
