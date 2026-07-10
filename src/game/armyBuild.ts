import type { ArmyMarker, PlayerColor, TroopCounts, TroopType } from "./gameTypes";

type MixtureTroopType = Exclude<TroopType, "leader">;

type ArmyCandidate = {
  counts: Record<MixtureTroopType, number>;
  ratios: Record<MixtureTroopType, number>;
  remainingCostUnits: number;
};

export const MIXTURE_TROOP_TYPES: MixtureTroopType[] = ["heavy", "cavalry", "elite"];

// Costs use fixed-point integers. Divide by costScale to get the gameplay cost.
export const ARMY_ECONOMY = {
  costScale: 5,
  leaderCostUnits: 5,
  mixtureTroopCostUnits: {
    heavy: 4,
    cavalry: 5,
    elite: 6,
  } satisfies Record<MixtureTroopType, number>,
  startingBudgetByPlayerCount: {
    2: 40,
    3: 35,
    4: 30,
    5: 25,
    6: 20,
  } as Record<number, number>,
} as const;

const DEFAULT_STARTING_BUDGET = 20;
const SCORE_EPSILON = 1e-12;
const candidateCache = new Map<number, ArmyCandidate[]>();

export function armyCountsForMarker(marker: ArmyMarker, playerColor: PlayerColor | null, playerCount: number): TroopCounts {
  const mixture = normalizeMarker(marker);
  const startingBudget = ARMY_ECONOMY.startingBudgetByPlayerCount[playerCount] ?? DEFAULT_STARTING_BUDGET;
  const effectiveBudgetUnits = startingBudget * ARMY_ECONOMY.costScale - ARMY_ECONOMY.leaderCostUnits;
  const candidates = candidatesForBudget(effectiveBudgetUnits);
  let selected = candidates[0];
  let selectedError = mixtureError(selected, mixture);

  // Choose the budget-maximal army whose actual ratios best match the marker.
  for (const candidate of candidates.slice(1)) {
    const error = mixtureError(candidate, mixture);

    if (isBetterCandidate(candidate, error, selected, selectedError)) {
      selected = candidate;
      selectedError = error;
    }
  }

  return {
    ...selected.counts,
    leader: playerColor ? 1 : 0,
  };
}

function candidatesForBudget(effectiveBudgetUnits: number) {
  const cached = candidateCache.get(effectiveBudgetUnits);

  if (cached) {
    return cached;
  }

  const costs = ARMY_ECONOMY.mixtureTroopCostUnits;
  const minimumCost = Math.min(costs.heavy, costs.cavalry, costs.elite);
  const candidates: ArmyCandidate[] = [];

  // Enumerate every integer army that cannot afford one additional troop.
  for (let heavy = 0; heavy * costs.heavy <= effectiveBudgetUnits; heavy += 1) {
    for (let cavalry = 0; heavy * costs.heavy + cavalry * costs.cavalry <= effectiveBudgetUnits; cavalry += 1) {
      for (let elite = 0; ; elite += 1) {
        const spent = heavy * costs.heavy + cavalry * costs.cavalry + elite * costs.elite;

        if (spent > effectiveBudgetUnits) {
          break;
        }

        const total = heavy + cavalry + elite;
        const remainingCostUnits = effectiveBudgetUnits - spent;

        if (total === 0 || remainingCostUnits >= minimumCost) {
          continue;
        }

        candidates.push({
          counts: { heavy, cavalry, elite },
          ratios: {
            heavy: heavy / total,
            cavalry: cavalry / total,
            elite: elite / total,
          },
          remainingCostUnits,
        });
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error(`No army candidates fit budget ${effectiveBudgetUnits}.`);
  }

  candidateCache.set(effectiveBudgetUnits, candidates);
  return candidates;
}

function mixtureError(candidate: ArmyCandidate, marker: ArmyMarker) {
  return MIXTURE_TROOP_TYPES.reduce((total, troopType) => {
    const difference = candidate.ratios[troopType] - marker[troopType];
    return total + difference * difference;
  }, 0);
}

function isBetterCandidate(candidate: ArmyCandidate, error: number, selected: ArmyCandidate, selectedError: number) {
  if (error < selectedError - SCORE_EPSILON) {
    return true;
  }

  if (Math.abs(error - selectedError) > SCORE_EPSILON) {
    return false;
  }

  if (candidate.remainingCostUnits !== selected.remainingCostUnits) {
    return candidate.remainingCostUnits < selected.remainingCostUnits;
  }

  // Resolve exact ties in stable heavy, cavalry, elite order.
  for (const troopType of MIXTURE_TROOP_TYPES) {
    if (candidate.counts[troopType] !== selected.counts[troopType]) {
      return candidate.counts[troopType] > selected.counts[troopType];
    }
  }

  return false;
}

function normalizeMarker(marker: ArmyMarker): ArmyMarker {
  const values = {
    heavy: finiteRatio(marker.heavy),
    cavalry: finiteRatio(marker.cavalry),
    elite: finiteRatio(marker.elite),
  };
  const total = values.heavy + values.cavalry + values.elite;

  if (total <= 0) {
    return { heavy: 1 / 3, cavalry: 1 / 3, elite: 1 / 3 };
  }

  return {
    heavy: values.heavy / total,
    cavalry: values.cavalry / total,
    elite: values.elite / total,
  };
}

function finiteRatio(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
