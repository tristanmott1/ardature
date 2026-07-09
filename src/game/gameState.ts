import { generatedMapData } from "../map/generated/mapData";
import type { MapSkin, TerritoryState } from "../map/mapTypes";
import type {
  AllocationState,
  ArmyMarker,
  AppPhase,
  DraftState,
  DraftStyle,
  GameConfig,
  GamePlayer,
  GameState,
  PickTimeLimit,
  PlayerAllocation,
  PlayerColor,
  TerritoryOwnerMap,
  TroopAllocationTimeLimit,
  TroopCounts,
  TroopType,
} from "./gameTypes";

export const PLAYER_COLORS: PlayerColor[] = ["green", "blue", "yellow", "red", "purple", "black"];
export const PICK_TIME_LIMITS: PickTimeLimit[] = [5, 10, 15, 0];
export const TROOP_ALLOCATION_TIME_LIMITS: TroopAllocationTimeLimit[] = [60, 120, 180, 240, 300, 0];
export const LOCAL_GAME_KEY = "ardature.localGame.v1";
export const SYNC_HOST_GAME_KEY = "ardature.syncHostGame.v1";
export const TROOP_TYPES: TroopType[] = ["heavy", "cavalry", "elite", "leader"];
export const MIXTURE_TROOP_TYPES: Exclude<TroopType, "leader">[] = ["heavy", "cavalry", "elite"];

const STARTING_BUDGET_BY_PLAYER_COUNT: Record<number, number> = {
  2: 40,
  3: 35,
  4: 30,
  5: 25,
  6: 20,
};

const TROOP_COSTS: Record<Exclude<TroopType, "leader">, number> = {
  heavy: 0.8,
  cavalry: 1,
  elite: 1.2,
};

const DEFAULT_CONFIG: GameConfig = {
  draftStyle: "snake",
  pickTimeLimit: 0,
  troopAllocationTimeLimit: 0,
};

const TERRITORY_IDS = generatedMapData.territories.map((territory) => territory.id);
const CENTER_MARKER: ArmyMarker = { heavy: 1 / 3, cavalry: 1 / 3, elite: 1 / 3 };
const ZERO_TROOPS: TroopCounts = { heavy: 0, cavalry: 0, elite: 0, leader: 0 };

export function createInitialGameState(): GameState {
  return {
    phase: "home",
    mode: "local",
    players: [],
    config: { ...DEFAULT_CONFIG },
    draft: null,
    allocation: null,
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

export function colorForPlayer(player: GamePlayer | undefined): MapSkin {
  return player?.color ?? "background";
}

export function createOwnershipMap(): TerritoryOwnerMap {
  return Object.fromEntries(TERRITORY_IDS.map((territoryId) => [territoryId, null]));
}

export function createTerritoryStates(players: GamePlayer[], ownership: TerritoryOwnerMap | null, selectedTerritoryId: string | null): Record<string, TerritoryState> {
  const playerById = new Map(players.map((player) => [player.id, player]));

  return Object.fromEntries(
    TERRITORY_IDS.map((territoryId) => {
      const ownerId = ownership?.[territoryId] ?? null;
      return [
        territoryId,
        {
          skin: colorForPlayer(ownerId ? playerById.get(ownerId) : undefined),
          status: selectedTerritoryId === territoryId ? "selected" : "unselected",
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

export function armyCountsForMarker(marker: ArmyMarker, playerColor: PlayerColor | null, playerCount: number) {
  const budget = STARTING_BUDGET_BY_PLAYER_COUNT[playerCount] ?? 20;
  const effectiveBudget = Math.max(0, budget - 1);
  const weightedCost = marker.heavy * TROOP_COSTS.heavy + marker.cavalry * TROOP_COSTS.cavalry + marker.elite * TROOP_COSTS.elite;
  const adjustedCount = Math.round(effectiveBudget / weightedCost);
  const raw = {
    heavy: marker.heavy * adjustedCount,
    cavalry: marker.cavalry * adjustedCount,
    elite: marker.elite * adjustedCount,
  };
  const counts = createTroopCounts({
    heavy: Math.round(raw.heavy),
    cavalry: Math.round(raw.cavalry),
    elite: Math.round(raw.elite),
    leader: playerColor ? 1 : 0,
  });

  // Correct rounded classes so they exactly spend the adjusted triangle count.
  while (counts.heavy + counts.cavalry + counts.elite > adjustedCount) {
    const troopType = [...MIXTURE_TROOP_TYPES]
      .filter((type) => counts[type] > 0)
      .sort((left, right) => (raw[left] - Math.floor(raw[left])) - (raw[right] - Math.floor(raw[right])))[0];
    counts[troopType] -= 1;
  }

  while (counts.heavy + counts.cavalry + counts.elite < adjustedCount) {
    const troopType = [...MIXTURE_TROOP_TYPES]
      .sort((left, right) => (Math.ceil(raw[left]) - raw[left]) - (Math.ceil(raw[right]) - raw[right]))[0];
    counts[troopType] += 1;
  }

  return counts;
}

export function remainingTerritoryIds(ownership: TerritoryOwnerMap) {
  return TERRITORY_IDS.filter((territoryId) => !ownership[territoryId]);
}

export function ownedTerritoryIds(ownership: TerritoryOwnerMap, playerId: string) {
  return TERRITORY_IDS.filter((territoryId) => ownership[territoryId] === playerId);
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
    !draft?.resultTerritoryId &&
    draft?.ownership[territoryId] === null;
}

export function startDraft(players: GamePlayer[], config: GameConfig) {
  const originalTurnOrder = players.map((player) => player.id);
  const draft: DraftState = {
    originalTurnOrder,
    startIndex: draftStartIndex(originalTurnOrder.length, config.draftStyle, TERRITORY_IDS.length),
    step: 0,
    ownership: createOwnershipMap(),
    resultTerritoryId: null,
    resultPlayerId: null,
    timerRemainingMs: timerMs(config.pickTimeLimit),
    timerEndsAt: null,
  };

  return config.draftStyle === "random"
    ? simulateRandomDraft(players, config, draft)
    : draft;
}

export function startAllocation(state: GameState, now: number): GameState {
  if (!state.draft) {
    return state;
  }

  const allocation = beginAllocationTimer(createAllocationState(state.players, state.draft.ownership, state.config), state.config, now);
  return {
    ...state,
    phase: state.mode === "local" ? "allocationHandoff" : "allocation",
    allocation,
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
    return { ...state, phase: "gameMap", allocation: nextAllocation };
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

  return {
    ...state,
    phase: "gameMap",
    allocation: state.allocation,
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

export function applySyncPlayerQuit(state: GameState, playerId: string): GameState {
  if (state.mode !== "sync" || (state.phase !== "setup" && state.phase !== "draft" && state.phase !== "allocation" && state.phase !== "paused")) {
    return state;
  }

  const next = removePlayerFromDraft(state, playerId);
  return (state.phase === "draft" || state.phase === "allocation") && next.phase !== "home"
    ? pauseSyncGame(next)
    : next;
}

export function applySyncPlayerConnectionStatus(state: GameState, playerId: string, connectionStatus: GamePlayer["connectionStatus"]): GameState {
  if (state.mode !== "sync") {
    return state;
  }

  const next = markSyncPlayerStatus(state, playerId, connectionStatus);
  return connectionStatus !== "connected" && (state.phase === "draft" || state.phase === "allocation")
    ? pauseSyncGame(next)
    : next;
}

export function pauseSyncGame(state: GameState): GameState {
  return {
    ...state,
    phase: "paused",
    draft: state.draft
      ? clearDraftTimer({
          ...state.draft,
          resultTerritoryId: null,
          resultPlayerId: null,
        }, state.config)
      : state.draft,
    allocation: state.allocation
      ? {
          ...state.allocation,
          timerEndsAt: null,
        }
      : state.allocation,
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
    resultTerritoryId: state.mode === "local" ? territoryId : null,
    resultPlayerId: state.mode === "local" ? player.id : null,
    step: nextStep,
  }, state.config);

  if (remainingTerritoryIds(ownership).length === 0) {
    return startAllocation({
      ...state,
      phase: "allocation" as const,
      draft: {
        ...draft,
        resultTerritoryId: null,
        resultPlayerId: null,
      },
    }, now);
  }

  return {
    ...state,
    draft: state.mode === "sync" ? beginDraftTimer(draft, state.config, now) : draft,
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

export function removePlayerFromDraft(state: GameState, playerId: string): GameState {
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
        resultTerritoryId: null,
        resultPlayerId: null,
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
          resultTerritoryId: null,
          resultPlayerId: null,
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

  return game.phase === "draft" || game.phase === "allocation"
    ? { ...restored, phase: "paused" }
    : restored;
}

function simulateRandomDraft(players: GamePlayer[], config: GameConfig, draft: DraftState) {
  let state: GameState = {
    phase: "draft",
    mode: "local",
    players,
    config,
    draft,
    allocation: null,
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
        draft: {
          ...state.draft,
          resultTerritoryId: null,
          resultPlayerId: null,
        },
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
      resultTerritoryId: null,
      resultPlayerId: null,
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

function addOneTroop(counts: TroopCounts, troopType: TroopType): TroopCounts {
  return {
    ...counts,
    [troopType]: counts[troopType] + 1,
  };
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
  };
}

function normalizeConfig(value: unknown): GameConfig {
  const config = value as Partial<GameConfig>;
  return {
    draftStyle: config.draftStyle === "random" || config.draftStyle === "roundRobin" || config.draftStyle === "snake" ? config.draftStyle : "snake",
    pickTimeLimit: PICK_TIME_LIMITS.includes(config.pickTimeLimit as PickTimeLimit) ? config.pickTimeLimit as PickTimeLimit : 0,
    troopAllocationTimeLimit: TROOP_ALLOCATION_TIME_LIMITS.includes(config.troopAllocationTimeLimit as TroopAllocationTimeLimit)
      ? config.troopAllocationTimeLimit as TroopAllocationTimeLimit
      : 0,
  };
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
    resultTerritoryId: typeof draft.resultTerritoryId === "string" ? draft.resultTerritoryId : null,
    resultPlayerId: typeof draft.resultPlayerId === "string" ? draft.resultPlayerId : null,
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
    value === "gameMap"
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
