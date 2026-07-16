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

export function scorePercentileForTroops(troops: TroopCounts, score: number) {
  const distribution = betaDistributionForScore(combatScoreForTroops(troops));
  return betaCdf(Math.max(0, Math.min(10, score)) / 10, distribution.alpha, distribution.beta);
}

export function troopScoreAtPercentile(troopType: TroopType, percentile: number) {
  const distribution = betaDistributionForScore(COMBAT_SCORE_VALUES[troopType]);
  return 10 * betaInv(Math.max(0.000001, Math.min(0.999999, percentile)), distribution.alpha, distribution.beta);
}

export function rollCombatDie(score: number, role: "attacker" | "defender", random = Math.random) {
  return sampleDie(dieDistribution(score, role), random);
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

function betaDistributionForScore(score: number) {
  const mean = Math.max(0.001, Math.min(0.999, score / 10));

  return {
    alpha: CHALLENGE_KAPPA * mean,
    beta: CHALLENGE_KAPPA * (1 - mean),
  };
}

function betaCdf(x: number, alpha: number, beta: number) {
  if (x <= 0) {
    return 0;
  }

  if (x >= 1) {
    return 1;
  }

  const front = Math.exp(
    alpha * Math.log(x) +
    beta * Math.log(1 - x) -
    logGamma(alpha) -
    logGamma(beta) +
    logGamma(alpha + beta),
  );

  return x < (alpha + 1) / (alpha + beta + 2)
    ? front * betaContinuedFraction(x, alpha, beta) / alpha
    : 1 - front * betaContinuedFraction(1 - x, beta, alpha) / beta;
}

function betaInv(percentile: number, alpha: number, beta: number) {
  let low = 0;
  let high = 1;

  // Binary search is slow but tiny and stable for the small battle unit counts.
  for (let index = 0; index < 48; index += 1) {
    const middle = (low + high) / 2;
    if (betaCdf(middle, alpha, beta) < percentile) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return (low + high) / 2;
}

function betaContinuedFraction(x: number, alpha: number, beta: number) {
  const maxIterations = 100;
  const epsilon = 3e-7;
  const fpMin = 1e-30;
  const qab = alpha + beta;
  const qap = alpha + 1;
  const qam = alpha - 1;
  let c = 1;
  let d = 1 - qab * x / qap;

  if (Math.abs(d) < fpMin) {
    d = fpMin;
  }

  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIterations; m += 1) {
    const m2 = 2 * m;
    let aa = m * (beta - m) * x / ((qam + m2) * (alpha + m2));

    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) {
      d = fpMin;
    }
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) {
      c = fpMin;
    }
    d = 1 / d;
    h *= d * c;

    aa = -(alpha + m) * (qab + m) * x / ((alpha + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) {
      d = fpMin;
    }
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) {
      c = fpMin;
    }
    d = 1 / d;
    const delta = d * c;

    h *= delta;
    if (Math.abs(delta - 1) < epsilon) {
      break;
    }
  }

  return h;
}

function logGamma(value: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7,
  ];

  if (value < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  }

  let x = 0.9999999999998099;
  const z = value - 1;

  for (let index = 0; index < coefficients.length; index += 1) {
    x += coefficients[index] / (z + index + 1);
  }

  const t = z + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
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
