const TROOP_BASE_SCORES = {
  heavy: 2.5,
  cavalry: 5,
  elite: 7.5,
  leader: 9,
};

const TROOP_TYPES = ["heavy", "cavalry", "elite", "leader"];
const DIE_FACES = [1, 2, 3, 4, 5, 6];
const GAMMA_SHAPE = 3.25;
const GAMMA_SCALE = 0.76;
const SPECIAL_RULES_DISABLED = ["leaders", "ghosts", "balrog", "paths-of-the-dead", "map-state", "sync"];

const quickMode = process.argv.includes("--quick");
const accurateMode = process.argv.includes("--accurate");
const mode = quickMode ? "quick" : accurateMode ? "accurate" : "full";
const settings = quickMode
  ? {
      endpointTrials: 120,
      matchupTrials: 120,
      rerankTrials: 0,
      topTiltCount: 10,
      tiltDownValues: range(0.08, 0.28, 0.04),
      tiltUpValues: range(0.12, 0.44, 0.08),
      heavyDistanceSlopes: range(0, 0.8, 0.1),
      eliteDistanceSlopes: range(0, 0.6, 0.1),
    }
  : accurateMode
    ? {
        endpointTrials: 300,
        matchupTrials: 250,
        rerankTrials: 20000,
        topTiltCount: 20,
        tiltDownValues: range(0.06, 0.3, 0.04),
        tiltUpValues: range(0.12, 0.44, 0.04),
        heavyDistanceSlopes: range(0, 1.2, 0.07),
        eliteDistanceSlopes: range(0, 1, 0.07),
      }
  : {
      endpointTrials: 300,
      matchupTrials: 250,
      rerankTrials: 0,
      topTiltCount: 12,
      tiltDownValues: range(0.06, 0.3, 0.04),
      tiltUpValues: range(0.12, 0.44, 0.04),
      heavyDistanceSlopes: range(0, 0.8, 0.07),
      eliteDistanceSlopes: range(0, 0.7, 0.07),
    };

const baselineTroops = troopCounts({ cavalry: 10 });
const heavyTroops = troopCounts({ heavy: 12 });
const eliteTroops = troopCounts({ elite: 8 });

const fixedBaseline = estimateWinProbability({
  attackerTroops: baselineTroops,
  defenderTroops: baselineTroops,
  fixedAttackerScore: 5,
  fixedDefenderScore: 5,
  params: neutralParams(),
  seed: 1001,
  trials: accurateMode ? settings.rerankTrials * 2 : settings.endpointTrials * 2,
});
const tiltCandidates = fitTiltCandidates(fixedBaseline);
const searchedCandidates = fitDistanceCandidates(tiltCandidates, fixedBaseline);
const rankedCandidates = accurateMode
  ? rerankCandidates(searchedCandidates)
  : searchedCandidates;

printReport(fixedBaseline, rankedCandidates);

function fitTiltCandidates(fairBaseline) {
  const candidates = [];

  for (const attackerDown of settings.tiltDownValues) {
    for (const attackerUp of settings.tiltUpValues) {
      for (const defenderDown of settings.tiltDownValues) {
        for (const defenderUp of settings.tiltUpValues) {
          const params = {
            attackerDown,
            attackerUp,
            defenderDown,
            defenderUp,
            heavyDistanceSlope: 0,
            eliteDistanceSlope: 0,
          };
          const lowScoreWin = estimateWinProbability({
            attackerTroops: baselineTroops,
            defenderTroops: baselineTroops,
            fixedAttackerScore: 0,
            fixedDefenderScore: 5,
            params,
            seed: 2001,
            trials: settings.endpointTrials,
          });
          const highScoreWin = estimateWinProbability({
            attackerTroops: baselineTroops,
            defenderTroops: baselineTroops,
            fixedAttackerScore: 10,
            fixedDefenderScore: 5,
            params,
            seed: 3001,
            trials: settings.endpointTrials,
          });
          const lowTarget = fairBaseline / 2;
          const highTarget = (1 + fairBaseline) / 2;
          const endpointError = squared(lowScoreWin - lowTarget) + squared(highScoreWin - highTarget);
          const regularization = 0.0004 * (
            attackerDown ** 2 +
            attackerUp ** 2 +
            defenderDown ** 2 +
            defenderUp ** 2
          );

          candidates.push({
            endpointError,
            highScoreWin,
            lowScoreWin,
            params,
            score: endpointError + regularization,
          });
        }
      }
    }
  }

  return candidates
    .sort((left, right) => left.score - right.score)
    .slice(0, settings.topTiltCount);
}

function fitDistanceCandidates(tiltCandidates, fairBaseline) {
  const candidates = [];

  for (const tiltCandidate of tiltCandidates) {
    for (const heavyDistanceSlope of settings.heavyDistanceSlopes) {
      for (const eliteDistanceSlope of settings.eliteDistanceSlopes) {
        const params = {
          ...tiltCandidate.params,
          heavyDistanceSlope,
          eliteDistanceSlope,
        };
        const challengeBaseline = estimateWinProbability({
          attackerTroops: baselineTroops,
          attackerDistance: 1,
          defenderTroops: baselineTroops,
          defenderDistance: 1,
          params,
          seed: 4001,
          trials: settings.matchupTrials,
        });
        const matchupTarget = challengeBaseline + 0.03;
        const heavyWin = estimateWinProbability({
          attackerTroops: heavyTroops,
          attackerDistance: distanceMultiplierForTroops(heavyTroops, params),
          defenderTroops: baselineTroops,
          defenderDistance: 1,
          params,
          seed: 5001,
          trials: settings.matchupTrials,
        });
        const eliteWin = estimateWinProbability({
          attackerTroops: eliteTroops,
          attackerDistance: distanceMultiplierForTroops(eliteTroops, params),
          defenderTroops: baselineTroops,
          defenderDistance: 1,
          params,
          seed: 6001,
          trials: settings.matchupTrials,
        });
        const matchupError = squared(heavyWin - matchupTarget) + squared(eliteWin - matchupTarget);
        const distanceRegularization = 0.0008 * (heavyDistanceSlope ** 2 + eliteDistanceSlope ** 2);

        candidates.push({
          challengeBaseline,
          eliteWin,
          endpointError: tiltCandidate.endpointError,
          fairBaseline,
          heavyWin,
          highScoreWin: tiltCandidate.highScoreWin,
          lowScoreWin: tiltCandidate.lowScoreWin,
          matchupError,
          params,
          score: tiltCandidate.endpointError + matchupError + distanceRegularization,
        });
      }
    }
  }

  return uniqueCandidates(candidates.sort((left, right) => left.score - right.score))
    .slice(0, accurateMode ? 32 : 8);
}

function rerankCandidates(candidates) {
  const accurateFairBaseline = estimateWinProbability({
    attackerTroops: baselineTroops,
    defenderTroops: baselineTroops,
    fixedAttackerScore: 5,
    fixedDefenderScore: 5,
    params: neutralParams(),
    seed: 7001,
    trials: settings.rerankTrials * 2,
  });

  return candidates
    .map((candidate, index) => {
      const params = candidate.params;
      const lowScoreWin = estimateWinProbability({
        attackerTroops: baselineTroops,
        defenderTroops: baselineTroops,
        fixedAttackerScore: 0,
        fixedDefenderScore: 5,
        params,
        seed: 8001 + index * 101,
        trials: settings.rerankTrials,
      });
      const highScoreWin = estimateWinProbability({
        attackerTroops: baselineTroops,
        defenderTroops: baselineTroops,
        fixedAttackerScore: 10,
        fixedDefenderScore: 5,
        params,
        seed: 9001 + index * 101,
        trials: settings.rerankTrials,
      });
      const challengeBaseline = estimateWinProbability({
        attackerTroops: baselineTroops,
        attackerDistance: 1,
        defenderTroops: baselineTroops,
        defenderDistance: 1,
        params,
        seed: 10001 + index * 101,
        trials: settings.rerankTrials,
      });
      const heavyWin = estimateWinProbability({
        attackerTroops: heavyTroops,
        attackerDistance: distanceMultiplierForTroops(heavyTroops, params),
        defenderTroops: baselineTroops,
        defenderDistance: 1,
        params,
        seed: 11001 + index * 101,
        trials: settings.rerankTrials,
      });
      const eliteWin = estimateWinProbability({
        attackerTroops: eliteTroops,
        attackerDistance: distanceMultiplierForTroops(eliteTroops, params),
        defenderTroops: baselineTroops,
        defenderDistance: 1,
        params,
        seed: 12001 + index * 101,
        trials: settings.rerankTrials,
      });
      const lowTarget = accurateFairBaseline / 2;
      const highTarget = (1 + accurateFairBaseline) / 2;
      const matchupTarget = challengeBaseline + 0.03;
      const endpointError = squared(lowScoreWin - lowTarget) + squared(highScoreWin - highTarget);
      const matchupError = squared(heavyWin - matchupTarget) + squared(eliteWin - matchupTarget);

      return {
        ...candidate,
        challengeBaseline,
        eliteWin,
        endpointError,
        fairBaseline: accurateFairBaseline,
        heavyWin,
        highScoreWin,
        lowScoreWin,
        matchupError,
        score: endpointError + matchupError,
        trials: settings.rerankTrials,
      };
    })
    .sort((left, right) => left.score - right.score);
}

function estimateWinProbability(options) {
  const random = seededRandom(options.seed);
  let attackerWins = 0;

  for (let trial = 0; trial < options.trials; trial += 1) {
    const attackerScore = options.fixedAttackerScore ?? challengeScore(options.attackerDistance ?? 1, random);
    const defenderScore = options.fixedDefenderScore ?? challengeScore(options.defenderDistance ?? 1, random);
    const attackerUnits = createScoredUnits("attacker", options.attackerTroops, attackerScore);
    const defenderUnits = createScoredUnits("defender", options.defenderTroops, defenderScore);

    if (simulateBattle(attackerUnits, defenderUnits, options.params, random) === "attacker") {
      attackerWins += 1;
    }
  }

  return attackerWins / options.trials;
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  const unique = [];

  for (const candidate of candidates) {
    const key = [
      candidate.params.attackerDown,
      candidate.params.attackerUp,
      candidate.params.defenderDown,
      candidate.params.defenderUp,
      candidate.params.heavyDistanceSlope,
      candidate.params.eliteDistanceSlope,
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(candidate);
  }

  return unique;
}

function simulateBattle(attackerUnits, defenderUnits, params, random) {
  let attackers = [...attackerUnits];
  let defenders = [...defenderUnits];

  while (attackers.length > 0 && defenders.length > 0) {
    const attackerDiceUnits = sampleUnits(attackers, Math.min(3, attackers.length), random);
    const defenderDiceUnits = sampleUnits(defenders, Math.min(2, defenders.length), random);
    const attackerDice = rollDice(attackerDiceUnits, "attacker", params, random);
    const defenderDice = rollDice(defenderDiceUnits, "defender", params, random);
    const comparisonCount = Math.min(attackerDice.length, defenderDice.length);
    let attackerLossCount = 0;
    let defenderLossCount = 0;

    // Compare the highest dice side by side, with ties going to the defender.
    for (let index = 0; index < comparisonCount; index += 1) {
      if (attackerDice[index].value > defenderDice[index].value) {
        defenderLossCount += 1;
      } else {
        attackerLossCount += 1;
      }
    }

    attackers = removeCasualties(attackers, attackerDice, attackerLossCount, random);
    defenders = removeCasualties(defenders, defenderDice, defenderLossCount, random);
  }

  return defenders.length === 0 ? "attacker" : "defender";
}

function createScoredUnits(prefix, troops, overallScore) {
  const armyMean = armyBaseMean(troops);
  const units = [];

  // Convert overallScore to individual troop scores while preserving the starting average.
  for (const troopType of TROOP_TYPES) {
    for (let index = 0; index < troops[troopType]; index += 1) {
      units.push({
        id: `${prefix}-${troopType}-${index}`,
        score: individualScore(TROOP_BASE_SCORES[troopType], armyMean, overallScore),
        type: troopType,
      });
    }
  }

  return units;
}

function individualScore(baseScore, armyMean, overallScore) {
  const score = clamp(overallScore, 0, 10);

  if (armyMean <= 0) {
    return score;
  }

  if (score >= armyMean) {
    return baseScore + (10 - baseScore) * ((score - armyMean) / (10 - armyMean));
  }

  return baseScore * (score / armyMean);
}

function challengeScore(distanceMultiplier, random) {
  const radius = sampleGamma(GAMMA_SHAPE, random) * GAMMA_SCALE;
  const adjustedRadius = radius * distanceMultiplier;
  const scorePercentile = 1 - gammaCdf(adjustedRadius);

  return 10 * inverseBeta22Cdf(scorePercentile);
}

function distanceMultiplierForTroops(troops, params) {
  return distanceMultiplierForMean(armyBaseMean(troops), params);
}

function distanceMultiplierForMean(mean, params) {
  if (mean <= 5) {
    return 1 + params.heavyDistanceSlope * ((5 - mean) / 2.5);
  }

  return Math.max(0.1, 1 - params.eliteDistanceSlope * ((mean - 5) / 2.5));
}

function rollDice(units, role, params, random) {
  return units
    .map((unit) => ({
      unitId: unit.id,
      unitType: unit.type,
      value: rollDie(unit.score, role, params, random),
    }))
    .sort((left, right) => right.value - left.value);
}

function rollDie(score, role, params, random) {
  const distribution = dieDistribution(score, role, params);
  let pick = random();

  for (let index = 0; index < distribution.length; index += 1) {
    pick -= distribution[index];
    if (pick <= 0) {
      return DIE_FACES[index];
    }
  }

  return 6;
}

function dieDistribution(score, role, params) {
  const tilt = scoreToTilt(score, role, params);
  const weights = DIE_FACES.map((face) => Math.exp(tilt * (face - 3.5)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  return weights.map((weight) => weight / total);
}

function scoreToTilt(score, role, params) {
  const q = (clamp(score, 0, 10) - 5) / 5;

  if (role === "attacker") {
    return q <= 0 ? q * params.attackerDown : q * params.attackerUp;
  }

  return q <= 0 ? q * params.defenderDown : q * params.defenderUp;
}

function removeCasualties(units, dice, lossCount, random) {
  const lostIds = new Set(sampleUnits(dice, lossCount, random).map((die) => die.unitId));

  return units.filter((unit) => !lostIds.has(unit.id));
}

function sampleUnits(items, count, random) {
  const pool = [...items];
  const selected = [];

  for (let index = 0; index < count && pool.length > 0; index += 1) {
    const itemIndex = Math.floor(random() * pool.length);
    selected.push(pool[itemIndex]);
    pool.splice(itemIndex, 1);
  }

  return selected;
}

function armyBaseMean(troops) {
  const total = troopTotal(troops);
  if (total <= 0) {
    return 0;
  }

  return TROOP_TYPES.reduce((sum, troopType) => sum + troops[troopType] * TROOP_BASE_SCORES[troopType], 0) / total;
}

function troopTotal(troops) {
  return TROOP_TYPES.reduce((sum, troopType) => sum + troops[troopType], 0);
}

function troopCounts(counts) {
  return {
    heavy: counts.heavy ?? 0,
    cavalry: counts.cavalry ?? 0,
    elite: counts.elite ?? 0,
    leader: counts.leader ?? 0,
  };
}

function neutralParams() {
  return {
    attackerDown: 0,
    attackerUp: 0,
    defenderDown: 0,
    defenderUp: 0,
    heavyDistanceSlope: 0,
    eliteDistanceSlope: 0,
  };
}

function printReport(fairBaseline, candidates) {
  const reportBaseline = candidates[0]?.fairBaseline ?? fairBaseline;
  const reportTrials = candidates[0]?.trials ?? 0;

  console.log(`Challenge calibration (${mode})`);
  console.log(`Special rules disabled: ${SPECIAL_RULES_DISABLED.join(", ")}`);
  console.log(`Endpoint trials: ${settings.endpointTrials}`);
  console.log(`Matchup trials: ${settings.matchupTrials}`);
  if (reportTrials > 0) {
    console.log(`Accurate rerank trials: ${reportTrials} per probability`);
  }
  console.log("");
  console.log(`Fixed 10 cavalry score 5 vs 10 cavalry score 5 p: ${formatPercent(reportBaseline)}`);
  console.log(`Endpoint targets: score 0 vs 5 = ${formatPercent(reportBaseline / 2)}, score 10 vs 5 = ${formatPercent((1 + reportBaseline) / 2)}`);
  console.log("");
  console.log("Ranked candidates");

  candidates.forEach((candidate, index) => {
    const params = candidate.params;
    const matchupTarget = candidate.challengeBaseline + 0.03;
    const uncertainty = candidate.trials ? ` +/- ${formatPercent(standardError(candidate.challengeBaseline, candidate.trials))}` : "";

    console.log(`#${index + 1} error=${candidate.score.toFixed(6)}`);
    console.log(`  tilt attackerDown=${params.attackerDown.toFixed(3)} attackerUp=${params.attackerUp.toFixed(3)} defenderDown=${params.defenderDown.toFixed(3)} defenderUp=${params.defenderUp.toFixed(3)}`);
    console.log(`  distance heavy=${distanceMultiplierForTroops(heavyTroops, params).toFixed(3)} cavalry=${distanceMultiplierForTroops(baselineTroops, params).toFixed(3)} elite=${distanceMultiplierForTroops(eliteTroops, params).toFixed(3)}`);
    console.log(`  endpoints observed low=${formatPercent(candidate.lowScoreWin)} high=${formatPercent(candidate.highScoreWin)}`);
    console.log(`  challenge baseline=${formatPercent(candidate.challengeBaseline)}${uncertainty} target=${formatPercent(matchupTarget)} heavy=${formatPercent(candidate.heavyWin)} elite=${formatPercent(candidate.eliteWin)}`);
  });
}

function gammaCdf(radius) {
  return regularizedLowerGamma(GAMMA_SHAPE, radius / GAMMA_SCALE);
}

function regularizedLowerGamma(shape, value) {
  if (value <= 0) {
    return 0;
  }

  if (value < shape + 1) {
    let sum = 1 / shape;
    let term = sum;

    for (let index = 1; index <= 100; index += 1) {
      term *= value / (shape + index);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-8) {
        return clamp(sum * Math.exp(-value + shape * Math.log(value) - logGamma(shape)), 0, 1);
      }
    }

    return clamp(sum * Math.exp(-value + shape * Math.log(value) - logGamma(shape)), 0, 1);
  }

  let b = value + 1 - shape;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;

  for (let index = 1; index <= 100; index += 1) {
    const an = -index * (index - shape);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) {
      d = 1e-30;
    }
    c = b + an / c;
    if (Math.abs(c) < 1e-30) {
      c = 1e-30;
    }
    d = 1 / d;
    const delta = d * c;
    h *= delta;

    if (Math.abs(delta - 1) < 1e-8) {
      break;
    }
  }

  return clamp(1 - Math.exp(-value + shape * Math.log(value) - logGamma(shape)) * h, 0, 1);
}

function inverseBeta22Cdf(percentile) {
  let low = 0;
  let high = 1;

  for (let index = 0; index < 48; index += 1) {
    const midpoint = (low + high) / 2;
    if (beta22Cdf(midpoint) < percentile) {
      low = midpoint;
    } else {
      high = midpoint;
    }
  }

  return (low + high) / 2;
}

function beta22Cdf(scorePercentile) {
  return 3 * scorePercentile ** 2 - 2 * scorePercentile ** 3;
}

function sampleGamma(shape, random) {
  if (shape < 1) {
    return sampleGamma(shape + 1, random) * Math.pow(nonzeroRandom(random), 1 / shape);
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
    const u = nonzeroRandom(random);

    if (u < 1 - 0.0331 * x ** 4) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

function sampleNormal(random) {
  const u = nonzeroRandom(random);
  const v = nonzeroRandom(random);

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function logGamma(value) {
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

function seededRandom(seed) {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function nonzeroRandom(random) {
  return Math.max(Number.EPSILON, random());
}

function range(start, end, step) {
  const values = [];

  for (let value = start; value <= end + step / 2; value += step) {
    values.push(Number(value.toFixed(6)));
  }

  return values;
}

function squared(value) {
  return value * value;
}

function standardError(probability, trials) {
  return Math.sqrt(probability * (1 - probability) / trials);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatPercent(value) {
  return `${(100 * value).toFixed(1)}%`;
}
