import { generatedMapData } from "../map/generated/mapData";
import type { MapSkin, TerritoryState } from "../map/mapTypes";
import { territoriesInRegion } from "../map/territoryLookup";
import { MIXTURE_TROOP_TYPES, armyCountsForMarker, reinforcementCountsForMarker } from "./armyBuild";
import { challengeScoreForTroops, combatScoreForTroops, rollCombatDice, sampleCasualty } from "./combat";
import { directedDistanceFromAny, directedOwnedSourcesReachingTarget, hasDirectedConnection, outgoingTerritoryIds } from "./mapGraph";
import type {
  AllocationStyle,
  AllocationState,
  ArmyMarker,
  AppPhase,
  AttackStyle,
  BattleState,
  DraftState,
  DraftStyle,
  FortifyMovesBySource,
  GameNotification,
  GameConfig,
  GamePlayer,
  GameState,
  PickTimeLimit,
  PlayerAllocation,
  PlayerColor,
  ReinforcementState,
  TerritoryOwnerMap,
  TroopAllocationTimeLimit,
  TroopCounts,
  TroopType,
  TurnCommand,
  TurnStage,
  TurnState,
} from "./gameTypes";

export const PLAYER_COLORS: PlayerColor[] = ["green", "blue", "yellow", "red", "purple", "black"];
export const ALLOCATION_STYLES: AllocationStyle[] = ["manual", "random"];
export const ATTACK_STYLES: AttackStyle[] = ["regular", "challenge"];
export const PICK_TIME_LIMITS: PickTimeLimit[] = [5, 10, 15, 0];
export const TROOP_ALLOCATION_TIME_LIMITS: TroopAllocationTimeLimit[] = [60, 120, 180, 240, 300, 0];
export const LOCAL_GAME_KEY = "ardature.localGame.v1";
export const SYNC_HOST_GAME_KEY = "ardature.syncHostGame.v1";
export const TROOP_TYPES: TroopType[] = ["heavy", "cavalry", "elite", "leader"];
export { MIXTURE_TROOP_TYPES, armyCountsForMarker } from "./armyBuild";

const DEFAULT_CONFIG: GameConfig = {
  draftStyle: "snake",
  pickTimeLimit: 0,
  allocationStyle: "manual",
  troopAllocationTimeLimit: 0,
  attackStyle: "regular",
};

const TERRITORY_IDS = generatedMapData.territories.map((territory) => territory.id);
const CENTER_MARKER: ArmyMarker = { heavy: 1 / 3, cavalry: 1 / 3, elite: 1 / 3 };
const ZERO_TROOPS: TroopCounts = { heavy: 0, cavalry: 0, elite: 0, leader: 0 };
const REGION_REINFORCEMENTS = {
  eriador: createTroopCounts({ elite: 6 }),
  rhovanion: createTroopCounts({ elite: 5 }),
  gondor: createTroopCounts({ cavalry: 5 }),
  rohan: createTroopCounts({ cavalry: 3 }),
  rhun: createTroopCounts({ heavy: 4 }),
  mordor: createTroopCounts({ heavy: 3 }),
} as const;
const REGION_IDS = Object.keys(REGION_REINFORCEMENTS);

export function createInitialGameState(): GameState {
  return {
    phase: "home",
    mode: "local",
    players: [],
    config: { ...DEFAULT_CONFIG },
    draft: null,
    allocation: null,
    turn: null,
    notifications: {},
    regionControl: createRegionControl(),
  };
}

export function createPlayer(name: string): GamePlayer {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    color: null,
    nameLocked: false,
    colorLocked: false,
    connectionStatus: "connected",
  };
}

export function isSetupValid(players: GamePlayer[]) {
  if (players.length < 2 || players.length > 6) {
    return false;
  }

  const colors = new Set<PlayerColor>();
  for (const player of players) {
    if (!player.name.trim() || !player.color || colors.has(player.color)) {
      return false;
    }

    colors.add(player.color);
  }

  return true;
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

export function firstAvailableColor(players: GamePlayer[]) {
  const usedColors = new Set(players.map((player) => player.color).filter(Boolean));
  return PLAYER_COLORS.find((color) => !usedColors.has(color)) ?? null;
}

export function addSetupPlayer(state: GameState, name: string): GameState {
  if (!name.trim() || state.players.length >= 6) {
    return state;
  }

  return {
    ...state,
    players: [
      ...state.players,
      {
        ...createPlayer(name),
        color: firstAvailableColor(state.players),
      },
    ],
  };
}

export function updateUnlockedSetupPlayer(state: GameState, playerId: string, updates: Partial<GamePlayer>): GameState {
  return {
    ...state,
    players: state.players.map((player) => {
      if (player.id !== playerId) {
        return player;
      }

      return {
        ...player,
        name: updates.name !== undefined && !player.nameLocked ? updates.name : player.name,
        color: updates.color !== undefined && !player.colorLocked ? updates.color : player.color,
      };
    }),
  };
}

export function updateSetupPlayer(state: GameState, playerId: string, updates: Partial<GamePlayer>, hostPlayerId: string | null): GameState {
  return {
    ...state,
    players: state.players.map((player) => {
      if (player.id !== playerId) {
        return player;
      }

      const hostLockedUpdates = state.mode === "sync" && player.id !== hostPlayerId
        ? {
            nameLocked: updates.name !== undefined ? true : player.nameLocked,
            colorLocked: updates.color !== undefined ? true : player.colorLocked,
          }
        : {};

      return { ...player, ...updates, ...hostLockedUpdates };
    }),
  };
}

export function unlockSetupPlayerField(state: GameState, playerId: string, field: "name" | "color"): GameState {
  return {
    ...state,
    players: state.players.map((player) => player.id === playerId
      ? {
          ...player,
          nameLocked: field === "name" ? false : player.nameLocked,
          colorLocked: field === "color" ? false : player.colorLocked,
        }
      : player),
  };
}

export function removeSetupPlayer(state: GameState, playerId: string): GameState {
  return state.phase === "paused"
    ? removePlayerFromDraft(state, playerId)
    : {
        ...state,
        players: state.players.filter((player) => player.id !== playerId),
      };
}

export function reorderSetupPlayers(state: GameState, playerId: string, overPlayerId: string): GameState {
  const fromIndex = state.players.findIndex((player) => player.id === playerId);
  const toIndex = state.players.findIndex((player) => player.id === overPlayerId);

  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return state;
  }

  return { ...state, players: moveItem(state.players, fromIndex, toIndex) };
}

export function randomizeSetupPlayers(state: GameState, random = Math.random): GameState {
  const players = [...state.players];
  for (let index = players.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [players[index], players[swapIndex]] = [players[swapIndex], players[index]];
  }

  return { ...state, players };
}

export function updateSetupConfig(state: GameState, updates: Partial<GameConfig>): GameState {
  const config = { ...state.config, ...updates };

  return {
    ...state,
    config: {
      ...config,
      pickTimeLimit: config.draftStyle === "random" ? 0 : config.pickTimeLimit,
      troopAllocationTimeLimit: config.allocationStyle === "random" ? 0 : config.troopAllocationTimeLimit,
      attackStyle: config.attackStyle,
    },
  };
}

export function restartPausedGameToSetup(state: GameState, isSyncHost: boolean): GameState {
  return state.phase === "paused" && (state.mode === "local" || isSyncHost)
    ? removeNonConnectedSyncLobbyPlayers({
        ...state,
        phase: "setup",
        draft: null,
        allocation: null,
        turn: null,
        notifications: {},
        regionControl: createRegionControl(),
      })
    : state;
}

export function colorForPlayer(player: GamePlayer | undefined): MapSkin {
  return player?.color ?? "background";
}

export function createOwnershipMap(): TerritoryOwnerMap {
  return Object.fromEntries(TERRITORY_IDS.map((territoryId) => [territoryId, null]));
}

export function createRegionControl(): Record<string, string | null> {
  return Object.fromEntries(REGION_IDS.map((regionId) => [regionId, null]));
}

export function createTerritoryStates(
  players: GamePlayer[],
  ownership: TerritoryOwnerMap | null,
  selectedTerritoryId: string | string[] | null,
  suggestedTerritoryId: string | string[] | null = null,
  battleCue: { sourceTerritoryId: string; targetTerritoryId: string } | null = null,
): Record<string, TerritoryState> {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const selectedTerritoryIds = new Set(Array.isArray(selectedTerritoryId) ? selectedTerritoryId : selectedTerritoryId ? [selectedTerritoryId] : []);
  const suggestedTerritoryIds = new Set(Array.isArray(suggestedTerritoryId) ? suggestedTerritoryId : suggestedTerritoryId ? [suggestedTerritoryId] : []);

  return Object.fromEntries(
    TERRITORY_IDS.map((territoryId) => {
      const ownerId = ownership?.[territoryId] ?? null;
      const status = battleCue?.sourceTerritoryId === territoryId
        ? "battleSource"
        : battleCue?.targetTerritoryId === territoryId
          ? "battleTarget"
          : selectedTerritoryIds.has(territoryId)
            ? "selected"
            : suggestedTerritoryIds.has(territoryId)
              ? "suggested"
              : "unselected";

      return [
        territoryId,
        {
          skin: colorForPlayer(ownerId ? playerById.get(ownerId) : undefined),
          status,
        },
      ];
    }),
  );
}

export function createTroopCounts(values: Partial<TroopCounts> = {}): TroopCounts {
  return {
    heavy: values.heavy ?? 0,
    cavalry: values.cavalry ?? 0,
    elite: values.elite ?? 0,
    leader: values.leader ?? 0,
  };
}

export function troopTotal(counts: TroopCounts) {
  return counts.heavy + counts.cavalry + counts.elite + counts.leader;
}

export function addTroops(left: TroopCounts, right: TroopCounts): TroopCounts {
  return {
    heavy: left.heavy + right.heavy,
    cavalry: left.cavalry + right.cavalry,
    elite: left.elite + right.elite,
    leader: left.leader + right.leader,
  };
}

export function subtractTroops(left: TroopCounts, right: TroopCounts): TroopCounts {
  return {
    heavy: left.heavy - right.heavy,
    cavalry: left.cavalry - right.cavalry,
    elite: left.elite - right.elite,
    leader: left.leader - right.leader,
  };
}

export function territoryTroops(allocation: AllocationState | null, territoryId: string): TroopCounts {
  if (!allocation) {
    return createTroopCounts();
  }

  for (const playerAllocation of Object.values(allocation.playerAllocations)) {
    const troops = playerAllocation.territories[territoryId];
    if (troops) {
      return troops;
    }
  }

  return createTroopCounts();
}

export function territoryTroopTotal(allocation: AllocationState | null, territoryId: string) {
  return troopTotal(territoryTroops(allocation, territoryId));
}

export function remainingTroops(allocation: AllocationState, playerId: string): TroopCounts {
  const playerAllocation = allocation.playerAllocations[playerId];
  if (!playerAllocation) {
    return createTroopCounts();
  }

  let placed = createTroopCounts();
  for (const troops of Object.values(playerAllocation.territories)) {
    placed = addTroops(placed, troops);
  }

  return subtractTroops(addTroops(playerAllocation.baseTroops, playerAllocation.inheritedTroops), placed);
}

export function emptyOwnedTerritoryCount(allocation: AllocationState, ownership: TerritoryOwnerMap, playerId: string) {
  return ownedTerritoryIds(ownership, playerId).filter((territoryId) => troopTotal(allocation.playerAllocations[playerId]?.territories[territoryId] ?? ZERO_TROOPS) === 0).length;
}

export function canAddTroop(allocation: AllocationState, ownership: TerritoryOwnerMap, playerId: string, territoryId: string, troopType: TroopType) {
  if (ownership[territoryId] !== playerId) {
    return false;
  }

  const remaining = remainingTroops(allocation, playerId);
  if (remaining[troopType] <= 0) {
    return false;
  }

  const territoryEmpty = troopTotal(allocation.playerAllocations[playerId]?.territories[territoryId] ?? ZERO_TROOPS) === 0;
  const emptyCountAfterAdd = emptyOwnedTerritoryCount(allocation, ownership, playerId) - (territoryEmpty ? 1 : 0);
  return troopTotal(remaining) - 1 >= emptyCountAfterAdd;
}

export function allocationComplete(allocation: AllocationState, ownership: TerritoryOwnerMap, playerId: string) {
  const playerAllocation = allocation.playerAllocations[playerId];
  return Boolean(playerAllocation) &&
    playerAllocation.buildSubmitted &&
    troopTotal(remainingTroops(allocation, playerId)) === 0 &&
    ownedTerritoryIds(ownership, playerId).every((territoryId) => troopTotal(playerAllocation.territories[territoryId] ?? ZERO_TROOPS) > 0);
}

export function remainingTerritoryIds(ownership: TerritoryOwnerMap) {
  return TERRITORY_IDS.filter((territoryId) => !ownership[territoryId]);
}

export function ownedTerritoryIds(ownership: TerritoryOwnerMap, playerId: string) {
  return TERRITORY_IDS.filter((territoryId) => ownership[territoryId] === playerId);
}

export function dismissNotification(state: GameState, playerId: string, notificationId: string): GameState {
  const queue = state.notifications[playerId] ?? [];
  if (!queue.some((notification) => notification.id === notificationId)) {
    return state;
  }

  return {
    ...state,
    notifications: {
      ...state.notifications,
      [playerId]: queue.filter((notification) => notification.id !== notificationId),
    },
  };
}

export function draftProgressForPlayer(state: GameState, playerId: string) {
  if (!state.draft) {
    return { drafted: 0, total: 0 };
  }

  const drafted = ownedTerritoryIds(state.draft.ownership, playerId).length;
  const remainingCount = remainingTerritoryIds(state.draft.ownership).length;
  const activeIds = new Set(state.players.map((player) => player.id));
  const attemptLimit = Math.max(remainingCount * state.draft.originalTurnOrder.length * 4, remainingCount);
  let future = 0;
  let picks = 0;
  let step = state.draft.step;

  // Walk the same draft sequence the engine uses for future picks.
  for (let attempts = 0; picks < remainingCount && attempts < attemptLimit; attempts += 1) {
    const nextPlayerId = draftPlayerIdAtStep(state.draft.originalTurnOrder, state.config.draftStyle, state.draft.startIndex, step);
    step += 1;

    if (!activeIds.has(nextPlayerId)) {
      continue;
    }

    if (nextPlayerId === playerId) {
      future += 1;
    }

    picks += 1;
  }

  return {
    drafted,
    total: drafted + future,
  };
}

export function activePlayer(state: GameState) {
  if (!state.draft || state.phase !== "draft") {
    return null;
  }

  const step = nextActiveStep(state.draft, state.players, state.config.draftStyle);
  if (step === null) {
    return null;
  }

  const playerId = draftPlayerIdAtStep(state.draft.originalTurnOrder, state.config.draftStyle, state.draft.startIndex, step);
  return state.players.find((player) => player.id === playerId) ?? null;
}

export function canPickTerritory(state: GameState, territoryId: string) {
  const draft = state.draft;
  return state.phase === "draft" &&
    Boolean(activePlayer(state)) &&
    Boolean(draft) &&
    draft?.ownership[territoryId] === null;
}

export function startDraft(players: GamePlayer[], config: GameConfig) {
  const originalTurnOrder = players.map((player) => player.id);
  const draft: DraftState = {
    originalTurnOrder,
    startIndex: draftStartIndex(originalTurnOrder.length, config.draftStyle, TERRITORY_IDS.length),
    step: 0,
    ownership: createOwnershipMap(),
    timerRemainingMs: timerMs(config.pickTimeLimit),
    timerEndsAt: null,
  };

  return config.draftStyle === "random"
    ? simulateRandomDraft(players, config, draft)
    : draft;
}

export function advanceAfterDraft(state: GameState, now: number): GameState {
  if (!state.draft) {
    return state;
  }

  const allocation = createAllocationState(state.players, state.draft.ownership, state.config);
  if (state.config.allocationStyle === "random") {
    return startTurnLoop({
      ...state,
      allocation: clearAllocationTimer(randomCompleteAllAllocations(allocation, state.draft.ownership, state.players), state.config),
    }, state.mode === "local");
  }

  return {
    ...state,
    phase: state.mode === "local" ? "allocationHandoff" : "allocation",
    allocation: beginAllocationTimer(allocation, state.config, now),
  };
}

export function beginAllocationTurn(state: GameState): GameState {
  if (!state.allocation || state.mode !== "local") {
    return state;
  }

  return {
    ...state,
    phase: "allocation",
    allocation: beginAllocationTimer(state.allocation, state.config, Date.now()),
  };
}

export function submitArmyBuild(state: GameState, playerId: string): GameState {
  const allocation = state.allocation;
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!allocation || !player) {
    return state;
  }

  const playerAllocation = allocation.playerAllocations[playerId];
  if (!playerAllocation) {
    return state;
  }

  return {
    ...state,
    allocation: {
      ...allocation,
      playerAllocations: {
        ...allocation.playerAllocations,
        [playerId]: {
          ...playerAllocation,
          buildSubmitted: true,
          baseTroops: armyCountsForMarker(playerAllocation.marker, player.color, allocation.originalPlayerCount),
        },
      },
    },
  };
}

export function updateArmyMarker(state: GameState, playerId: string, marker: ArmyMarker): GameState {
  const allocation = state.allocation;
  if (!allocation || allocation.playerAllocations[playerId]?.buildSubmitted) {
    return state;
  }

  return {
    ...state,
    allocation: {
      ...allocation,
      playerAllocations: {
        ...allocation.playerAllocations,
        [playerId]: {
          ...allocation.playerAllocations[playerId],
          marker,
        },
      },
    },
  };
}

export function adjustTerritoryTroop(state: GameState, playerId: string, territoryId: string, troopType: TroopType, delta: 1 | -1): GameState {
  const allocation = state.allocation;
  const ownership = state.draft?.ownership;
  const playerAllocation = allocation?.playerAllocations[playerId];
  if (!allocation || !ownership || !playerAllocation || ownership[territoryId] !== playerId) {
    return state;
  }

  const currentTroops = playerAllocation.territories[territoryId] ?? createTroopCounts();
  if (delta < 0 && currentTroops[troopType] <= 0) {
    return state;
  }

  if (delta > 0 && !canAddTroop(allocation, ownership, playerId, territoryId, troopType)) {
    return state;
  }

  return {
    ...state,
    allocation: {
      ...allocation,
      playerAllocations: {
        ...allocation.playerAllocations,
        [playerId]: {
          ...playerAllocation,
          territories: {
            ...playerAllocation.territories,
            [territoryId]: {
              ...currentTroops,
              [troopType]: currentTroops[troopType] + delta,
            },
          },
        },
      },
    },
  };
}

export function finishAllocationForPlayer(state: GameState, playerId: string): GameState {
  const allocation = state.allocation;
  const ownership = state.draft?.ownership;
  if (!allocation || !ownership || !allocationComplete(allocation, ownership, playerId)) {
    return state;
  }

  if (state.mode === "sync") {
    const readyAllocation = markAllocationReady(allocation, playerId);
    const nextAllocation = allAllocationsReady(readyAllocation, state.players)
      ? clearAllocationTimer(readyAllocation, state.config)
      : readyAllocation;

    return { ...state, phase: "allocation", allocation: nextAllocation };
  }

  const nextAllocation = clearAllocationTimer(markAllocationReady(allocation, playerId), state.config);
  const nextIndex = nextLocalAllocationIndex(nextAllocation, state.players);
  if (nextIndex === null) {
    return startTurnLoop({
      ...state,
      allocation: nextAllocation,
    }, true);
  }

  return {
    ...state,
    phase: "allocationHandoff",
    allocation: {
      ...nextAllocation,
      currentIndex: nextIndex,
    },
  };
}

export function startGameMapAfterAllocation(state: GameState): GameState {
  if (!state.allocation || !allAllocationsReady(state.allocation, state.players)) {
    return state;
  }

  return startTurnLoop({
    ...state,
    allocation: state.allocation,
  }, false);
}

export function beginTurnAfterHandoff(state: GameState): GameState {
  if (state.mode !== "local" || state.phase !== "turnHandoff" || !state.turn) {
    return state;
  }

  return {
    ...state,
    phase: "turn",
  };
}

export function randomCompleteAllocationForPlayer(state: GameState, playerId: string): GameState {
  const allocation = state.allocation;
  const ownership = state.draft?.ownership;
  if (!allocation || !ownership || !state.players.some((player) => player.id === playerId)) {
    return state;
  }

  const builtState = allocation.playerAllocations[playerId]?.buildSubmitted
    ? state
    : submitArmyBuild(state, playerId);
  const filledAllocation = randomFillAllocation(builtState.allocation ?? allocation, ownership, playerId);

  return {
    ...builtState,
    allocation: {
      ...filledAllocation,
      playerAllocations: {
        ...filledAllocation.playerAllocations,
        [playerId]: {
          ...filledAllocation.playerAllocations[playerId],
          ready: true,
          randomCompleted: true,
        },
      },
    },
  };
}

export function turnPlayer(state: GameState) {
  return state.turn ? state.players.find((player) => player.id === state.turn?.currentPlayerId) ?? null : null;
}

export function capturedSpiesOnTerritory(state: GameState, territoryId: string) {
  return Object.entries(state.turn?.spies ?? {})
    .filter(([, spy]) => spy.status === "captured" && spy.territoryId === territoryId)
    .map(([playerId, spy]) => ({
      custodianPlayerId: spy.custodianPlayerId,
      ownerPlayerId: playerId,
      territoryId,
    }));
}

export function canUseSpy(state: GameState, playerId: string) {
  const turn = state.turn;
  return Boolean(
    state.phase === "turn" &&
    turn &&
    turn.currentPlayerId === playerId &&
    (turn.stage === "reinforcementReady" || turn.stage === "actions") &&
    turn.spies[playerId]?.status === "available",
  );
}

export function startSpySelection(state: GameState, playerId: string): GameState {
  if (!canUseSpy(state, playerId) || !state.turn) {
    return state;
  }

  const spyReturnStage = state.turn.stage === "actions" ? "actions" : "reinforcementReady";

  return {
    ...state,
    turn: {
      ...state.turn,
      stage: "spyTarget",
      spyReturnStage,
      spyIntel: null,
    },
  };
}

export function cancelSpySelection(state: GameState): GameState {
  if (!state.turn || state.turn.stage !== "spyTarget") {
    return state;
  }

  return {
    ...state,
    turn: {
      ...state.turn,
      stage: state.turn.spyReturnStage ?? "reinforcementReady",
      spyReturnStage: null,
    },
  };
}

export function spyCaptureProbability(state: GameState, playerId: string, territoryId: string) {
  const distance = nearestOwnedDistance(state.draft?.ownership ?? null, playerId, territoryId);
  if (!distance) {
    return null;
  }

  return Math.min(90, distance * 20);
}

export function confirmSpyAttempt(state: GameState, playerId: string, territoryId: string, randomValue = Math.random()): GameState {
  const turn = state.turn;
  const ownership = state.draft?.ownership;
  if (state.phase !== "turn" || !turn || !ownership || turn.currentPlayerId !== playerId || turn.stage !== "spyTarget" || ownership[territoryId] === playerId || !ownership[territoryId]) {
    return state;
  }

  const probability = spyCaptureProbability(state, playerId, territoryId);
  if (probability === null) {
    return state;
  }

  if (randomValue < probability / 100) {
    const defenderId = ownership[territoryId];
    return queueNotifications({
      ...state,
      turn: {
        ...turn,
        stage: turn.spyReturnStage ?? "reinforcementReady",
        spyReturnStage: null,
        spyIntel: null,
        spies: {
          ...turn.spies,
          [playerId]: {
            status: "captured",
            territoryId,
            custodianPlayerId: defenderId,
          },
        },
      },
    }, [
      { id: createNotificationId(), type: "spyLost", playerId, territoryId },
      defenderId
        ? { id: createNotificationId(), type: "spyCaptured", playerId: defenderId, spyOwnerId: playerId, territoryId }
        : null,
    ]);
  }

  const targetOwnerId = ownership[territoryId];
  const totalTerritoryIds = targetOwnerId
    ? sameOwnerConnectedTerritoryIds(ownership, territoryId, targetOwnerId)
    : [];

  return {
    ...state,
    turn: {
      ...turn,
      stage: "spyIntel",
      spyIntel: {
        targetTerritoryId: territoryId,
        totalTerritoryIds,
      },
    },
  };
}

export function dismissSpyIntel(state: GameState, playerId: string): GameState {
  const turn = state.turn;
  if (state.phase !== "turn" || !turn || turn.currentPlayerId !== playerId || turn.stage !== "spyIntel") {
    return state;
  }

  return {
    ...state,
    turn: {
      ...turn,
      stage: turn.spyReturnStage ?? "reinforcementReady",
      spyReturnStage: null,
      spyIntel: null,
    },
  };
}

export function startReinforcements(state: GameState, playerId: string): GameState {
  const turn = state.turn;
  const ownership = state.draft?.ownership;
  if (state.phase !== "turn" || !turn || !ownership || turn.currentPlayerId !== playerId || turn.stage !== "reinforcementReady") {
    return state;
  }

  return {
    ...state,
    turn: {
      ...turn,
      stage: "reinforcementBuild",
      reinforcement: {
        marker: { ...CENTER_MARKER },
        buildSubmitted: false,
        baseTroops: createTroopCounts(),
        bonusTroops: regionBonusTroops(ownership, playerId),
        territories: {},
      },
    },
  };
}

export function startTurnReinforcements(state: GameState, playerId: string): GameState {
  return startReinforcements(cancelSpySelection(state), playerId);
}

export function updateReinforcementMarker(state: GameState, playerId: string, marker: ArmyMarker): GameState {
  const reinforcement = state.turn?.reinforcement;
  if (state.phase !== "turn" || !state.turn || state.turn.currentPlayerId !== playerId || state.turn.stage !== "reinforcementBuild" || !reinforcement || reinforcement.buildSubmitted) {
    return state;
  }

  return {
    ...state,
    turn: {
      ...state.turn,
      reinforcement: {
        ...reinforcement,
        marker,
      },
    },
  };
}

export function submitReinforcementBuild(state: GameState, playerId: string): GameState {
  const reinforcement = state.turn?.reinforcement;
  const ownership = state.draft?.ownership;
  if (state.phase !== "turn" || !state.turn || !ownership || state.turn.currentPlayerId !== playerId || state.turn.stage !== "reinforcementBuild" || !reinforcement) {
    return state;
  }

  return {
    ...state,
    turn: {
      ...state.turn,
      stage: "reinforcementPlace",
      reinforcement: {
        ...reinforcement,
        buildSubmitted: true,
        baseTroops: reinforcementCountsForMarker(reinforcement.marker, reinforcementBudget(ownership, playerId)),
      },
    },
  };
}

export function projectReinforcementTroops(state: GameState, playerId: string) {
  const reinforcement = state.turn?.reinforcement;
  const ownership = state.draft?.ownership;
  if (!reinforcement || !ownership || state.turn?.currentPlayerId !== playerId) {
    return createTroopCounts();
  }

  const baseTroops = reinforcement.buildSubmitted
    ? reinforcement.baseTroops
    : reinforcementCountsForMarker(reinforcement.marker, reinforcementBudget(ownership, playerId));

  return addTroops(baseTroops, reinforcement.bonusTroops);
}

export function remainingReinforcementTroops(reinforcement: ReinforcementState | null) {
  if (!reinforcement) {
    return createTroopCounts();
  }

  let placed = createTroopCounts();
  for (const troops of Object.values(reinforcement.territories)) {
    placed = addTroops(placed, troops);
  }

  return subtractTroops(addTroops(reinforcement.baseTroops, reinforcement.bonusTroops), placed);
}

export function canAddReinforcementTroop(state: GameState, playerId: string, territoryId: string, troopType: TroopType) {
  const reinforcement = state.turn?.reinforcement;
  const ownership = state.draft?.ownership;
  if (!reinforcement || !ownership || ownership[territoryId] !== playerId) {
    return false;
  }

  return remainingReinforcementTroops(reinforcement)[troopType] > 0;
}

export function adjustReinforcementTroop(state: GameState, playerId: string, territoryId: string, troopType: TroopType, delta: 1 | -1): GameState {
  const turn = state.turn;
  const reinforcement = turn?.reinforcement;
  const ownership = state.draft?.ownership;
  if (state.phase !== "turn" || !turn || !reinforcement || !ownership || turn.currentPlayerId !== playerId || turn.stage !== "reinforcementPlace" || ownership[territoryId] !== playerId) {
    return state;
  }

  const currentTroops = reinforcement.territories[territoryId] ?? createTroopCounts();
  if (delta < 0 && currentTroops[troopType] <= 0) {
    return state;
  }

  if (delta > 0 && !canAddReinforcementTroop(state, playerId, territoryId, troopType)) {
    return state;
  }

  return {
    ...state,
    turn: {
      ...turn,
      reinforcement: {
        ...reinforcement,
        territories: {
          ...reinforcement.territories,
          [territoryId]: {
            ...currentTroops,
            [troopType]: currentTroops[troopType] + delta,
          },
        },
      },
    },
  };
}

export function reinforcementComplete(state: GameState, playerId: string) {
  const turn = state.turn;
  const reinforcement = turn?.reinforcement;
  return Boolean(
    state.phase === "turn" &&
    turn?.currentPlayerId === playerId &&
    turn.stage === "reinforcementPlace" &&
    reinforcement?.buildSubmitted &&
    troopTotal(remainingReinforcementTroops(reinforcement)) === 0,
  );
}

export function finishReinforcements(state: GameState, playerId: string): GameState {
  const turn = state.turn;
  const reinforcement = turn?.reinforcement;
  const allocation = state.allocation;
  const playerAllocation = allocation?.playerAllocations[playerId];
  if (!reinforcementComplete(state, playerId) || !turn || !reinforcement || !allocation || !playerAllocation) {
    return state;
  }

  let territories = { ...playerAllocation.territories };
  for (const [territoryId, troops] of Object.entries(reinforcement.territories)) {
    territories = {
      ...territories,
      [territoryId]: addTroops(territories[territoryId] ?? createTroopCounts(), troops),
    };
  }

  return {
    ...state,
    allocation: {
      ...allocation,
      playerAllocations: {
        ...allocation.playerAllocations,
        [playerId]: {
          ...playerAllocation,
          territories,
        },
      },
    },
    turn: {
      ...turn,
      stage: "actions",
      reinforcement: null,
      spyIntel: null,
      spyReturnStage: null,
    },
  };
}

export function canAttackFromTerritory(state: GameState, playerId: string, territoryId: string) {
  const ownership = state.draft?.ownership;
  return Boolean(
    state.phase === "turn" &&
      state.turn?.currentPlayerId === playerId &&
      state.turn.stage === "actions" &&
      ownership?.[territoryId] === playerId &&
      territoryTroopTotal(state.allocation, territoryId) > 1,
  );
}

export function canAttackTargetTerritory(state: GameState, playerId: string, sourceTerritoryId: string, targetTerritoryId: string) {
  const ownership = state.draft?.ownership;

  return Boolean(
    canAttackFromTerritory(state, playerId, sourceTerritoryId) &&
      ownership?.[targetTerritoryId] &&
      ownership[targetTerritoryId] !== playerId &&
      hasDirectedConnection(sourceTerritoryId, targetTerritoryId),
  );
}

export function canCommitAttack(state: GameState, playerId: string, sourceTerritoryId: string, targetTerritoryId: string, attackingTroops: TroopCounts) {
  if (!validTroopCounts(attackingTroops) || !canAttackTargetTerritory(state, playerId, sourceTerritoryId, targetTerritoryId)) {
    return false;
  }

  if (state.turn?.completedAttacks.includes(attackPairKey(sourceTerritoryId, targetTerritoryId))) {
    return false;
  }

  const sourceTroops = territoryTroops(state.allocation, sourceTerritoryId);
  const leftBehind = subtractTroops(sourceTroops, attackingTroops);

  return troopTotal(attackingTroops) > 0 &&
    troopTotal(leftBehind) > 0 &&
    validTroopCounts(leftBehind);
}

export function commitAttack(state: GameState, playerId: string, sourceTerritoryId: string, targetTerritoryId: string, attackingTroops: TroopCounts): GameState {
  const turn = state.turn;
  const ownership = state.draft?.ownership;
  const defenderPlayerId = ownership?.[targetTerritoryId] ?? null;

  if (!turn || !defenderPlayerId || !canCommitAttack(state, playerId, sourceTerritoryId, targetTerritoryId, attackingTroops)) {
    return state;
  }

  const defendingTroops = territoryTroops(state.allocation, targetTerritoryId);
  const usesChallenge = state.config.attackStyle === "challenge";

  return {
    ...state,
    turn: {
      ...turn,
      stage: "battle",
      spyIntel: null,
      spyReturnStage: null,
      reinforcement: null,
      battle: {
        id: crypto.randomUUID(),
        attackerPlayerId: playerId,
        defenderPlayerId,
        sourceTerritoryId,
        targetTerritoryId,
        committedAttackingTroops: createTroopCounts(attackingTroops),
        initialDefendingTroops: createTroopCounts(defendingTroops),
        attackingTroops: createTroopCounts(attackingTroops),
        defendingTroops: createTroopCounts(defendingTroops),
        attackerScore: usesChallenge ? null : combatScoreForTroops(attackingTroops),
        defenderScore: usesChallenge && state.mode === "sync" ? null : combatScoreForTroops(defendingTroops),
        latestRoll: null,
        hasRolled: false,
        releasedAttackerSpy: false,
        result: null,
      },
      completedAttacks: [
        ...turn.completedAttacks,
        attackPairKey(sourceTerritoryId, targetTerritoryId),
      ],
    },
  };
}

export function submitBattleScore(state: GameState, playerId: string, battleId: string, score: number): GameState {
  const turn = state.turn;
  const battle = turn?.battle;
  if (state.phase !== "turn" || !turn || turn.stage !== "battle" || !battle || battle.id !== battleId || !Number.isFinite(score)) {
    return state;
  }

  const boundedScore = Math.max(0, Math.min(10, score));
  if (playerId === battle.attackerPlayerId && battle.attackerScore === null) {
    return {
      ...state,
      turn: {
        ...turn,
        battle: {
          ...battle,
          attackerScore: boundedScore,
        },
      },
    };
  }

  if (playerId === battle.defenderPlayerId && battle.defenderScore === null) {
    return {
      ...state,
      turn: {
        ...turn,
        battle: {
          ...battle,
          defenderScore: boundedScore,
        },
      },
    };
  }

  return state;
}

export function rollBattle(state: GameState, playerId: string, battleId: string, random = Math.random): GameState {
  const turn = state.turn;
  const battle = turn?.battle;
  const allocation = state.allocation;
  if (
    state.phase !== "turn" ||
    !turn ||
    turn.stage !== "battle" ||
    !battle ||
    battle.id !== battleId ||
    battle.attackerPlayerId !== playerId ||
    battle.result ||
    battle.attackerScore === null ||
    battle.defenderScore === null ||
    !allocation
  ) {
    return state;
  }

  const attackerDice = rollCombatDice(battle.attackerScore, "attacker", Math.min(3, troopTotal(battle.attackingTroops)), random);
  const defenderDice = rollCombatDice(battle.defenderScore, "defender", Math.min(2, troopTotal(battle.defendingTroops)), random);
  const comparisonCount = Math.min(attackerDice.length, defenderDice.length);
  const attackerLosses: TroopType[] = [];
  const defenderLosses: TroopType[] = [];
  let attackingTroops = battle.attackingTroops;
  let defendingTroops = battle.defendingTroops;
  let nextAllocation = allocation;

  // Compare the highest dice side by side, with ties going to the defender.
  for (let index = 0; index < comparisonCount; index += 1) {
    if (attackerDice[index] > defenderDice[index]) {
      const casualty = sampleCasualty(defendingTroops, random);
      if (casualty) {
        defenderLosses.push(casualty);
        defendingTroops = subtractOneTroop(defendingTroops, casualty);
        nextAllocation = adjustCommittedTerritoryTroop(nextAllocation, battle.defenderPlayerId, battle.targetTerritoryId, casualty, -1);
      }
    } else {
      const casualty = sampleCasualty(attackingTroops, random);
      if (casualty) {
        attackerLosses.push(casualty);
        attackingTroops = subtractOneTroop(attackingTroops, casualty);
        nextAllocation = adjustCommittedTerritoryTroop(nextAllocation, battle.attackerPlayerId, battle.sourceTerritoryId, casualty, -1);
      }
    }
  }

  const rolledBattle = {
    ...battle,
    attackingTroops,
    defendingTroops,
    latestRoll: {
      attackerDice,
      defenderDice,
      attackerLosses,
      defenderLosses,
    },
    hasRolled: true,
    result: troopTotal(defendingTroops) === 0
      ? { type: "attackerWon" as const }
      : troopTotal(attackingTroops) === 0
        ? { type: "defenderWon" as const }
        : null,
  };
  const rolledState = {
    ...state,
    allocation: nextAllocation,
    turn: {
      ...turn,
      battle: rolledBattle,
    },
  };

  return rolledBattle.result?.type === "attackerWon"
    ? finishBattleConquest(rolledState, rolledBattle)
    : rolledState;
}

export function retreatBattle(state: GameState, playerId: string, battleId: string): GameState {
  const turn = state.turn;
  const battle = turn?.battle;
  if (state.phase !== "turn" || !turn || turn.stage !== "battle" || !battle || battle.id !== battleId || battle.attackerPlayerId !== playerId || !battle.hasRolled || battle.result) {
    return state;
  }

  return {
    ...state,
    turn: {
      ...turn,
      stage: "actions",
      battle: null,
    },
  };
}

export function dismissBattle(state: GameState, playerId: string, battleId: string): GameState {
  const turn = state.turn;
  const battle = turn?.battle;
  if (state.phase !== "turn" || !turn || turn.stage !== "battle" || !battle || battle.id !== battleId || battle.attackerPlayerId !== playerId || !battle.result) {
    return state;
  }

  return {
    ...state,
    turn: {
      ...turn,
      stage: "actions",
      battle: null,
    },
  };
}

export function sampleBattleChallengeScore(state: GameState, playerId: string, battleId: string) {
  const battle = state.turn?.battle;
  if (!battle || battle.id !== battleId) {
    return null;
  }

  if (playerId === battle.attackerPlayerId && battle.attackerScore === null) {
    return challengeScoreForTroops(battle.attackingTroops);
  }

  if (playerId === battle.defenderPlayerId && battle.defenderScore === null) {
    return challengeScoreForTroops(battle.defendingTroops);
  }

  return null;
}

export function commitReinforcements(state: GameState, playerId: string, reinforcement: ReinforcementState): GameState {
  const turn = state.turn;
  if (state.phase !== "turn" || !turn || turn.currentPlayerId !== playerId || !validCommittedReinforcement(state, playerId, reinforcement)) {
    return state;
  }

  return finishReinforcements({
    ...state,
    turn: {
      ...turn,
      stage: "reinforcementPlace",
      reinforcement,
    },
  }, playerId);
}

export function finishTurnWithFortify(state: GameState, playerId: string): GameState {
  const turn = state.turn;
  if (state.phase !== "turn" || !turn || turn.currentPlayerId !== playerId || turn.stage !== "actions") {
    return state;
  }

  return advanceTurn(state);
}

export function skipFortifyAndFinishTurn(state: GameState, playerId: string): GameState {
  return finishTurnWithFortify(cancelSpySelection(state), playerId);
}

export function canCommitFortify(state: GameState, playerId: string, targetTerritoryId: string, movesBySource: FortifyMovesBySource) {
  return Boolean(validFortifyMove(state, playerId, targetTerritoryId, movesBySource));
}

export function commitFortifyAndFinishTurn(state: GameState, playerId: string, targetTerritoryId: string, movesBySource: FortifyMovesBySource): GameState {
  const validMove = validFortifyMove(state, playerId, targetTerritoryId, movesBySource);
  if (!validMove || !state.allocation || !state.turn) {
    return state;
  }

  const playerAllocation = state.allocation.playerAllocations[playerId];
  if (!playerAllocation) {
    return state;
  }

  let territories = { ...playerAllocation.territories };
  let spies = state.turn.spies;

  for (const [sourceTerritoryId, move] of Object.entries(validMove.movesBySource)) {
    territories = {
      ...territories,
      [sourceTerritoryId]: subtractTroops(territories[sourceTerritoryId] ?? createTroopCounts(), move.troops),
      [targetTerritoryId]: addTroops(territories[targetTerritoryId] ?? createTroopCounts(), move.troops),
    };

    for (const spyOwnerId of move.spyOwnerIds) {
      spies = {
        ...spies,
        [spyOwnerId]: {
          status: "captured",
          territoryId: targetTerritoryId,
          custodianPlayerId: playerId,
        },
      };
    }
  }

  return advanceTurn(restoreCapturedSpies({
    ...state,
    allocation: {
      ...state.allocation,
      playerAllocations: {
        ...state.allocation.playerAllocations,
        [playerId]: {
          ...playerAllocation,
          territories,
        },
      },
    },
    turn: {
      ...state.turn,
      spies,
    },
  }));
}

export function completeTimedOutSyncAllocations(state: GameState): GameState {
  if (state.mode !== "sync" || state.phase !== "allocation" || !state.allocation) {
    return state;
  }

  let next = state;
  for (const player of state.players) {
    if (!next.allocation?.playerAllocations[player.id]?.ready) {
      next = randomCompleteAllocationForPlayer(next, player.id);
    }
  }

  return {
    ...next,
    phase: "allocation",
    allocation: next.allocation
      ? {
          ...next.allocation,
          timerEndsAt: null,
          timerRemainingMs: null,
        }
      : next.allocation,
  };
}

export function completeTimedOutAllocation(state: GameState, allocationPlayerId: string | null, now: number): GameState {
  if (state.phase !== "allocation" || !state.allocation?.timerEndsAt || state.allocation.timerEndsAt > now) {
    return state;
  }

  if (state.mode === "sync") {
    return completeTimedOutSyncAllocations(state);
  }

  return allocationPlayerId
    ? finishAllocationForPlayer(randomCompleteAllocationForPlayer(state, allocationPlayerId), allocationPlayerId)
    : state;
}

export function applySyncAllocationUpdate(state: GameState, playerId: string, update: PlayerAllocation): GameState {
  const allocation = state.allocation;
  const ownership = state.draft?.ownership;
  const currentPlayerAllocation = allocation?.playerAllocations[playerId];
  if (state.mode !== "sync" || state.phase !== "allocation" || !allocation || !ownership || !currentPlayerAllocation || !state.players.some((player) => player.id === playerId)) {
    return state;
  }

  // Ready and random-completed allocations are host-authoritative and final.
  if (currentPlayerAllocation.ready || currentPlayerAllocation.randomCompleted) {
    return state;
  }

  const proposedAllocation = {
    ...allocation,
    playerAllocations: {
      ...allocation.playerAllocations,
      [playerId]: {
        ...update,
        randomCompleted: false,
      },
    },
  };
  const proposedPlayerAllocation = proposedAllocation.playerAllocations[playerId];
  const ready = proposedPlayerAllocation.ready && allocationComplete(proposedAllocation, ownership, playerId);
  const nextAllocation = {
    ...proposedAllocation,
    playerAllocations: {
      ...proposedAllocation.playerAllocations,
      [playerId]: {
        ...proposedPlayerAllocation,
        ready,
      },
    },
  };

  return {
    ...state,
    allocation: ready && allAllocationsReady(nextAllocation, state.players)
      ? clearAllocationTimer(nextAllocation, state.config)
      : nextAllocation,
  };
}

export function applySyncProfileUpdate(state: GameState, playerId: string, updates: { color?: PlayerColor | null; name?: string }): GameState {
  if (state.mode !== "sync" || state.phase !== "setup") {
    return state;
  }

  return {
    ...state,
    players: state.players.map((player) => {
      if (player.id !== playerId) {
        return player;
      }

      return {
        ...player,
        name: updates.name !== undefined && !player.nameLocked ? updates.name.trim() : player.name,
        color: updates.color !== undefined && !player.colorLocked ? updates.color : player.color,
        connectionStatus: "connected",
      };
    }),
  };
}

export function applySyncDraftConfirm(state: GameState, playerId: string, territoryId: string, now: number): GameState {
  if (state.mode !== "sync" || state.phase !== "draft" || activePlayer(state)?.id !== playerId || !canPickTerritory(state, territoryId)) {
    return state;
  }

  return confirmTerritoryPick(state, territoryId, now);
}

export function applySyncTurnCommand(state: GameState, playerId: string, command: TurnCommand): GameState {
  if (command.type === "confirmSpy") {
    return confirmSpyAttempt(startSpySelection(state, playerId), playerId, command.territoryId);
  }

  if (command.type === "dismissSpy") {
    return dismissSpyIntel(state, playerId);
  }

  if (command.type === "dismissNotification") {
    return dismissNotification(state, playerId, command.notificationId);
  }

  if (command.type === "commitReinforcements") {
    return commitReinforcements(state, playerId, command.reinforcement);
  }

  if (command.type === "commitAttack") {
    return commitAttack(state, playerId, command.sourceTerritoryId, command.targetTerritoryId, command.attackingTroops);
  }

  if (command.type === "submitBattleScore") {
    return submitBattleScore(state, playerId, command.battleId, command.score);
  }

  if (command.type === "rollBattle") {
    return rollBattle(state, playerId, command.battleId);
  }

  if (command.type === "retreatBattle") {
    return retreatBattle(state, playerId, command.battleId);
  }

  if (command.type === "dismissBattle") {
    return dismissBattle(state, playerId, command.battleId);
  }

  if (command.type === "commitFortify") {
    return commitFortifyAndFinishTurn(cancelSpySelection(state), playerId, command.targetTerritoryId, command.movesBySource);
  }

  return skipFortifyAndFinishTurn(cancelSpySelection(state), playerId);
}

export function applySyncPlayerQuit(state: GameState, playerId: string): GameState {
  if (state.mode !== "sync" || (state.phase !== "setup" && state.phase !== "draft" && state.phase !== "allocation" && state.phase !== "turn" && state.phase !== "paused")) {
    return state;
  }

  const next = removePlayerFromDraft(state, playerId);
  return (state.phase === "draft" || state.phase === "allocation" || state.phase === "turn") && next.phase !== "home"
    ? pauseSyncGame(next)
    : next;
}

export function applySyncPlayerConnectionStatus(state: GameState, playerId: string, connectionStatus: GamePlayer["connectionStatus"]): GameState {
  if (state.mode !== "sync") {
    return state;
  }

  if (state.phase === "setup" && connectionStatus !== "connected") {
    return removePlayerFromDraft(state, playerId);
  }

  const next = markSyncPlayerStatus(state, playerId, connectionStatus);
  return connectionStatus !== "connected" && (state.phase === "draft" || state.phase === "allocation" || state.phase === "turn")
    ? pauseSyncGame(next)
    : next;
}

export function removeNonConnectedSyncLobbyPlayers(state: GameState): GameState {
  if (state.mode !== "sync" || state.phase !== "setup") {
    return state;
  }

  return {
    ...state,
    players: state.players.filter((player) => player.connectionStatus === "connected"),
  };
}

export function pauseSyncGame(state: GameState): GameState {
  return {
    ...state,
    phase: "paused",
    draft: state.draft
      ? clearDraftTimer(state.draft, state.config)
      : state.draft,
    allocation: state.allocation
      ? {
          ...state.allocation,
          timerEndsAt: null,
        }
      : state.allocation,
    turn: state.turn
      ? {
          ...state.turn,
          stage: state.turn.stage === "spyIntel" ? state.turn.spyReturnStage ?? "reinforcementReady" : state.turn.stage,
          spyReturnStage: null,
          spyIntel: null,
          reinforcement: null,
        }
      : state.turn,
  };
}

export function pauseGame(state: GameState, now: number): GameState {
  if (state.phase === "draft" && state.draft) {
    return state.mode === "sync"
      ? pauseSyncGame(state)
      : {
          ...state,
          phase: "paused",
          draft: pauseDraftTimer(state.draft, now),
        };
  }

  if (state.phase === "allocation" && state.allocation) {
    return {
      ...state,
      phase: "paused",
      allocation: state.mode === "sync"
        ? {
            ...state.allocation,
            timerEndsAt: null,
            timerRemainingMs: state.allocation.timerRemainingMs,
          }
        : pauseAllocationTimer(state.allocation, now),
    };
  }

  if (state.phase === "gameMap") {
    return {
      ...state,
      phase: "paused",
      allocation: state.allocation
        ? {
            ...state.allocation,
            timerEndsAt: null,
          }
        : state.allocation,
    };
  }

  if (state.phase === "turn" || state.phase === "turnHandoff") {
    return state.mode === "sync"
      ? pauseSyncGame(state)
      : {
          ...state,
          phase: "paused",
        };
  }

  return state;
}

export function resumePausedGame(state: GameState, returnPhase: AppPhase | null, isSyncHost: boolean, now: number): GameState {
  if (state.phase !== "paused") {
    return state;
  }

  if (returnPhase === "gameMap") {
    return {
      ...state,
      phase: "gameMap",
    };
  }

  if (state.mode === "sync" && (!isSyncHost || state.players.some((player) => player.connectionStatus !== "connected"))) {
    return state;
  }

  if (state.turn) {
    return {
      ...state,
      phase: "turn",
    };
  }

  if (state.allocation) {
    return {
      ...state,
      phase: "allocation",
      allocation: beginAllocationTimer(state.allocation, state.config, now),
    };
  }

  if (!state.draft) {
    return state;
  }

  return {
    ...state,
    phase: "draft",
    draft: beginDraftTimer(state.draft, state.config, now),
  };
}

export function markSyncPlayerStatus(state: GameState, playerId: string, connectionStatus: GamePlayer["connectionStatus"]): GameState {
  return {
    ...state,
    players: state.players.map((player) => player.id === playerId ? { ...player, connectionStatus } : player),
  };
}

export function beginAllocationTimer(allocation: AllocationState, config: GameConfig, now: number) {
  const duration = allocation.timerRemainingMs ?? troopTimerMs(config.troopAllocationTimeLimit);
  if (!duration) {
    return { ...allocation, timerRemainingMs: null, timerEndsAt: null };
  }

  return {
    ...allocation,
    timerRemainingMs: duration,
    timerEndsAt: now + duration,
  };
}

export function pauseAllocationTimer(allocation: AllocationState, now: number) {
  if (!allocation.timerEndsAt) {
    return allocation;
  }

  return {
    ...allocation,
    timerRemainingMs: Math.max(0, allocation.timerEndsAt - now),
    timerEndsAt: null,
  };
}

export function clearAllocationTimer(allocation: AllocationState, config: GameConfig) {
  return {
    ...allocation,
    timerRemainingMs: troopTimerMs(config.troopAllocationTimeLimit),
    timerEndsAt: null,
  };
}

export function beginDraftTimer(draft: DraftState, config: GameConfig, now: number) {
  const duration = draft.timerRemainingMs ?? timerMs(config.pickTimeLimit);
  if (!duration) {
    return { ...draft, timerRemainingMs: null, timerEndsAt: null };
  }

  return {
    ...draft,
    timerRemainingMs: duration,
    timerEndsAt: now + duration,
  };
}

export function pauseDraftTimer(draft: DraftState, now: number) {
  if (!draft.timerEndsAt) {
    return draft;
  }

  return {
    ...draft,
    timerRemainingMs: Math.max(0, draft.timerEndsAt - now),
    timerEndsAt: null,
  };
}

export function clearDraftTimer(draft: DraftState, config: GameConfig) {
  return {
    ...draft,
    timerRemainingMs: timerMs(config.pickTimeLimit),
    timerEndsAt: null,
  };
}

export function confirmTerritoryPick(state: GameState, territoryId: string, now: number): GameState {
  if (!state.draft) {
    return state;
  }

  const player = activePlayer(state);
  if (!player || state.draft.ownership[territoryId]) {
    return state;
  }

  const ownership = {
    ...state.draft.ownership,
    [territoryId]: player.id,
  };
  const nextStep = nextStepAfterPick(state.draft, state.players, state.config.draftStyle);
  const draft = clearDraftTimer({
    ...state.draft,
    ownership,
    step: nextStep,
  }, state.config);

  if (remainingTerritoryIds(ownership).length === 0) {
    return advanceAfterDraft({
      ...state,
      phase: "allocation" as const,
      draft,
    }, now);
  }

  return {
    ...state,
    draft: beginDraftTimer(draft, state.config, now),
  };
}

export function randomPickForActivePlayer(state: GameState, now: number): GameState {
  if (!state.draft) {
    return state;
  }

  const remaining = remainingTerritoryIds(state.draft.ownership);
  if (remaining.length === 0) {
    return state;
  }

  return confirmTerritoryPick(state, randomItem(remaining), now);
}

export function completeTimedOutDraftPick(state: GameState, localCandidateTerritoryId: string | null, now: number): GameState {
  if (state.phase !== "draft" || !state.draft?.timerEndsAt || state.draft.timerEndsAt > now) {
    return state;
  }

  return localCandidateTerritoryId && canPickTerritory(state, localCandidateTerritoryId)
    ? confirmTerritoryPick(state, localCandidateTerritoryId, now)
    : randomPickForActivePlayer(state, now);
}

export function removePlayerFromDraft(state: GameState, playerId: string): GameState {
  if (state.turn && state.draft && state.allocation) {
    return removePlayerFromGameplay(state, playerId);
  }

  if (state.allocation && state.draft) {
    return removePlayerFromAllocation(state, playerId);
  }

  const players = state.players.filter((player) => player.id !== playerId);
  const draft = state.draft
    ? {
        ...state.draft,
        ownership: Object.fromEntries(
          Object.entries(state.draft.ownership).map(([territoryId, ownerId]) => [
            territoryId,
            ownerId === playerId ? null : ownerId,
          ]),
        ),
      }
    : null;

  if (state.phase !== "setup" && players.length < 2) {
    return createInitialGameState();
  }

  return {
    ...state,
    players,
    draft,
  };
}

function removePlayerFromGameplay(state: GameState, playerId: string): GameState {
  if (!state.draft || !state.allocation || !state.turn) {
    return state;
  }

  const players = state.players.filter((player) => player.id !== playerId);
  const removedPlayer = state.players.find((player) => player.id === playerId);
  if (!removedPlayer || players.length < 2) {
    return createInitialGameState();
  }

  const removedTerritories = shuffle(ownedTerritoryIds(state.draft.ownership, playerId));
  const removedTroops = shuffle(expandRemovedTroops(gameplayRemovedTroopPool(state, removedPlayer)));
  const populatedTerritories = Object.fromEntries(removedTerritories.map((territoryId) => [territoryId, createTroopCounts()]));
  const battle = state.turn.battle &&
    state.turn.battle.attackerPlayerId !== playerId &&
    state.turn.battle.defenderPlayerId !== playerId
    ? state.turn.battle
    : null;

  // Spread the removed troop pool across the removed territories first.
  if (removedTerritories.length > 0) {
    for (let index = 0; index < removedTroops.length; index += 1) {
      const territoryId = removedTerritories[index % removedTerritories.length];
      populatedTerritories[territoryId] = addOneTroop(populatedTerritories[territoryId], removedTroops[index]);
    }
  }

  const playerOrder = shuffle(players.map((player) => player.id));
  const reassignedTerritories = shuffle(removedTerritories);
  const ownership = { ...state.draft.ownership };
  const playerAllocations = { ...state.allocation.playerAllocations };
  delete playerAllocations[playerId];

  for (let index = 0; index < reassignedTerritories.length; index += 1) {
    const territoryId = reassignedTerritories[index];
    const recipientId = playerOrder[index % playerOrder.length];
    const recipient = ensureRecipientAllocation(playerAllocations[recipientId]);

    ownership[territoryId] = recipientId;
    playerAllocations[recipientId] = {
      ...recipient,
      territories: {
        ...recipient.territories,
        [territoryId]: populatedTerritories[territoryId],
      },
    };
  }

  const next = applyRegionControlChanges(restoreCapturedSpies({
    ...state,
    phase: "paused",
    players,
    draft: {
      ...state.draft,
      ownership,
    },
    allocation: {
      ...state.allocation,
      playerAllocations,
    },
    turn: {
      ...state.turn,
      currentPlayerId: state.turn.currentPlayerId === playerId
        ? nextTurnPlayerId(players, state.turn.originalTurnOrder, playerId) ?? players[0].id
        : state.turn.currentPlayerId,
      stage: battle ? "battle" : state.turn.stage === "actions" ? "actions" : "reinforcementReady",
      spyReturnStage: null,
      spyIntel: null,
      reinforcement: null,
      battle,
      spies: Object.fromEntries(Object.entries(state.turn.spies).filter(([spyPlayerId]) => spyPlayerId !== playerId)),
    },
  }), state.mode === "sync" ? "immediate" : "turnStart", state.mode === "sync" ? undefined : (state.turn.turnNumber + 1));

  return next;
}

export function nextStepAfterPick(draft: DraftState, players: GamePlayer[], draftStyle: DraftStyle) {
  let step = draft.step + 1;
  const activeIds = new Set(players.map((player) => player.id));

  for (let attempts = 0; attempts < draft.originalTurnOrder.length * 4; attempts += 1) {
    const playerId = draftPlayerIdAtStep(draft.originalTurnOrder, draftStyle, draft.startIndex, step);
    if (activeIds.has(playerId)) {
      return step;
    }

    step += 1;
  }

  return step;
}

export function nextActiveStep(draft: DraftState, players: GamePlayer[], draftStyle: DraftStyle) {
  const activeIds = new Set(players.map((player) => player.id));
  let step = draft.step;

  for (let attempts = 0; attempts < draft.originalTurnOrder.length * 4; attempts += 1) {
    const playerId = draftPlayerIdAtStep(draft.originalTurnOrder, draftStyle, draft.startIndex, step);
    if (activeIds.has(playerId)) {
      return step;
    }

    step += 1;
  }

  return null;
}

export function draftPlayerIdAtStep(originalTurnOrder: string[], draftStyle: DraftStyle, startIndex: number, step: number) {
  if (originalTurnOrder.length === 0) {
    return "";
  }

  const rotated = rotate(originalTurnOrder, startIndex);
  const cycle = draftStyle === "roundRobin"
    ? rotated
    : [...rotated, ...[...rotated].reverse()];

  return cycle[step % cycle.length];
}

export function draftStartIndex(playerCount: number, draftStyle: DraftStyle, territoryCount: number) {
  const targetIndex = playerCount - 1;
  const order = Array.from({ length: playerCount }, (_, index) => String(index));

  for (let startIndex = 0; startIndex < playerCount; startIndex += 1) {
    const playerId = draftPlayerIdAtStep(order, draftStyle, startIndex, territoryCount - 1);
    if (Number(playerId) === targetIndex) {
      return startIndex;
    }
  }

  return 0;
}

function startTurnLoop(state: GameState, useHandoff: boolean): GameState {
  const currentPlayerId = nextTurnPlayerId(state.players, state.draft?.originalTurnOrder ?? []);
  if (!currentPlayerId) {
    return createInitialGameState();
  }

  return applyRegionControlChanges({
    ...state,
    phase: useHandoff && state.mode === "local" ? "turnHandoff" : "turn",
    turn: createTurnState(state.players, state.draft?.originalTurnOrder ?? [], currentPlayerId),
  }, "turnStart");
}

function createTurnState(players: GamePlayer[], originalTurnOrder: string[], currentPlayerId: string): TurnState {
  return {
    originalTurnOrder: originalTurnOrder.length > 0 ? originalTurnOrder : players.map((player) => player.id),
    currentPlayerId,
    turnNumber: 1,
    stage: "reinforcementReady",
    spyReturnStage: null,
    spies: Object.fromEntries(players.map((player) => [player.id, createAvailableSpy()])),
    spyIntel: null,
    reinforcement: null,
    battle: null,
    completedAttacks: [],
  };
}

function advanceTurn(state: GameState): GameState {
  const turn = state.turn;
  if (!turn) {
    return state;
  }

  const nextPlayerId = nextTurnPlayerId(state.players, turn.originalTurnOrder, turn.currentPlayerId);
  if (!nextPlayerId) {
    return createInitialGameState();
  }

  const nextTurn = {
    ...turn,
    currentPlayerId: nextPlayerId,
    turnNumber: turn.turnNumber + 1,
    stage: "reinforcementReady" as TurnStage,
    spyReturnStage: null,
    spyIntel: null,
    reinforcement: null,
    battle: null,
    completedAttacks: [],
  };

  return applyRegionControlChanges({
    ...state,
    phase: state.mode === "local" ? "turnHandoff" : "turn",
    turn: restoreCapturedSpies({
      ...state,
      turn: nextTurn,
    }).turn,
  }, "turnStart");
}

function nextTurnPlayerId(players: GamePlayer[], originalTurnOrder: string[], currentPlayerId?: string) {
  const activeIds = new Set(players.map((player) => player.id));
  const order = originalTurnOrder.filter((playerId) => activeIds.has(playerId));
  if (order.length === 0) {
    return null;
  }

  if (!currentPlayerId) {
    return order[0];
  }

  const currentIndex = order.indexOf(currentPlayerId);
  return order[(currentIndex + 1) % order.length] ?? order[0];
}

function sameOwnerConnectedTerritoryIds(ownership: TerritoryOwnerMap, territoryId: string, ownerId: string) {
  return outgoingTerritoryIds(territoryId).filter((connectedId) => ownership[connectedId] === ownerId);
}

function nearestOwnedDistance(ownership: TerritoryOwnerMap | null, playerId: string, targetTerritoryId: string) {
  if (!ownership || ownership[targetTerritoryId] === playerId) {
    return null;
  }

  return directedDistanceFromAny(ownedTerritoryIds(ownership, playerId), targetTerritoryId);
}

function applyRegionControlChanges(state: GameState, delivery: "turnStart" | "immediate", minTurnNumber = state.turn?.turnNumber ?? 0): GameState {
  const ownership = state.draft?.ownership;
  if (!ownership) {
    return state;
  }

  const nextControl = regionControlForOwnership(ownership);
  const notifications: Array<GameNotification | null> = [];

  // Compare region control as game facts, independent of how ownership changed.
  for (const regionId of REGION_IDS) {
    const previousOwner = state.regionControl[regionId] ?? null;
    const nextOwner = nextControl[regionId] ?? null;

    if (previousOwner === nextOwner) {
      continue;
    }

    if (previousOwner) {
      notifications.push({
        id: createNotificationId(),
        type: "regionLost",
        playerId: previousOwner,
        regionId,
        delivery,
        minTurnNumber,
      });
    }

    if (nextOwner) {
      notifications.push({
        id: createNotificationId(),
        type: "regionGained",
        playerId: nextOwner,
        regionId,
        delivery,
        minTurnNumber,
      });
    }
  }

  return queueNotifications({
    ...state,
    regionControl: nextControl,
  }, notifications);
}

function regionControlForOwnership(ownership: TerritoryOwnerMap): Record<string, string | null> {
  const control = createRegionControl();

  for (const regionId of REGION_IDS) {
    control[regionId] = regionOwner(ownership, regionId);
  }

  return control;
}

function regionOwner(ownership: TerritoryOwnerMap, regionId: string) {
  const regionTerritories = territoriesInRegion(regionId);
  if (regionTerritories.length === 0) {
    return null;
  }

  const firstOwner = ownership[regionTerritories[0].id];
  if (!firstOwner) {
    return null;
  }

  return regionTerritories.every((territory) => ownership[territory.id] === firstOwner) ? firstOwner : null;
}

function queueNotifications(state: GameState, notifications: Array<GameNotification | null>): GameState {
  const playerIds = new Set(state.players.map((player) => player.id));
  let nextQueues = state.notifications;

  for (const notification of notifications) {
    if (!notification || !playerIds.has(notification.playerId)) {
      continue;
    }

    nextQueues = {
      ...nextQueues,
      [notification.playerId]: [
        ...(nextQueues[notification.playerId] ?? []),
        notification,
      ],
    };
  }

  return nextQueues === state.notifications
    ? state
    : {
        ...state,
        notifications: nextQueues,
      };
}

function createNotificationId() {
  return crypto.randomUUID();
}

function reinforcementBudget(ownership: TerritoryOwnerMap, playerId: string) {
  return Math.max(3, Math.floor(ownedTerritoryIds(ownership, playerId).length / 3));
}

function regionBonusTroops(ownership: TerritoryOwnerMap, playerId: string) {
  let bonus = createTroopCounts();

  for (const [regionId, troops] of Object.entries(REGION_REINFORCEMENTS)) {
    const regionTerritories = territoriesInRegion(regionId);
    if (regionTerritories.length > 0 && regionTerritories.every((territory) => ownership[territory.id] === playerId)) {
      bonus = addTroops(bonus, troops);
    }
  }

  return bonus;
}

function restoreCapturedSpies(state: GameState): GameState {
  const turn = state.turn;
  const ownership = state.draft?.ownership;
  if (!turn || !ownership) {
    return state;
  }

  let spies = turn.spies;
  for (const [playerId, spy] of Object.entries(turn.spies)) {
    if (spy.status !== "captured" || !spy.territoryId) {
      continue;
    }

    const territoryOwnerId = ownership[spy.territoryId];
    if (territoryOwnerId === playerId) {
      spies = {
        ...spies,
        [playerId]: createAvailableSpy(),
      };
    } else if (territoryOwnerId && territoryOwnerId !== spy.custodianPlayerId) {
      spies = {
        ...spies,
        [playerId]: {
          ...spy,
          custodianPlayerId: territoryOwnerId,
        },
      };
    }
  }

  return spies === turn.spies
    ? state
    : {
        ...state,
        turn: {
          ...turn,
          spies,
        },
      };
}

function createAvailableSpy() {
  return {
    status: "available" as const,
    territoryId: null,
    custodianPlayerId: null,
  };
}

function validCommittedReinforcement(state: GameState, playerId: string, reinforcement: ReinforcementState) {
  const ownership = state.draft?.ownership;
  if (!ownership || !reinforcement.buildSubmitted || troopTotal(remainingReinforcementTroops(reinforcement)) !== 0) {
    return false;
  }

  for (const troops of [reinforcement.baseTroops, reinforcement.bonusTroops, ...Object.values(reinforcement.territories)]) {
    if (!validTroopCounts(troops)) {
      return false;
    }
  }

  return Object.entries(reinforcement.territories).every(([territoryId]) => ownership[territoryId] === playerId);
}

function validFortifyMove(state: GameState, playerId: string, targetTerritoryId: string, movesBySource: FortifyMovesBySource) {
  const turn = state.turn;
  const ownership = state.draft?.ownership;
  const playerAllocation = state.allocation?.playerAllocations[playerId];
  if (state.phase !== "turn" || !turn || turn.currentPlayerId !== playerId || turn.stage !== "actions" || !ownership || !playerAllocation || ownership[targetTerritoryId] !== playerId) {
    return null;
  }

  const eligibleSources = directedOwnedSourcesReachingTarget(ownership, targetTerritoryId, playerId);
  const movedSpyOwnerIds = new Set<string>();
  const normalizedMoves: FortifyMovesBySource = {};
  let regularSourceId: string | null = null;
  let movedAnything = false;

  for (const [sourceTerritoryId, move] of Object.entries(movesBySource)) {
    if (!move || typeof move !== "object" || sourceTerritoryId === targetTerritoryId || !eligibleSources.has(sourceTerritoryId) || !validTroopCounts(move.troops) || !Array.isArray(move.spyOwnerIds)) {
      return null;
    }

    const spyOwnerIds = [...new Set(move.spyOwnerIds)];
    const movedTroops = createTroopCounts(move.troops);
    if (troopTotal(movedTroops) === 0 && spyOwnerIds.length === 0) {
      continue;
    }

    const sourceTroops = playerAllocation.territories[sourceTerritoryId] ?? createTroopCounts();
    const sourceRemaining = subtractTroops(sourceTroops, movedTroops);
    if (!validTroopCounts(sourceRemaining) || troopTotal(sourceRemaining) <= 0) {
      return null;
    }

    const immediate = hasDirectedConnection(sourceTerritoryId, targetTerritoryId);
    if (!immediate && (movedTroops.heavy > 0 || movedTroops.elite > 0 || movedTroops.leader > 0)) {
      return null;
    }

    if (!validFortifySpies(state, playerId, sourceTerritoryId, spyOwnerIds, movedSpyOwnerIds)) {
      return null;
    }

    if (!immediate && spyOwnerIds.length > 0 && movedTroops.cavalry <= 0) {
      return null;
    }

    if (immediate && (movedTroops.heavy > 0 || movedTroops.elite > 0 || movedTroops.leader > 0 || spyOwnerIds.length > 0)) {
      if (regularSourceId && regularSourceId !== sourceTerritoryId) {
        return null;
      }

      regularSourceId = sourceTerritoryId;
    }

    normalizedMoves[sourceTerritoryId] = {
      spyOwnerIds,
      troops: movedTroops,
    };
    movedAnything = true;
  }

  return movedAnything
    ? { movesBySource: normalizedMoves }
    : null;
}

function validFortifySpies(state: GameState, playerId: string, sourceTerritoryId: string, spyOwnerIds: string[], movedSpyOwnerIds: Set<string>) {
  for (const spyOwnerId of spyOwnerIds) {
    if (movedSpyOwnerIds.has(spyOwnerId)) {
      return false;
    }

    const spy = state.turn?.spies[spyOwnerId];
    if (spy?.status !== "captured" || spy.territoryId !== sourceTerritoryId || spy.custodianPlayerId !== playerId) {
      return false;
    }

    movedSpyOwnerIds.add(spyOwnerId);
  }

  return true;
}

function validTroopCounts(counts: TroopCounts) {
  return TROOP_TYPES.every((troopType) => Number.isInteger(counts[troopType]) && counts[troopType] >= 0);
}

export function timerMs(limit: PickTimeLimit) {
  return limit > 0 ? limit * 1000 : null;
}

export function troopTimerMs(limit: TroopAllocationTimeLimit) {
  return limit > 0 ? limit * 1000 : null;
}

export function secondsLabel(value: number | null) {
  if (!value) {
    return "Unlimited";
  }

  return `${Math.ceil(value / 1000)}s`;
}

export function formatTimerOption(seconds: PickTimeLimit) {
  return seconds === 0 ? "Unlimited" : `${seconds}s`;
}

export function formatTroopTimerOption(seconds: TroopAllocationTimeLimit) {
  return seconds === 0 ? "Unlimited" : `${seconds / 60}m`;
}

export function saveLocalGame(state: GameState) {
  if (state.mode !== "local") {
    return;
  }

  localStorage.setItem(LOCAL_GAME_KEY, JSON.stringify(state));
}

export function pauseLocalGameForStorage(state: GameState, now: number): GameState {
  if (state.mode !== "local") {
    return state;
  }

  return pauseGame(state, now);
}

export function saveSyncHostGame(state: GameState, localPlayerId: string | null, revision: number) {
  if (state.mode !== "sync" || !localPlayerId) {
    return;
  }

  localStorage.setItem(SYNC_HOST_GAME_KEY, JSON.stringify({
    game: state,
    localPlayerId,
    revision,
  }));
}

export function readLocalGame() {
  try {
    const raw = localStorage.getItem(LOCAL_GAME_KEY);
    return raw ? normalizeGameState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function readSyncHostGame() {
  try {
    const raw = localStorage.getItem(SYNC_HOST_GAME_KEY);
    const save = raw ? JSON.parse(raw) as unknown : null;
    if (!save || typeof save !== "object") {
      return null;
    }

    const partial = save as { game?: unknown; localPlayerId?: unknown; revision?: unknown };
    const game = normalizeGameState(partial.game);
    if (!game || game.mode !== "sync" || typeof partial.localPlayerId !== "string") {
      return null;
    }

    return {
      game: restoreSyncHostGame(game, partial.localPlayerId),
      localPlayerId: partial.localPlayerId,
      revision: typeof partial.revision === "number" ? partial.revision : 0,
    };
  } catch {
    return null;
  }
}

export function clearLocalGame() {
  localStorage.removeItem(LOCAL_GAME_KEY);
}

export function clearSyncHostGame() {
  localStorage.removeItem(SYNC_HOST_GAME_KEY);
}

function restoreSyncHostGame(game: GameState, localPlayerId: string): GameState {
  const players = game.players.map((player) => ({
    ...player,
    connectionStatus: player.id === localPlayerId ? "connected" as const : "disconnected" as const,
  }));
  const restored = {
    ...game,
    players,
    draft: game.draft
      ? {
          ...game.draft,
          timerEndsAt: null,
        }
      : game.draft,
    allocation: game.allocation
      ? {
          ...game.allocation,
          timerEndsAt: null,
        }
      : game.allocation,
  };

  return game.phase === "draft" || game.phase === "allocation" || game.phase === "turn" || game.phase === "turnHandoff"
    ? { ...restored, phase: "paused" }
    : removeNonConnectedSyncLobbyPlayers(restored);
}

function simulateRandomDraft(players: GamePlayer[], config: GameConfig, draft: DraftState) {
  let state: GameState = {
    phase: "draft",
    mode: "local",
    players,
    config,
    draft,
    allocation: null,
    turn: null,
    notifications: {},
    regionControl: createRegionControl(),
  };

  while (state.draft && remainingTerritoryIds(state.draft.ownership).length > 0) {
    if (!activePlayer(state)) {
      return state.draft;
    }

    state = randomPickForActivePlayer(state, Date.now());
    if (state.draft) {
      state = {
        ...state,
        phase: "draft" as const,
      };
    }
  }

  return state.draft ?? draft;
}

function createAllocationState(players: GamePlayer[], ownership: TerritoryOwnerMap, config: GameConfig): AllocationState {
  const playerAllocations: AllocationState["playerAllocations"] = {};

  for (const player of players) {
    const territories = Object.fromEntries(ownedTerritoryIds(ownership, player.id).map((territoryId) => [territoryId, createTroopCounts()]));
    playerAllocations[player.id] = {
      marker: { ...CENTER_MARKER },
      buildSubmitted: false,
      baseTroops: createTroopCounts(),
      inheritedTroops: createTroopCounts(),
      territories,
      ready: false,
      randomCompleted: false,
    };
  }

  return {
    originalPlayerCount: players.length,
    order: players.map((player) => player.id),
    currentIndex: 0,
    timerRemainingMs: troopTimerMs(config.troopAllocationTimeLimit),
    timerEndsAt: null,
    playerAllocations,
  };
}

function removePlayerFromAllocation(state: GameState, playerId: string): GameState {
  if (!state.allocation || !state.draft) {
    return state;
  }

  const removedPlayer = state.players.find((player) => player.id === playerId);
  const players = state.players.filter((player) => player.id !== playerId);
  if (!removedPlayer || players.length < 2) {
    return createInitialGameState();
  }

  const removedTerritories = shuffle(ownedTerritoryIds(state.draft.ownership, playerId));
  const playerOrder = shuffle(players.map((player) => player.id));
  const removedTroops = shuffle(expandRemovedTroops(removedTroopPool(state.allocation, removedPlayer)));
  const ownership = { ...state.draft.ownership };
  const playerAllocations = { ...state.allocation.playerAllocations };
  delete playerAllocations[playerId];

  // Give each removed territory to a remaining player in round-robin order.
  const territoryRecipients = new Map<string, string>();
  for (let index = 0; index < removedTerritories.length; index += 1) {
    const recipientId = playerOrder[index % playerOrder.length];
    const territoryId = removedTerritories[index];
    ownership[territoryId] = recipientId;
    territoryRecipients.set(territoryId, recipientId);
    playerAllocations[recipientId] = ensureRecipientAllocation(playerAllocations[recipientId]);
    playerAllocations[recipientId] = {
      ...playerAllocations[recipientId],
      ready: false,
      territories: {
        ...playerAllocations[recipientId].territories,
        [territoryId]: createTroopCounts(),
      },
    };
  }

  // Place one removed troop on each new territory before assigning extras.
  let troopIndex = 0;
  for (const territoryId of removedTerritories) {
    const recipientId = territoryRecipients.get(territoryId);
    const troopType = removedTroops[troopIndex];
    if (!recipientId || !troopType) {
      break;
    }

    const recipient = ensureRecipientAllocation(playerAllocations[recipientId]);
    playerAllocations[recipientId] = {
      ...recipient,
      inheritedTroops: addOneTroop(recipient.inheritedTroops, troopType),
      territories: {
        ...recipient.territories,
        [territoryId]: addOneTroop(recipient.territories[territoryId] ?? createTroopCounts(), troopType),
      },
      ready: false,
    };
    troopIndex += 1;
  }

  // Extra removed troops become unallocated inherited troops by the same player order.
  for (; troopIndex < removedTroops.length; troopIndex += 1) {
    const recipientId = playerOrder[(troopIndex - removedTerritories.length) % playerOrder.length];
    const troopType = removedTroops[troopIndex];
    const recipient = ensureRecipientAllocation(playerAllocations[recipientId]);
    playerAllocations[recipientId] = {
      ...recipient,
      inheritedTroops: addOneTroop(recipient.inheritedTroops, troopType),
      ready: false,
    };
  }

  const readyRecipients = new Set(players.filter((player) => state.allocation?.playerAllocations[player.id]?.ready).map((player) => player.id));
  const secondTurns = state.mode === "local"
    ? playerOrder.filter((recipientId) => readyRecipients.has(recipientId))
    : [];
  const allocation = {
    ...state.allocation,
    order: [...state.allocation.order.filter((id) => id !== playerId), ...secondTurns],
    currentIndex: Math.min(state.allocation.currentIndex, Math.max(0, state.allocation.order.length - 2)),
    playerAllocations,
  };

  return {
    ...state,
    players,
    draft: {
      ...state.draft,
      ownership,
    },
    allocation,
  };
}

function removedTroopPool(allocation: AllocationState, player: GamePlayer): TroopCounts {
  const playerAllocation = allocation.playerAllocations[player.id];
  if (!playerAllocation) {
    return createTroopCounts();
  }

  const baseTroops = playerAllocation.buildSubmitted
    ? playerAllocation.baseTroops
    : armyCountsForMarker({ ...CENTER_MARKER }, player.color, allocation.originalPlayerCount);

  return addTroops(baseTroops, playerAllocation.inheritedTroops);
}

function allPlacedTroops(allocation: AllocationState, playerId: string): TroopCounts {
  const playerAllocation = allocation.playerAllocations[playerId];
  if (!playerAllocation) {
    return createTroopCounts();
  }

  let total = createTroopCounts();
  for (const troops of Object.values(playerAllocation.territories)) {
    total = addTroops(total, troops);
  }

  return total;
}

function gameplayRemovedTroopPool(state: GameState, player: GamePlayer): TroopCounts {
  if (!state.allocation || !state.draft || !state.turn) {
    return createTroopCounts();
  }

  let total = allPlacedTroops(state.allocation, player.id);
  if (state.turn.currentPlayerId !== player.id || !turnHasPendingReinforcement(state.turn)) {
    return total;
  }

  const reinforcement = state.turn.reinforcement;
  if (reinforcement) {
    return addTroops(total, projectReinforcementTroops(state, player.id));
  }

  return addTroops(
    total,
    addTroops(
      reinforcementCountsForMarker(CENTER_MARKER, reinforcementBudget(state.draft.ownership, player.id)),
      regionBonusTroops(state.draft.ownership, player.id),
    ),
  );
}

function turnHasPendingReinforcement(turn: TurnState) {
  if (turn.stage === "actions" || turn.stage === "battle") {
    return false;
  }

  if ((turn.stage === "spyTarget" || turn.stage === "spyIntel") && turn.spyReturnStage === "actions") {
    return false;
  }

  return true;
}

function ensureRecipientAllocation(allocation: AllocationState["playerAllocations"][string] | undefined): AllocationState["playerAllocations"][string] {
  return allocation ?? {
    marker: { ...CENTER_MARKER },
    buildSubmitted: false,
    baseTroops: createTroopCounts(),
    inheritedTroops: createTroopCounts(),
    territories: {},
    ready: false,
    randomCompleted: false,
  };
}

function markAllocationReady(allocation: AllocationState, playerId: string): AllocationState {
  const playerAllocation = allocation.playerAllocations[playerId];
  if (!playerAllocation) {
    return allocation;
  }

  return {
    ...allocation,
    playerAllocations: {
      ...allocation.playerAllocations,
      [playerId]: {
        ...playerAllocation,
        ready: true,
      },
    },
  };
}

function allAllocationsReady(allocation: AllocationState, players: GamePlayer[]) {
  return players.every((player) => allocation.playerAllocations[player.id]?.ready);
}

function nextLocalAllocationIndex(allocation: AllocationState, players: GamePlayer[]) {
  const activeIds = new Set(players.map((player) => player.id));
  for (let index = allocation.currentIndex + 1; index < allocation.order.length; index += 1) {
    const playerId = allocation.order[index];
    if (activeIds.has(playerId) && !allocation.playerAllocations[playerId]?.ready) {
      return index;
    }
  }

  return null;
}

function randomCompleteAllAllocations(allocation: AllocationState, ownership: TerritoryOwnerMap, players: GamePlayer[]): AllocationState {
  let nextAllocation = allocation;

  // Each player receives a random legal army and immediate placements.
  for (const player of players) {
    nextAllocation = randomCompleteStartingAllocation(nextAllocation, ownership, player);
  }

  return nextAllocation;
}

function randomCompleteStartingAllocation(allocation: AllocationState, ownership: TerritoryOwnerMap, player: GamePlayer): AllocationState {
  const playerAllocation = allocation.playerAllocations[player.id];
  if (!playerAllocation) {
    return allocation;
  }

  const marker = randomArmyMarker();
  const baseTroops = armyCountsForMarker(marker, player.color, allocation.originalPlayerCount);
  const builtAllocation = {
    ...allocation,
    playerAllocations: {
      ...allocation.playerAllocations,
      [player.id]: {
        ...playerAllocation,
        marker,
        buildSubmitted: true,
        baseTroops,
      },
    },
  };
  const filledAllocation = randomPlaceStartingAllocation(builtAllocation, ownership, player.id);

  return {
    ...filledAllocation,
    playerAllocations: {
      ...filledAllocation.playerAllocations,
      [player.id]: {
        ...filledAllocation.playerAllocations[player.id],
        ready: true,
        randomCompleted: true,
      },
    },
  };
}

function randomPlaceStartingAllocation(allocation: AllocationState, ownership: TerritoryOwnerMap, playerId: string): AllocationState {
  const playerAllocation = allocation.playerAllocations[playerId];
  if (!playerAllocation) {
    return allocation;
  }

  const ownedIds = shuffle(ownedTerritoryIds(ownership, playerId));
  const troops = shuffle(expandTroops(remainingTroops(allocation, playerId)));
  const territories = { ...playerAllocation.territories };
  let troopIndex = 0;

  if (troops.length < ownedIds.length) {
    throw new Error(`Random allocation cannot place one troop on every territory for ${playerId}.`);
  }

  // Place one random troop on every owned territory first.
  for (const territoryId of ownedIds) {
    const troopType = troops[troopIndex];
    territories[territoryId] = addOneTroop(territories[territoryId] ?? createTroopCounts(), troopType);
    troopIndex += 1;
  }

  const borderTargets = ownedIds.filter((territoryId) => bordersOpponentTerritory(ownership, playerId, territoryId));
  if (troopIndex < troops.length && borderTargets.length === 0) {
    throw new Error(`Random allocation found no border territories for ${playerId}.`);
  }

  // Extra troops go only to territories bordering an opponent.
  for (; troopIndex < troops.length; troopIndex += 1) {
    const territoryId = randomItem(borderTargets);
    const troopType = troops[troopIndex];
    territories[territoryId] = addOneTroop(territories[territoryId] ?? createTroopCounts(), troopType);
  }

  return {
    ...allocation,
    playerAllocations: {
      ...allocation.playerAllocations,
      [playerId]: {
        ...playerAllocation,
        territories,
      },
    },
  };
}

function bordersOpponentTerritory(ownership: TerritoryOwnerMap, playerId: string, territoryId: string) {
  return outgoingTerritoryIds(territoryId).some((connectedId) => ownership[connectedId] && ownership[connectedId] !== playerId);
}

function randomArmyMarker(): ArmyMarker {
  const root = Math.sqrt(Math.random());
  const split = Math.random();

  return {
    heavy: 1 - root,
    cavalry: root * (1 - split),
    elite: root * split,
  };
}

function randomFillAllocation(allocation: AllocationState, ownership: TerritoryOwnerMap, playerId: string): AllocationState {
  const playerAllocation = allocation.playerAllocations[playerId];
  if (!playerAllocation) {
    return allocation;
  }

  const ownedIds = ownedTerritoryIds(ownership, playerId);
  const remaining = remainingTroops(allocation, playerId);
  const emptyTerritories = ownedIds.filter((territoryId) => troopTotal(playerAllocation.territories[territoryId] ?? ZERO_TROOPS) === 0);
  const firstTargets = shuffle(emptyTerritories);
  const allTargets = shuffle(ownedIds);
  const troops = shuffle(expandTroops(remaining));
  const territories = { ...playerAllocation.territories };
  let troopIndex = 0;

  // Fill empty territories first so the one-troop minimum is preserved.
  for (const territoryId of firstTargets) {
    const troopType = troops[troopIndex];
    if (!troopType) {
      break;
    }

    territories[territoryId] = addOneTroop(territories[territoryId] ?? createTroopCounts(), troopType);
    troopIndex += 1;
  }

  const targets = allTargets.length > 0 ? allTargets : firstTargets;
  for (; troopIndex < troops.length; troopIndex += 1) {
    const territoryId = targets[(troopIndex - firstTargets.length) % targets.length];
    const troopType = troops[troopIndex];
    territories[territoryId] = addOneTroop(territories[territoryId] ?? createTroopCounts(), troopType);
  }

  return {
    ...allocation,
    playerAllocations: {
      ...allocation.playerAllocations,
      [playerId]: {
        ...playerAllocation,
        territories,
      },
    },
  };
}

function expandTroops(counts: TroopCounts) {
  const troops: TroopType[] = [];
  for (const troopType of TROOP_TYPES) {
    for (let count = 0; count < counts[troopType]; count += 1) {
      troops.push(troopType);
    }
  }

  return troops;
}

function expandRemovedTroops(counts: TroopCounts) {
  const troops: TroopType[] = [];
  for (const troopType of TROOP_TYPES) {
    for (let count = 0; count < counts[troopType]; count += 1) {
      troops.push(troopType === "leader" ? randomMixtureTroop() : troopType);
    }
  }

  return troops;
}

function randomMixtureTroop() {
  return MIXTURE_TROOP_TYPES[Math.floor(Math.random() * MIXTURE_TROOP_TYPES.length)];
}

function finishBattleConquest(state: GameState, battle: BattleState): GameState {
  if (!state.draft || !state.allocation || !state.turn) {
    return state;
  }

  const attackerAllocation = state.allocation.playerAllocations[battle.attackerPlayerId];
  const defenderAllocation = state.allocation.playerAllocations[battle.defenderPlayerId];
  if (!attackerAllocation || !defenderAllocation) {
    return state;
  }

  const attackerSpy = state.turn.spies[battle.attackerPlayerId];
  const releasedAttackerSpy = attackerSpy?.status === "captured" && attackerSpy.territoryId === battle.targetTerritoryId;
  const sourceTroops = attackerAllocation.territories[battle.sourceTerritoryId] ?? createTroopCounts();
  const attackingTerritories = {
    ...attackerAllocation.territories,
    [battle.sourceTerritoryId]: subtractTroops(sourceTroops, battle.attackingTroops),
    [battle.targetTerritoryId]: createTroopCounts(battle.attackingTroops),
  };
  const defendingTerritories = { ...defenderAllocation.territories };
  delete defendingTerritories[battle.targetTerritoryId];

  const conqueredState = restoreCapturedSpies(markDeadSpiesForEliminatedPlayers({
    ...state,
    draft: {
      ...state.draft,
      ownership: {
        ...state.draft.ownership,
        [battle.targetTerritoryId]: battle.attackerPlayerId,
      },
    },
    allocation: {
      ...state.allocation,
      playerAllocations: {
        ...state.allocation.playerAllocations,
        [battle.attackerPlayerId]: {
          ...attackerAllocation,
          territories: attackingTerritories,
        },
        [battle.defenderPlayerId]: {
          ...defenderAllocation,
          territories: defendingTerritories,
        },
      },
    },
    turn: {
      ...state.turn,
      battle: state.turn.battle
        ? {
            ...state.turn.battle,
            releasedAttackerSpy,
          }
        : null,
    },
  }));

  return applyRegionControlChanges(conqueredState, state.mode === "sync" ? "immediate" : "turnStart", state.turn.turnNumber + 1);
}

function markDeadSpiesForEliminatedPlayers(state: GameState): GameState {
  const turn = state.turn;
  const ownership = state.draft?.ownership;
  if (!turn || !ownership) {
    return state;
  }

  let spies = turn.spies;
  for (const player of state.players) {
    if (ownedTerritoryIds(ownership, player.id).length > 0 || spies[player.id]?.status === "dead") {
      continue;
    }

    spies = {
      ...spies,
      [player.id]: {
        status: "dead",
        territoryId: null,
        custodianPlayerId: null,
      },
    };
  }

  return spies === turn.spies
    ? state
    : {
        ...state,
        turn: {
          ...turn,
          spies,
        },
      };
}

function adjustCommittedTerritoryTroop(allocation: AllocationState, playerId: string, territoryId: string, troopType: TroopType, delta: 1 | -1): AllocationState {
  const playerAllocation = allocation.playerAllocations[playerId];
  if (!playerAllocation) {
    return allocation;
  }

  const currentTroops = playerAllocation.territories[territoryId] ?? createTroopCounts();
  const nextTroops = {
    ...currentTroops,
    [troopType]: Math.max(0, currentTroops[troopType] + delta),
  };

  return {
    ...allocation,
    playerAllocations: {
      ...allocation.playerAllocations,
      [playerId]: {
        ...playerAllocation,
        territories: {
          ...playerAllocation.territories,
          [territoryId]: nextTroops,
        },
      },
    },
  };
}

function addOneTroop(counts: TroopCounts, troopType: TroopType): TroopCounts {
  return {
    ...counts,
    [troopType]: counts[troopType] + 1,
  };
}

function subtractOneTroop(counts: TroopCounts, troopType: TroopType): TroopCounts {
  return {
    ...counts,
    [troopType]: Math.max(0, counts[troopType] - 1),
  };
}

function attackPairKey(sourceTerritoryId: string, targetTerritoryId: string) {
  return `${sourceTerritoryId}->${targetTerritoryId}`;
}

function shuffle<T>(items: T[]) {
  const nextItems = [...items];
  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }

  return nextItems;
}

function normalizeGameState(value: unknown): GameState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const state = value as Partial<GameState>;
  if (!Array.isArray(state.players) || !state.config) {
    return null;
  }

  return {
    phase: normalizePhase(state.phase),
    mode: state.mode === "sync" ? "sync" : "local",
    players: state.players.filter(isPlayer),
    config: normalizeConfig(state.config),
    draft: normalizeDraft(state.draft),
    allocation: normalizeAllocation(state.allocation),
    turn: normalizeTurn(state.turn),
    notifications: normalizeNotifications(state.notifications),
    regionControl: normalizeRegionControl(state.regionControl),
  };
}

function normalizeConfig(value: unknown): GameConfig {
  const config = value as Partial<GameConfig>;
  const draftStyle = config.draftStyle === "random" || config.draftStyle === "roundRobin" || config.draftStyle === "snake" ? config.draftStyle : "snake";
  const pickTimeLimit = PICK_TIME_LIMITS.includes(config.pickTimeLimit as PickTimeLimit) ? config.pickTimeLimit as PickTimeLimit : 0;
  const allocationStyle = ALLOCATION_STYLES.includes(config.allocationStyle as AllocationStyle) ? config.allocationStyle as AllocationStyle : "manual";
  const troopAllocationTimeLimit = TROOP_ALLOCATION_TIME_LIMITS.includes(config.troopAllocationTimeLimit as TroopAllocationTimeLimit)
    ? config.troopAllocationTimeLimit as TroopAllocationTimeLimit
    : 0;
  const attackStyle = ATTACK_STYLES.includes(config.attackStyle as AttackStyle) ? config.attackStyle as AttackStyle : "regular";

  return {
    draftStyle,
    pickTimeLimit: draftStyle === "random" ? 0 : pickTimeLimit,
    allocationStyle,
    troopAllocationTimeLimit: allocationStyle === "random" ? 0 : troopAllocationTimeLimit,
    attackStyle,
  };
}

function normalizeNotifications(value: unknown): Record<string, GameNotification[]> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const notifications: Record<string, GameNotification[]> = {};
  for (const [playerId, queue] of Object.entries(value)) {
    if (!Array.isArray(queue)) {
      continue;
    }

    notifications[playerId] = queue
      .map(normalizeNotification)
      .filter((notification): notification is GameNotification => Boolean(notification));
  }

  return notifications;
}

function normalizeNotification(value: unknown): GameNotification | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const notification = value as Partial<GameNotification>;
  if (typeof notification.id !== "string" || typeof notification.playerId !== "string") {
    return null;
  }

  if ((notification.type === "spyLost" || notification.type === "spyCaptured") && typeof notification.territoryId === "string") {
    if (notification.type === "spyCaptured" && typeof notification.spyOwnerId !== "string") {
      return null;
    }

    return notification as GameNotification;
  }

  if ((notification.type === "regionGained" || notification.type === "regionLost") && typeof notification.regionId === "string" && REGION_IDS.includes(notification.regionId)) {
    return {
      id: notification.id,
      type: notification.type,
      playerId: notification.playerId,
      regionId: notification.regionId,
      delivery: notification.delivery === "immediate" ? "immediate" : "turnStart",
      minTurnNumber: Number.isInteger(notification.minTurnNumber) ? Math.max(0, notification.minTurnNumber ?? 0) : 0,
    };
  }

  return null;
}

function normalizeRegionControl(value: unknown): Record<string, string | null> {
  const control = createRegionControl();
  if (!value || typeof value !== "object") {
    return control;
  }

  const rawControl = value as Record<string, unknown>;
  for (const regionId of REGION_IDS) {
    control[regionId] = typeof rawControl[regionId] === "string" ? rawControl[regionId] : null;
  }

  return control;
}

function normalizeDraft(value: unknown): DraftState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const draft = value as Partial<DraftState>;
  if (!Array.isArray(draft.originalTurnOrder) || typeof draft.ownership !== "object" || !draft.ownership) {
    return null;
  }

  const originalTurnOrder = draft.originalTurnOrder.filter((id): id is string => typeof id === "string");
  if (originalTurnOrder.length === 0) {
    return null;
  }

  const ownership = createOwnershipMap();
  for (const territoryId of TERRITORY_IDS) {
    const ownerId = draft.ownership[territoryId];
    ownership[territoryId] = typeof ownerId === "string" ? ownerId : null;
  }

  return {
    originalTurnOrder,
    startIndex: Number.isInteger(draft.startIndex) ? Math.max(0, draft.startIndex ?? 0) : 0,
    step: Number.isInteger(draft.step) ? Math.max(0, draft.step ?? 0) : 0,
    ownership,
    timerRemainingMs: typeof draft.timerRemainingMs === "number" ? draft.timerRemainingMs : null,
    timerEndsAt: null,
  };
}

function normalizePhase(value: unknown): AppPhase {
  if (
    value === "setup" ||
    value === "draft" ||
    value === "allocation" ||
    value === "allocationHandoff" ||
    value === "paused" ||
    value === "gameMap" ||
    value === "turn" ||
    value === "turnHandoff"
  ) {
    return value;
  }

  return value === "allocationWaiting" ? "allocation" : value === "review" ? "gameMap" : "home";
}

function normalizeAllocation(value: unknown): AllocationState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const allocation = value as Partial<AllocationState>;
  if (!Array.isArray(allocation.order) || !allocation.playerAllocations || typeof allocation.playerAllocations !== "object") {
    return null;
  }

  const playerAllocations: AllocationState["playerAllocations"] = {};
  for (const [playerId, playerAllocation] of Object.entries(allocation.playerAllocations)) {
    if (!playerAllocation || typeof playerAllocation !== "object") {
      continue;
    }

    const partial = playerAllocation as Partial<AllocationState["playerAllocations"][string]>;
    const territories: Record<string, TroopCounts> = {};
    if (partial.territories && typeof partial.territories === "object") {
      for (const territoryId of TERRITORY_IDS) {
        const troops = partial.territories[territoryId];
        if (troops) {
          territories[territoryId] = normalizeTroopCounts(troops);
        }
      }
    }

    playerAllocations[playerId] = {
      marker: normalizeMarker(partial.marker),
      buildSubmitted: partial.buildSubmitted === true,
      baseTroops: normalizeTroopCounts(partial.baseTroops),
      inheritedTroops: normalizeTroopCounts(partial.inheritedTroops),
      territories,
      ready: partial.ready === true,
      randomCompleted: partial.randomCompleted === true,
    };
  }

  return {
    originalPlayerCount: Number.isInteger(allocation.originalPlayerCount) ? Math.max(2, Math.min(6, allocation.originalPlayerCount ?? 2)) : 2,
    order: allocation.order.filter((id): id is string => typeof id === "string"),
    currentIndex: Number.isInteger(allocation.currentIndex) ? Math.max(0, allocation.currentIndex ?? 0) : 0,
    timerRemainingMs: typeof allocation.timerRemainingMs === "number" ? allocation.timerRemainingMs : null,
    timerEndsAt: null,
    playerAllocations,
  };
}

function normalizeTurn(value: unknown): TurnState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const turn = value as Partial<TurnState>;
  if (!Array.isArray(turn.originalTurnOrder) || typeof turn.currentPlayerId !== "string") {
    return null;
  }

  const spies: TurnState["spies"] = {};
  if (turn.spies && typeof turn.spies === "object") {
    for (const [playerId, spy] of Object.entries(turn.spies)) {
      spies[playerId] = normalizeSpyStatus(spy);
    }
  }

  return {
    originalTurnOrder: turn.originalTurnOrder.filter((id): id is string => typeof id === "string"),
    currentPlayerId: turn.currentPlayerId,
    turnNumber: Number.isInteger(turn.turnNumber) ? Math.max(1, turn.turnNumber ?? 1) : 1,
    stage: normalizeTurnStage(turn.stage),
    spyReturnStage: turn.spyReturnStage === "actions" || turn.spyReturnStage === "reinforcementReady" ? turn.spyReturnStage : null,
    spies,
    spyIntel: normalizeSpyIntel(turn.spyIntel),
    reinforcement: normalizeReinforcement(turn.reinforcement),
    battle: normalizeBattle(turn.battle),
    completedAttacks: Array.isArray(turn.completedAttacks)
      ? turn.completedAttacks.filter((value): value is string => typeof value === "string")
      : [],
  };
}

function normalizeSpyStatus(value: unknown): TurnState["spies"][string] {
  const partial = value as Partial<TurnState["spies"][string]> & { available?: unknown; capturedTerritoryId?: unknown };
  if (!partial || typeof partial !== "object") {
    return createAvailableSpy();
  }

  if (partial.status === "dead") {
    return {
      status: "dead",
      territoryId: null,
      custodianPlayerId: null,
    };
  }

  if (partial.status === "captured" && typeof partial.territoryId === "string") {
    return {
      status: "captured",
      territoryId: partial.territoryId,
      custodianPlayerId: typeof partial.custodianPlayerId === "string" ? partial.custodianPlayerId : null,
    };
  }

  if (partial.available === false && typeof partial.capturedTerritoryId === "string") {
    return {
      status: "captured",
      territoryId: partial.capturedTerritoryId,
      custodianPlayerId: null,
    };
  }

  return createAvailableSpy();
}

function normalizeTurnStage(value: unknown): TurnStage {
  return value === "reinforcementBuild" ||
    value === "reinforcementPlace" ||
    value === "actions" ||
    value === "spyTarget" ||
    value === "spyIntel" ||
    value === "battle"
    ? value
    : "reinforcementReady";
}

function normalizeBattle(value: unknown): BattleState | null {
  const battle = value as Partial<BattleState>;
  if (
    !battle ||
    typeof battle !== "object" ||
    typeof battle.id !== "string" ||
    typeof battle.attackerPlayerId !== "string" ||
    typeof battle.defenderPlayerId !== "string" ||
    typeof battle.sourceTerritoryId !== "string" ||
    typeof battle.targetTerritoryId !== "string"
  ) {
    return null;
  }

  return {
    id: battle.id,
    attackerPlayerId: battle.attackerPlayerId,
    defenderPlayerId: battle.defenderPlayerId,
    sourceTerritoryId: battle.sourceTerritoryId,
    targetTerritoryId: battle.targetTerritoryId,
    committedAttackingTroops: normalizeTroopCounts(battle.committedAttackingTroops ?? battle.attackingTroops),
    initialDefendingTroops: normalizeTroopCounts(battle.initialDefendingTroops ?? battle.defendingTroops),
    attackingTroops: normalizeTroopCounts(battle.attackingTroops),
    defendingTroops: normalizeTroopCounts(battle.defendingTroops),
    attackerScore: finiteScore(battle.attackerScore),
    defenderScore: finiteScore(battle.defenderScore),
    latestRoll: normalizeBattleRoll(battle.latestRoll),
    hasRolled: battle.hasRolled === true,
    releasedAttackerSpy: battle.releasedAttackerSpy === true,
    result: battle.result?.type === "attackerWon" || battle.result?.type === "defenderWon" || battle.result?.type === "retreated"
      ? { type: battle.result.type }
      : null,
  };
}

function normalizeBattleRoll(value: unknown) {
  const roll = value as Partial<NonNullable<BattleState["latestRoll"]>>;
  if (!roll || typeof roll !== "object" || !Array.isArray(roll.attackerDice) || !Array.isArray(roll.defenderDice)) {
    return null;
  }

  return {
    attackerDice: normalizeDice(roll.attackerDice),
    defenderDice: normalizeDice(roll.defenderDice),
    attackerLosses: normalizeTroopTypeList(roll.attackerLosses),
    defenderLosses: normalizeTroopTypeList(roll.defenderLosses),
  };
}

function normalizeDice(value: unknown[]) {
  return value
    .filter((die): die is number => typeof die === "number" && Number.isInteger(die) && die >= 1 && die <= 6)
    .slice(0, 3);
}

function normalizeTroopTypeList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((troopType): troopType is TroopType => TROOP_TYPES.includes(troopType as TroopType))
    : [];
}

function finiteScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(10, value))
    : null;
}

function normalizeSpyIntel(value: unknown) {
  const intel = value as { targetTerritoryId?: unknown; totalTerritoryIds?: unknown };
  if (!intel || typeof intel !== "object" || typeof intel.targetTerritoryId !== "string" || !Array.isArray(intel.totalTerritoryIds)) {
    return null;
  }

  return {
    targetTerritoryId: intel.targetTerritoryId,
    totalTerritoryIds: intel.totalTerritoryIds.filter((id): id is string => typeof id === "string"),
  };
}

function normalizeReinforcement(value: unknown): ReinforcementState | null {
  const reinforcement = value as Partial<ReinforcementState>;
  if (!reinforcement || typeof reinforcement !== "object") {
    return null;
  }

  const territories: Record<string, TroopCounts> = {};
  if (reinforcement.territories && typeof reinforcement.territories === "object") {
    for (const territoryId of TERRITORY_IDS) {
      const troops = reinforcement.territories[territoryId];
      if (troops) {
        territories[territoryId] = normalizeTroopCounts(troops);
      }
    }
  }

  return {
    marker: normalizeMarker(reinforcement.marker),
    buildSubmitted: reinforcement.buildSubmitted === true,
    baseTroops: normalizeTroopCounts(reinforcement.baseTroops),
    bonusTroops: normalizeTroopCounts(reinforcement.bonusTroops),
    territories,
  };
}

function normalizeTroopCounts(value: unknown): TroopCounts {
  const counts = value as Partial<TroopCounts>;
  return createTroopCounts({
    heavy: wholeNumber(counts?.heavy),
    cavalry: wholeNumber(counts?.cavalry),
    elite: wholeNumber(counts?.elite),
    leader: wholeNumber(counts?.leader),
  });
}

function normalizeMarker(value: unknown): ArmyMarker {
  const marker = value as Partial<ArmyMarker>;
  const heavy = finiteRatio(marker?.heavy);
  const cavalry = finiteRatio(marker?.cavalry);
  const elite = finiteRatio(marker?.elite);
  const total = heavy + cavalry + elite;

  if (total <= 0) {
    return { ...CENTER_MARKER };
  }

  return {
    heavy: heavy / total,
    cavalry: cavalry / total,
    elite: elite / total,
  };
}

function wholeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function finiteRatio(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function isPlayer(value: unknown): value is GamePlayer {
  const player = value as Partial<GamePlayer>;
  return Boolean(
    player &&
      typeof player.id === "string" &&
      typeof player.name === "string" &&
      (player.color === null || PLAYER_COLORS.includes(player.color as PlayerColor)),
  );
}

function rotate<T>(items: T[], startIndex: number) {
  return [...items.slice(startIndex), ...items.slice(0, startIndex)];
}

function randomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}
