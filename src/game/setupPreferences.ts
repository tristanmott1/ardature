import type { GameConfig, GamePlayer, PlayerColor } from "./gameTypes";
import { ALLOCATION_STYLES, PICK_TIME_LIMITS, PLAYER_COLORS, TROOP_ALLOCATION_TIME_LIMITS, createPlayer } from "./gameState";

export type SetupPreferences = {
  localPlayers: SetupPreferencePlayer[];
  config: GameConfig;
  syncProfile: SetupSyncProfile;
};

export type SetupPreferencePlayer = {
  name: string;
  color: PlayerColor | null;
};

export type SetupSyncProfile = {
  name: string;
  color: PlayerColor | null;
};

const SETUP_PREFERENCES_KEY = "ardature.setupPreferences.v1";

const DEFAULT_CONFIG: GameConfig = {
  draftStyle: "snake",
  pickTimeLimit: 0,
  allocationStyle: "manual",
  troopAllocationTimeLimit: 0,
};

const DEFAULT_PREFERENCES: SetupPreferences = {
  localPlayers: [],
  config: DEFAULT_CONFIG,
  syncProfile: {
    name: "",
    color: "green",
  },
};

export function readSetupPreferences() {
  try {
    const raw = localStorage.getItem(SETUP_PREFERENCES_KEY);
    return raw ? normalizeSetupPreferences(JSON.parse(raw)) : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function saveSetupPreferences(next: SetupPreferences) {
  localStorage.setItem(SETUP_PREFERENCES_KEY, JSON.stringify(normalizeSetupPreferences(next)));
}

export function localPlayersFromPreferences() {
  return readSetupPreferences().localPlayers.map((player) => ({
    ...createPlayer(player.name),
    color: player.color,
  }));
}

export function gameConfigFromPreferences() {
  return readSetupPreferences().config;
}

export function syncProfileFromPreferences() {
  return readSetupPreferences().syncProfile;
}

export function localPlayersToPreferences(players: GamePlayer[]) {
  return players
    .map((player) => ({
      name: player.name.trim(),
      color: normalizeColor(player.color),
    }))
    .filter((player) => player.name)
    .slice(0, 6);
}

export function saveGameConfigPreference(config: GameConfig) {
  saveSetupPreferences({
    ...readSetupPreferences(),
    config: normalizeConfig(config),
  });
}

export function saveLocalSetupPreference(players: GamePlayer[], config: GameConfig) {
  saveSetupPreferences({
    ...readSetupPreferences(),
    localPlayers: localPlayersToPreferences(players),
    config: normalizeConfig(config),
  });
}

export function saveSyncProfilePreference(profile: SetupSyncProfile) {
  saveSetupPreferences({
    ...readSetupPreferences(),
    syncProfile: normalizeSyncProfile(profile),
  });
}

function normalizeSetupPreferences(value: unknown): SetupPreferences {
  const preferences = value as Partial<SetupPreferences>;
  return {
    localPlayers: normalizeLocalPlayers(preferences.localPlayers),
    config: normalizeConfig(preferences.config),
    syncProfile: normalizeSyncProfile(preferences.syncProfile),
  };
}

function normalizeLocalPlayers(value: unknown) {
  return Array.isArray(value)
    ? value
        .map(normalizeLocalPlayer)
        .filter((player): player is SetupPreferencePlayer => Boolean(player))
        .slice(0, 6)
    : [];
}

function normalizeLocalPlayer(value: unknown) {
  const player = value as Partial<SetupPreferencePlayer>;
  const name = typeof player.name === "string" ? player.name.trim() : "";

  if (!name) {
    return null;
  }

  return {
    name,
    color: normalizeColor(player.color),
  };
}

function normalizeConfig(value: unknown): GameConfig {
  const config = value as Partial<GameConfig>;
  const draftStyle = config?.draftStyle === "random" || config?.draftStyle === "roundRobin" || config?.draftStyle === "snake"
    ? config.draftStyle
    : DEFAULT_CONFIG.draftStyle;
  const pickTimeLimit = PICK_TIME_LIMITS.includes(config?.pickTimeLimit as GameConfig["pickTimeLimit"])
    ? config.pickTimeLimit as GameConfig["pickTimeLimit"]
    : DEFAULT_CONFIG.pickTimeLimit;
  const allocationStyle = ALLOCATION_STYLES.includes(config?.allocationStyle as GameConfig["allocationStyle"])
    ? config.allocationStyle as GameConfig["allocationStyle"]
    : DEFAULT_CONFIG.allocationStyle;
  const troopAllocationTimeLimit = TROOP_ALLOCATION_TIME_LIMITS.includes(config?.troopAllocationTimeLimit as GameConfig["troopAllocationTimeLimit"])
    ? config.troopAllocationTimeLimit as GameConfig["troopAllocationTimeLimit"]
    : DEFAULT_CONFIG.troopAllocationTimeLimit;

  return {
    draftStyle,
    pickTimeLimit: draftStyle === "random" ? 0 : pickTimeLimit,
    allocationStyle,
    troopAllocationTimeLimit: allocationStyle === "random" ? 0 : troopAllocationTimeLimit,
  };
}

function normalizeSyncProfile(value: unknown): SetupSyncProfile {
  const profile = value as Partial<SetupSyncProfile>;
  return {
    name: typeof profile?.name === "string" ? profile.name.trim() : "",
    color: normalizeColor(profile?.color) ?? "green",
  };
}

function normalizeColor(value: unknown) {
  return value === null || PLAYER_COLORS.includes(value as PlayerColor) ? value as PlayerColor | null : null;
}
