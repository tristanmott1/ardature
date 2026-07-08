import { generatedMapData } from "../map/generated/mapData";
import type { MapSkin, TerritoryState } from "../map/mapTypes";
import type {
  AppPhase,
  DraftState,
  DraftStyle,
  GameConfig,
  GamePlayer,
  GameState,
  PickTimeLimit,
  PlayerColor,
  TerritoryOwnerMap,
  TroopAllocationTimeLimit,
} from "./gameTypes";

export const PLAYER_COLORS: PlayerColor[] = ["green", "blue", "yellow", "red", "purple", "black"];
export const PICK_TIME_LIMITS: PickTimeLimit[] = [0, 5, 10, 15];
export const TROOP_ALLOCATION_TIME_LIMITS: TroopAllocationTimeLimit[] = [0, 60, 120, 180, 240, 300];
export const LOCAL_GAME_KEY = "ardature.localGame.v1";

const DEFAULT_CONFIG: GameConfig = {
  draftStyle: "snake",
  pickTimeLimit: 0,
  troopAllocationTimeLimit: 0,
};

const TERRITORY_IDS = generatedMapData.territories.map((territory) => territory.id);

export function createInitialGameState(): GameState {
  return {
    phase: "home",
    mode: "local",
    players: [],
    config: { ...DEFAULT_CONFIG },
    draft: null,
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

export function remainingTerritoryIds(ownership: TerritoryOwnerMap) {
  return TERRITORY_IDS.filter((territoryId) => !ownership[territoryId]);
}

export function ownedTerritoryIds(ownership: TerritoryOwnerMap, playerId: string) {
  return TERRITORY_IDS.filter((territoryId) => ownership[territoryId] === playerId);
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
    !draft?.pendingTerritoryId &&
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
    pendingTerritoryId: null,
    resultTerritoryId: null,
    resultPlayerId: null,
    noticeTerritoryId: null,
    noticePlayerId: null,
    timerRemainingMs: timerMs(config.pickTimeLimit),
    timerEndsAt: null,
  };

  return config.draftStyle === "random"
    ? simulateRandomDraft(players, config, draft)
    : draft;
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
    pendingTerritoryId: null,
    resultTerritoryId: state.mode === "local" ? territoryId : null,
    resultPlayerId: state.mode === "local" ? player.id : null,
    noticeTerritoryId: state.mode === "sync" ? territoryId : null,
    noticePlayerId: state.mode === "sync" ? player.id : null,
    step: nextStep,
  }, state.config);

  if (remainingTerritoryIds(ownership).length === 0) {
    return {
      ...state,
      phase: "review" as const,
      draft: {
        ...draft,
        resultTerritoryId: null,
        resultPlayerId: null,
        noticeTerritoryId: null,
        noticePlayerId: null,
      },
    };
  }

  return {
    ...state,
    draft: {
      ...draft,
      timerRemainingMs: timerMs(state.config.pickTimeLimit),
      timerEndsAt: state.mode === "sync" ? now + (timerMs(state.config.pickTimeLimit) ?? 0) : null,
    },
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
        pendingTerritoryId: null,
        resultTerritoryId: null,
        resultPlayerId: null,
        noticeTerritoryId: null,
        noticePlayerId: null,
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
  const count = originalTurnOrder.length;
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

export function secondsLabel(value: number | null) {
  if (!value) {
    return "None";
  }

  return `${Math.ceil(value / 1000)}s`;
}

export function formatTimerOption(seconds: PickTimeLimit) {
  return seconds === 0 ? "None" : `${seconds}s`;
}

export function formatTroopTimerOption(seconds: TroopAllocationTimeLimit) {
  return seconds === 0 ? "None" : `${seconds / 60}m`;
}

export function saveLocalGame(state: GameState) {
  if (state.mode !== "local") {
    return;
  }

  localStorage.setItem(LOCAL_GAME_KEY, JSON.stringify(state));
}

export function readLocalGame() {
  try {
    const raw = localStorage.getItem(LOCAL_GAME_KEY);
    return raw ? normalizeGameState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clearLocalGame() {
  localStorage.removeItem(LOCAL_GAME_KEY);
}

function simulateRandomDraft(players: GamePlayer[], config: GameConfig, draft: DraftState) {
  let state: GameState = {
    phase: "draft",
    mode: "local",
    players,
    config,
    draft,
  };

  while (state.draft && remainingTerritoryIds(state.draft.ownership).length > 0) {
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

function normalizeGameState(value: unknown): GameState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const state = value as Partial<GameState>;
  if (!Array.isArray(state.players) || !state.config) {
    return null;
  }

  return {
    phase: state.phase === "setup" || state.phase === "draft" || state.phase === "paused" || state.phase === "review" ? state.phase : "home",
    mode: state.mode === "sync" ? "sync" : "local",
    players: state.players.filter(isPlayer),
    config: normalizeConfig(state.config),
    draft: normalizeDraft(state.draft),
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

  const ownership = createOwnershipMap();
  for (const territoryId of TERRITORY_IDS) {
    const ownerId = draft.ownership[territoryId];
    ownership[territoryId] = typeof ownerId === "string" ? ownerId : null;
  }

  return {
    originalTurnOrder: draft.originalTurnOrder.filter((id): id is string => typeof id === "string"),
    startIndex: Number.isInteger(draft.startIndex) ? Math.max(0, draft.startIndex ?? 0) : 0,
    step: Number.isInteger(draft.step) ? Math.max(0, draft.step ?? 0) : 0,
    ownership,
    pendingTerritoryId: typeof draft.pendingTerritoryId === "string" ? draft.pendingTerritoryId : null,
    resultTerritoryId: typeof draft.resultTerritoryId === "string" ? draft.resultTerritoryId : null,
    resultPlayerId: typeof draft.resultPlayerId === "string" ? draft.resultPlayerId : null,
    noticeTerritoryId: typeof draft.noticeTerritoryId === "string" ? draft.noticeTerritoryId : null,
    noticePlayerId: typeof draft.noticePlayerId === "string" ? draft.noticePlayerId : null,
    timerRemainingMs: typeof draft.timerRemainingMs === "number" ? draft.timerRemainingMs : null,
    timerEndsAt: null,
  };
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
