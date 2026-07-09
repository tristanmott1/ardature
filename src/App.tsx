import { type CSSProperties, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import {
  Check,
  GripVertical,
  Pause,
  Play,
  Plus,
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
  PLAYER_COLORS,
  TROOP_ALLOCATION_TIME_LIMITS,
  activePlayer,
  beginDraftTimer,
  canPickTerritory,
  clearDraftTimer,
  clearLocalGame,
  confirmTerritoryPick,
  createInitialGameState,
  createOwnershipMap,
  createPlayer,
  createTerritoryStates,
  formatTimerOption,
  formatTroopTimerOption,
  isSetupValid,
  pauseDraftTimer,
  randomPickForActivePlayer,
  readLocalGame,
  remainingTerritoryIds,
  removePlayerFromDraft,
  saveLocalGame,
  startDraft,
} from "./game/gameState";
import type {
  DraftStyle,
  GameConfig,
  GamePlayer,
  GameState,
  PickTimeLimit,
  PlayerColor,
  TroopAllocationTimeLimit,
} from "./game/gameTypes";
import { generatedMapData } from "./map/generated/mapData";
import { MapView } from "./map/components/MapView";
import type { GeneratedTerritoryData, MapBounds } from "./map/mapTypes";
import { isArdatureSyncMessage } from "./sync/syncMessages";
import { SyncHostTransport, SyncJoinTransport, type SyncConnectionStatus, type SyncWireMessage } from "./sync/syncTransport";

type SyncRole = "host" | "joiner" | null;

type SyncCameraMode = "hostOffer" | "joinAnswer" | null;

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

function App() {
  const [game, setGame] = useState<GameState>(() => readLocalGame() ?? createInitialGameState());
  const [draftName, setDraftName] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [syncEntryOpen, setSyncEntryOpen] = useState(false);
  const [syncName, setSyncName] = useState("");
  const [syncColor, setSyncColor] = useState<PlayerColor | null>("green");
  const [syncRole, setSyncRole] = useState<SyncRole>(null);
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const [syncQrText, setSyncQrText] = useState("");
  const [syncAnswerText, setSyncAnswerText] = useState("");
  const [syncCameraMode, setSyncCameraMode] = useState<SyncCameraMode>(null);
  const [syncMessage, setSyncMessage] = useState("");
  const [isAcceptingAnswer, setIsAcceptingAnswer] = useState(false);
  const [dismissedNoticeKey, setDismissedNoticeKey] = useState("");
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null);
  const [isEndGamePromptOpen, setIsEndGamePromptOpen] = useState(false);
  const hostTransportRef = useRef<SyncHostTransport | null>(null);
  const joinTransportRef = useRef<SyncJoinTransport | null>(null);
  const previousPhaseRef = useRef(game.phase);
  const latestGameRef = useRef(game);
  const latestSyncRoleRef = useRef(syncRole);
  const latestLocalPlayerIdRef = useRef(localPlayerId);
  const active = activePlayer(game);
  const ownership = game.draft?.ownership ?? createOwnershipMap();
  const selectedTerritoryId = game.draft?.pendingTerritoryId ?? null;
  const territoryStates = useMemo(
    () => createTerritoryStates(game.players, ownership, selectedTerritoryId),
    [game.players, ownership, selectedTerritoryId],
  );
  const remainingCount = game.draft ? remainingTerritoryIds(game.draft.ownership).length : generatedMapData.territories.length;
  const blockingResultTerritory = game.draft?.resultTerritoryId
    ? generatedMapData.territories.find((territory) => territory.id === game.draft?.resultTerritoryId) ?? null
    : null;
  const blockingResultPlayer = game.draft?.resultPlayerId
    ? game.players.find((player) => player.id === game.draft?.resultPlayerId) ?? null
    : null;
  const noticeKey = game.draft?.noticeTerritoryId && game.draft.noticePlayerId
    ? `${game.draft.noticePlayerId}:${game.draft.noticeTerritoryId}`
    : "";
  const noticeTerritory = noticeKey && noticeKey !== dismissedNoticeKey && game.draft?.noticeTerritoryId
    ? generatedMapData.territories.find((territory) => territory.id === game.draft?.noticeTerritoryId) ?? null
    : null;
  const noticePlayer = noticeKey && noticeKey !== dismissedNoticeKey && game.draft?.noticePlayerId
    ? game.players.find((player) => player.id === game.draft?.noticePlayerId) ?? null
    : null;
  const pendingTerritory = game.draft?.pendingTerritoryId
    ? generatedMapData.territories.find((territory) => territory.id === game.draft?.pendingTerritoryId) ?? null
    : null;
  const timerRemaining = game.phase === "draft" && game.draft?.timerEndsAt
    ? Math.max(0, game.draft.timerEndsAt - now)
    : game.draft?.timerRemainingMs ?? null;
  const canControlSetup = game.mode === "local" || syncRole === "host";
  const canControlActivePlayer = game.mode === "local" || (game.mode === "sync" && active?.id === localPlayerId);
  const canPick = game.phase === "draft" &&
    canControlActivePlayer &&
    Boolean(active) &&
    !game.draft?.pendingTerritoryId &&
    !game.draft?.resultTerritoryId;
  const canShowConfirm = Boolean(pendingTerritory && active && canControlActivePlayer);
  const showDraftControls = game.phase === "draft" &&
    !pendingTerritory &&
    !blockingResultTerritory &&
    !noticeTerritory &&
    !syncCameraMode &&
    !isEndGamePromptOpen;

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
    if (game.mode === "local") {
      saveLocalGame(game);
    }
  }, [game]);

  useEffect(() => {
    if (game.mode === "sync" && syncRole === "host") {
      hostTransportRef.current?.broadcast({ type: "gameState", game });
    }
  }, [game, syncRole]);

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
    if (game.phase !== "draft" || !game.draft?.timerEndsAt) {
      return undefined;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [game.phase, game.draft?.timerEndsAt]);

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

      return current.draft.pendingTerritoryId
        ? confirmTerritoryPick(current, current.draft.pendingTerritoryId, Date.now())
        : randomPickForActivePlayer(current, Date.now());
    });
  }, [game.mode, game.phase, game.draft?.timerEndsAt, now, syncRole]);

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
    setSyncEntryOpen(false);
    setSyncRole(null);
    setLocalPlayerId(null);
    setGame({
      ...createInitialGameState(),
      phase: "setup",
      mode: "local",
    });
  }

  function openSyncEntry() {
    clearLocalGame();
    setSyncEntryOpen(true);
    setSyncColor("green");
    setGame(createInitialGameState());
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
    setSyncRole("host");
    setLocalPlayerId(hostPlayer.id);
    setSyncAnswerText("");
    setSyncEntryOpen(false);
    setGame({
      ...createInitialGameState(),
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

  async function acceptJoinAnswer(value: string) {
    const hostTransport = hostTransportRef.current;

    if (!hostTransport || syncRole !== "host" || isAcceptingAnswer) {
      return;
    }

    setSyncCameraMode(null);
    setIsAcceptingAnswer(true);
    setSyncMessage("QR found. Accepting answer");
    try {
      const joinedPlayer = await hostTransport.acceptAnswer(value);

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
      await createHostOffer(`${joinedPlayer.name} joined`);
    } catch (error) {
      const message = formatQrHandshakeError(error);

      setSyncMessage(message);
      await createHostOffer(message);
    } finally {
      setIsAcceptingAnswer(false);
    }
  }

  async function scanHostOffer(value: string) {
    const name = syncName.trim();

    if (!name || !syncColor) {
      setSyncMessage("Name and color first");
      return;
    }

    const localPlayer = { ...createPlayer(name), color: syncColor };
    const joinTransport = new SyncJoinTransport({
      onClosed: () => setSyncMessage("Host disconnected"),
      onMessage: handleJoinerMessage,
      onOpen: () => {
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
    setSyncMessage("QR found. Creating answer");
    try {
      const answer = await joinTransport.createAnswer(value, localPlayer);

      endSyncTransports();
      joinTransportRef.current = joinTransport;
      clearLocalGame();
      setSyncRole("joiner");
      setLocalPlayerId(localPlayer.id);
      setSyncAnswerText(answer.answerText);
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

  const handleHostMessage = useCallback((playerId: string, rawMessage: SyncWireMessage) => {
    if (!isArdatureSyncMessage(rawMessage)) {
      return;
    }

    if (rawMessage.type === "profileUpdate") {
      setGame((current) => ({
        ...current,
        players: current.players.map((player) => {
          if (player.id !== playerId) {
            return player;
          }

          return {
            ...player,
            name: rawMessage.name !== undefined && !player.nameLocked ? rawMessage.name.trim() : player.name,
            color: rawMessage.color !== undefined && !player.colorLocked ? rawMessage.color : player.color,
            connectionStatus: "connected",
          };
        }),
      }));
      return;
    }

    if (rawMessage.type === "draftPending") {
      setGame((current) => {
        if (activePlayer(current)?.id !== playerId || !current.draft || current.phase !== "draft") {
          return current;
        }

        return {
          ...current,
          draft: {
            ...current.draft,
            pendingTerritoryId: rawMessage.territoryId,
          },
        };
      });
      return;
    }

    if (rawMessage.type === "draftConfirm") {
      setGame((current) => activePlayer(current)?.id === playerId
        ? confirmTerritoryPick(current, rawMessage.territoryId, Date.now())
        : current);
      return;
    }

    if (rawMessage.type === "quit") {
      hostTransportRef.current?.removePeer(playerId);
      setGame((current) => {
        const next = removePlayerFromDraft(current, playerId);
        return current.phase === "draft" && next.phase !== "home" ? pauseSyncGame(next) : next;
      });
    }
  }, []);

  const handleJoinerMessage = useCallback((_playerId: string, rawMessage: SyncWireMessage) => {
    if (!isArdatureSyncMessage(rawMessage) || rawMessage.type !== "gameState") {
      return;
    }

    setGame(rawMessage.game);
  }, []);

  const handleHostPeerClosed = useCallback((playerId: string) => {
    setGame((current) => markSyncPlayerStatus(current, playerId, "disconnected"));
  }, []);

  const handleHostPeerStatus = useCallback((playerId: string, status: SyncConnectionStatus) => {
    setGame((current) => {
      const playerStatus = status === "connected" ? "connected" : status === "reconnecting" ? "reconnecting" : "disconnected";
      const next = markSyncPlayerStatus(current, playerId, playerStatus);
      return status !== "connected" && current.phase === "draft" ? pauseSyncGame(next) : next;
    });
  }, []);

  const handleJoinerConnectionStatus = useCallback((status: SyncConnectionStatus) => {
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
    if (game.mode === "sync" && syncRole === "joiner") {
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

    setGame((current) => ({
      ...current,
      config: { ...current.config, ...updates },
    }));
  }

  function beginDraft() {
    if (!canControlSetup || !isSetupValid(game.players)) {
      return;
    }

    const draft = startDraft(game.players, game.config);
    const phase = remainingTerritoryIds(draft.ownership).length === 0 ? "review" : "draft";
    setGame({
      ...game,
      phase,
      draft: phase === "draft" ? beginDraftTimer(draft, game.config, Date.now()) : draft,
    });
  }

  function pressTerritory(territoryId: string) {
    if (!canPickTerritory(game, territoryId)) {
      return;
    }

    if (game.mode === "sync" && syncRole === "joiner") {
      joinTransportRef.current?.send({ type: "draftPending", territoryId });
    }

    setGame((current) => current.draft
      ? {
          ...current,
          draft: {
            ...current.draft,
            pendingTerritoryId: territoryId,
          },
        }
      : current);
  }

  function cancelPendingPick() {
    if (game.mode === "sync" && syncRole === "joiner") {
      joinTransportRef.current?.send({ type: "draftPending", territoryId: null });
    }

    setGame((current) => current.draft
      ? {
          ...current,
          draft: {
            ...current.draft,
            pendingTerritoryId: null,
          },
        }
      : current);
  }

  function confirmPendingPick() {
    if (!game.draft?.pendingTerritoryId) {
      return;
    }

    if (game.mode === "sync" && syncRole === "joiner") {
      joinTransportRef.current?.send({ type: "draftConfirm", territoryId: game.draft.pendingTerritoryId });
      return;
    }

    setGame((current) => current.draft?.pendingTerritoryId
      ? confirmTerritoryPick(current, current.draft.pendingTerritoryId, Date.now())
      : current);
  }

  function nextDraftTurn() {
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

    setGame((current) => current.phase === "draft" && current.draft
      ? current.mode === "sync"
        ? pauseSyncGame(current)
        : {
            ...current,
            phase: "paused",
            draft: pauseDraftTimer(current.draft, Date.now()),
          }
      : current);
  }

  function resumeDraft() {
    setGame((current) => {
      if (current.phase !== "paused" || !current.draft) {
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
    if (game.mode === "sync" && syncRole === "joiner") {
      joinTransportRef.current?.send({ type: "quit" });
    }

    endSyncTransports();
    clearLocalGame();
    setSyncEntryOpen(false);
    setSyncRole(null);
    setLocalPlayerId(null);
    setSyncQrText("");
    setSyncAnswerText("");
    setSyncMessage("");
    setIsEndGamePromptOpen(false);
    setGame(createInitialGameState());
  }

  function dismissNotice() {
    if (noticeKey) {
      setDismissedNoticeKey(noticeKey);
    }
  }

  function endSyncTransports() {
    hostTransportRef.current?.close();
    joinTransportRef.current?.close();
    hostTransportRef.current = null;
    joinTransportRef.current = null;
  }

  return (
    <main
      className={`app-shell${showDraftControls ? " draft-layout" : ""}`}
      data-app-phase={game.phase}
      data-draft-controls={showDraftControls ? "visible" : "hidden"}
      data-sync-role={syncRole ?? "none"}
    >
      {showDraftControls ? (
        <DraftPanel
          activePlayer={active}
          canPause={game.mode === "local" || syncRole === "host"}
          onExit={returnHome}
          onPause={pauseDraft}
          remainingCount={remainingCount}
          timerRemaining={timerRemaining}
        />
      ) : null}

      <MapView
        mapData={generatedMapData}
        onTerritoryPress={canPick ? pressTerritory : undefined}
        selectedTerritoryId={selectedTerritoryId}
        territoryStates={territoryStates}
      />

      {game.phase === "home" && !syncEntryOpen ? (
        <HomePanel onStartLocal={startLocalSetup} onStartSync={openSyncEntry} />
      ) : null}

      {game.phase === "home" && syncEntryOpen ? (
        <SyncEntryPanel
          color={syncColor}
          message={syncMessage}
          name={syncName}
          onBack={returnHome}
          onColorChange={setSyncColor}
          onHost={beginSyncHost}
          onNameChange={setSyncName}
          onScan={() => setSyncCameraMode("hostOffer")}
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
          mode={game.mode}
          onExit={returnHome}
          onRemovePlayer={removePlayer}
          onResume={resumeDraft}
          players={game.players}
          remainingCount={remainingCount}
        />
      ) : null}

      {game.phase === "review" ? (
        <ReviewPanel onExit={returnHome} players={game.players} />
      ) : null}

      {canShowConfirm && pendingTerritory && active ? (
        <ConfirmPickDialog
          fillColor={generatedMapData.backgroundColor}
          onCancel={cancelPendingPick}
          onConfirm={confirmPendingPick}
          territory={pendingTerritory}
        />
      ) : null}

      {blockingResultTerritory && blockingResultPlayer ? (
        <PickResultDialog
          activePlayer={blockingResultPlayer}
          fillColor={colorCss(blockingResultPlayer.color)}
          onClose={nextDraftTurn}
          territory={blockingResultTerritory}
        />
      ) : null}

      {noticeTerritory && noticePlayer ? (
        <PickResultDialog
          activePlayer={noticePlayer}
          fillColor={colorCss(noticePlayer.color)}
          onClose={dismissNotice}
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
    </main>
  );
}

function HomePanel({ onStartLocal, onStartSync }: { onStartLocal: () => void; onStartSync: () => void }) {
  return (
    <section className="hud-panel home-panel">
      <div className="brand-row">
        <img src="./icon-192.png" alt="" />
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
  onHost,
  onNameChange,
  onScan,
}: {
  color: PlayerColor | null;
  message: string;
  name: string;
  onBack: () => void;
  onColorChange: (color: PlayerColor) => void;
  onHost: () => void;
  onNameChange: (name: string) => void;
  onScan: () => void;
}) {
  const ready = Boolean(name.trim() && color);

  return (
    <section className="hud-panel sync-entry-panel">
      <PanelHeader onClose={onBack} />
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
          <div className="setup-actions two-up">
            <button className="secondary icon-text-button" type="button" onClick={onRandomizePlayers} disabled={!canControl || players.length < 2}>
              <Shuffle size={18} />
              Randomize
            </button>
            <button className="secondary icon-text-button" type="button" onClick={onScanAnswer}>
              <ScanLine size={18} />
              Scan
            </button>
          </div>
        </div>
      ) : null}

      {mode === "sync" && syncRole === "joiner" && syncAnswerText ? (
        <QrPanel text={syncAnswerText} />
      ) : null}

      {syncMessage ? <p className="sync-status">{syncMessage}</p> : null}

      {mode === "local" ? (
        <div className="setup-actions">
          <button className="secondary icon-text-button" type="button" onClick={onRandomizePlayers} disabled={!canControl || players.length < 2}>
            <Shuffle size={18} />
            Randomize
          </button>
        </div>
      ) : null}

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
                <button className="icon-button danger" type="button" onClick={() => onRemovePlayer(player.id)} aria-label={`Remove ${player.name || "player"}`}>
                  <Trash2 size={16} />
                </button>
              ) : null}
            </article>
          );
        })}
      </div>

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

function DraftPanel({
  activePlayer,
  canPause,
  onExit,
  onPause,
  remainingCount,
  timerRemaining,
}: {
  activePlayer: GamePlayer | null;
  canPause: boolean;
  onExit: () => void;
  onPause: () => void;
  remainingCount: number;
  timerRemaining: number | null;
}) {
  return (
    <section className="hud-panel draft-panel compact-hud">
      <button className="icon-button danger" type="button" onClick={onExit} aria-label="End game">
        <X size={18} />
      </button>
      <div className="draft-status">
        <span className="player-dot" style={{ background: colorCss(activePlayer?.color ?? null) }} />
        <strong>{activePlayer?.name ?? "Draft"}</strong>
        <span>{remainingCount} left</span>
        {timerRemaining ? <span className="timer-chip">{Math.ceil(timerRemaining / 1000)}s</span> : null}
      </div>
      {canPause ? (
        <button className="icon-button" type="button" onClick={onPause} aria-label="Pause draft">
          <Pause size={18} />
        </button>
      ) : null}
    </section>
  );
}

function PausePanel({
  canRemove,
  canResume,
  mode,
  onExit,
  onRemovePlayer,
  onResume,
  players,
  remainingCount,
}: {
  canRemove: boolean;
  canResume: boolean;
  mode: "local" | "sync";
  onExit: () => void;
  onRemovePlayer: (playerId: string) => void;
  onResume: () => void;
  players: GamePlayer[];
  remainingCount: number;
}) {
  return (
    <div className="modal-scrim">
      <section className="modal-panel pause-modal" role="dialog" aria-label="Paused">
        <PanelHeader title="Paused" onClose={onExit} closeLabel="End game" />
        <p className="muted">{remainingCount} territories remain.</p>
        <div className="player-list paused-list">
          {players.map((player) => (
            <article className="player-row compact-row" key={player.id}>
              <span className="player-dot" style={{ background: colorCss(player.color) }} />
              <strong>{player.name}</strong>
              {mode === "sync" ? <span className="connection-label">{player.connectionStatus}</span> : null}
              {canRemove ? (
                <button className="icon-button danger" type="button" onClick={() => onRemovePlayer(player.id)} aria-label={`Remove ${player.name}`}>
                  <Trash2 size={16} />
                </button>
              ) : null}
            </article>
          ))}
        </div>
        <button className="primary icon-text-button wide-button" type="button" onClick={onResume} disabled={!canResume || players.length < 2}>
          <Play size={20} />
          Resume
        </button>
      </section>
    </div>
  );
}

function ReviewPanel({ onExit, players }: { onExit: () => void; players: GamePlayer[] }) {
  return (
    <section className="hud-panel review-panel compact-hud">
      <button className="icon-button danger" type="button" onClick={onExit} aria-label="Return home">
        <X size={18} />
      </button>
      <div className="review-players">
        {players.map((player) => (
          <span className="player-chip" key={player.id}>
            <span className="player-dot" style={{ background: colorCss(player.color) }} />
            {player.name}
          </span>
        ))}
      </div>
    </section>
  );
}

function ConfirmPickDialog({
  fillColor,
  onCancel,
  onConfirm,
  territory,
}: {
  fillColor: string;
  onCancel: () => void;
  onConfirm: () => void;
  territory: GeneratedTerritoryData;
}) {
  return (
    <div className="modal-scrim">
      <section className="modal-panel pick-modal" role="dialog" aria-label="Confirm territory">
        <h2>{territory.name}</h2>
        <TerritoryShapePreview fillColor={fillColor} territory={territory} />
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
  fillColor,
  onClose,
  territory,
}: {
  activePlayer: GamePlayer;
  fillColor: string;
  onClose: () => void;
  territory: GeneratedTerritoryData;
}) {
  const closedRef = useRef(false);
  const closeOnce = useCallback(() => {
    if (closedRef.current) {
      return;
    }

    closedRef.current = true;
    onClose();
  }, [onClose]);

  useEffect(() => {
    const timeout = window.setTimeout(closeOnce, 1000);
    return () => window.clearTimeout(timeout);
  }, [closeOnce]);

  return (
    <div className="modal-scrim pick-result-scrim" onClick={closeOnce}>
      <section className="modal-panel pick-modal pick-result-modal" role="status" aria-live="polite">
        <p className="muted">{activePlayer.name} drafted</p>
        <h2>{territory.name}</h2>
        <TerritoryShapePreview fillColor={fillColor} territory={territory} />
      </section>
    </div>
  );
}

function TerritoryShapePreview({
  fillColor,
  territory,
}: {
  fillColor: string;
  territory: GeneratedTerritoryData;
}) {
  const shapeRef = useRef<SVGGElement>(null);
  const [viewBox, setViewBox] = useState(() => viewBoxFromBounds(territory.focusBounds));

  useLayoutEffect(() => {
    const shape = shapeRef.current;

    if (!shape) {
      return;
    }

    // Fit the raw generated territory paths tightly inside the modal SVG.
    try {
      const box = shape.getBBox();
      const padding = Math.max(box.width, box.height) * 0.08;
      setViewBox(`${box.x - padding} ${box.y - padding} ${box.width + padding * 2} ${box.height + padding * 2}`);
    } catch {
      setViewBox(viewBoxFromBounds(territory.focusBounds));
    }
  }, [territory]);

  return (
    <svg className="territory-preview-shape" viewBox={viewBox} aria-hidden="true">
      <g ref={shapeRef}>
        {territory.fillPaths.map((path, index) => (
          <path
            d={path}
            fill={fillColor}
            key={index}
            stroke="#111111"
            strokeLinejoin="round"
            strokeWidth="34"
          />
        ))}
      </g>
    </svg>
  );
}

function DecisionDialog({
  message,
  onCancel,
  onConfirm,
}: {
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
          <button className="icon-button danger large" type="button" onClick={onConfirm} aria-label="End game">
            <Check size={24} />
          </button>
        </div>
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

  return (
    <div
      className="color-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
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
      {svg ? <div className="qr-code" role="img" aria-label="QR code" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="qr-placeholder" />}
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

  return (
    <div className="modal-scrim" role="presentation">
      <section className="scanner-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-title">
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

function pauseSyncGame(state: GameState): GameState {
  if (!state.draft) {
    return state;
  }

  return {
    ...state,
    phase: "paused",
    draft: clearDraftTimer({
      ...state.draft,
      pendingTerritoryId: null,
      resultTerritoryId: null,
      resultPlayerId: null,
      noticeTerritoryId: null,
      noticePlayerId: null,
    }, state.config),
  };
}

function markSyncPlayerStatus(state: GameState, playerId: string, connectionStatus: GamePlayer["connectionStatus"]): GameState {
  return {
    ...state,
    players: state.players.map((player) => player.id === playerId ? { ...player, connectionStatus } : player),
  };
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

function viewBoxFromBounds(bounds: MapBounds) {
  return `${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`;
}

export default App;
