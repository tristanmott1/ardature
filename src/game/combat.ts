import type { TroopCounts, TroopType } from "./gameTypes";

export const COMBAT_SCORE_VALUES: Record<TroopType, number> = {
  heavy: 2.5,
  cavalry: 5,
  elite: 7.5,
  leader: 9,
};

const CHALLENGE_KAPPA = 20;
const ATTACKER_TILT_DOWN = 0.14331904306524929;
const ATTACKER_TILT_UP = 0.27527774317548487;
const DEFENDER_TILT_DOWN = 0.11630715538926006;
const DEFENDER_TILT_UP = 0.21211393558380784;
const DIE_FACES = [1, 2, 3, 4, 5, 6];

export function combatScoreForTroops(troops: TroopCounts) {
  const total = troopTotal(troops);
  if (total <= 0) {
    return 0;
  }

  return (
    troops.heavy * COMBAT_SCORE_VALUES.heavy +
    troops.cavalry * COMBAT_SCORE_VALUES.cavalry +
    troops.elite * COMBAT_SCORE_VALUES.elite +
    troops.leader * COMBAT_SCORE_VALUES.leader
  ) / total;
}

export function challengeScoreForTroops(troops: TroopCounts, random = Math.random) {
  const mean = Math.max(0.001, Math.min(0.999, combatScoreForTroops(troops) / 10));
  const alpha = CHALLENGE_KAPPA * mean;
  const beta = CHALLENGE_KAPPA * (1 - mean);
  const left = sampleGamma(alpha, random);
  const right = sampleGamma(beta, random);

  return 10 * left / (left + right);
}

export function rollCombatDice(score: number, role: "attacker" | "defender", count: number, random = Math.random) {
  const distribution = dieDistribution(score, role);
  const dice: number[] = [];

  for (let index = 0; index < count; index += 1) {
    dice.push(sampleDie(distribution, random));
  }

  return dice.sort((left, right) => right - left);
}

export function sampleCasualty(troops: TroopCounts, random = Math.random): TroopType | null {
  const nonLeaderTotal = troops.heavy + troops.cavalry + troops.elite;
  const total = nonLeaderTotal + troops.leader;

  if (total <= 0) {
    return null;
  }

  if (nonLeaderTotal <= 0) {
    return "leader";
  }

  let pick = Math.floor(random() * nonLeaderTotal);
  for (const troopType of ["heavy", "cavalry", "elite"] as const) {
    if (pick < troops[troopType]) {
      return troopType;
    }

    pick -= troops[troopType];
  }

  return "heavy";
}

function dieDistribution(score: number, role: "attacker" | "defender") {
  const tilt = scoreToTilt(score, role);
  const weights = DIE_FACES.map((face) => Math.exp(tilt * (face - 3.5)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  return weights.map((weight) => weight / total);
}

function scoreToTilt(score: number, role: "attacker" | "defender") {
  const q = (Math.max(0, Math.min(10, score)) - 5) / 5;

  if (role === "attacker") {
    return q <= 0 ? q * ATTACKER_TILT_DOWN : q * ATTACKER_TILT_UP;
  }

  return q <= 0 ? q * DEFENDER_TILT_DOWN : q * DEFENDER_TILT_UP;
}

function sampleDie(distribution: number[], random: () => number) {
  let pick = random();

  for (let index = 0; index < distribution.length; index += 1) {
    pick -= distribution[index];
    if (pick <= 0) {
      return DIE_FACES[index];
    }
  }

  return 6;
}

function sampleGamma(shape: number, random: () => number): number {
  if (shape < 1) {
    return sampleGamma(shape + 1, random) * Math.pow(random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  for (;;) {
    let x = 0;
    let v = 0;

    do {
      x = sampleNormal(random);
      v = 1 + c * x;
    } while (v <= 0);

    v *= v * v;
    const u = random();

    if (u < 1 - 0.0331 * x * x * x * x) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

function sampleNormal(random: () => number) {
  let u = 0;
  let v = 0;

  while (u === 0) {
    u = random();
  }

  while (v === 0) {
    v = random();
  }

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function troopTotal(troops: TroopCounts) {
  return troops.heavy + troops.cavalry + troops.elite + troops.leader;
}
