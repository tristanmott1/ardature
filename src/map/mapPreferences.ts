export type MapPreferences = {
  autoFocusEnabled: boolean;
};

const MAP_PREFERENCES_KEY = "ardature.mapPreferences.v1";

const DEFAULT_MAP_PREFERENCES: MapPreferences = {
  autoFocusEnabled: false,
};

export function readMapPreferences() {
  try {
    const raw = localStorage.getItem(MAP_PREFERENCES_KEY);
    return raw ? normalizeMapPreferences(JSON.parse(raw)) : DEFAULT_MAP_PREFERENCES;
  } catch {
    return DEFAULT_MAP_PREFERENCES;
  }
}

export function saveMapPreferences(next: MapPreferences) {
  localStorage.setItem(MAP_PREFERENCES_KEY, JSON.stringify(normalizeMapPreferences(next)));
}

function normalizeMapPreferences(value: unknown): MapPreferences {
  const preferences = value as Partial<MapPreferences>;
  return {
    autoFocusEnabled: typeof preferences.autoFocusEnabled === "boolean"
      ? preferences.autoFocusEnabled
      : DEFAULT_MAP_PREFERENCES.autoFocusEnabled,
  };
}
