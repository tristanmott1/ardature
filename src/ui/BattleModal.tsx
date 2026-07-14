import { Check, Flag } from "lucide-react";
import type { BattleState, GamePlayer, TroopCounts } from "../game/gameTypes";
import { TroopCountRow } from "./TroopControls";

const DIE_PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function BattleModal({
  attacker,
  battle,
  canChallenge,
  canControl,
  defender,
  onChallenge,
  onDismiss,
  onRetreat,
  onRoll,
}: {
  attacker: GamePlayer;
  battle: BattleState;
  canChallenge: boolean;
  canControl: boolean;
  defender: GamePlayer;
  onChallenge: () => void;
  onDismiss: () => void;
  onRetreat: () => void;
  onRoll: () => void;
}) {
  const scoresReady = battle.attackerScore !== null && battle.defenderScore !== null;
  const message = battle.result
    ? resultMessage(battle, attacker, defender)
    : scoresReady
      ? ""
      : "Waiting...";
  const canRoll = canControl && scoresReady && !battle.result;
  const canRetreat = canControl && battle.hasRolled && !battle.result;
  const defenderDice = battle.latestRoll?.defenderDice ?? emptyDice(Math.min(2, troopTotal(battle.defendingTroops)));
  const attackerDice = battle.latestRoll?.attackerDice ?? emptyDice(Math.min(3, troopTotal(battle.attackingTroops)));

  if (canChallenge) {
    return (
      <div className="modal-scrim battle-scrim">
        <section className="modal-panel battle-modal battle-challenge-modal" role="dialog" aria-label="Battle challenge">
          <button className="primary icon-text-button battle-challenge-button" type="button" onClick={onChallenge}>
            Challenge
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="modal-scrim battle-scrim">
      <section className="modal-panel battle-modal" role="dialog" aria-label="Battle">
        {message ? <p className="battle-message">{message}</p> : <p className="battle-message" aria-hidden="true">&nbsp;</p>}
        <strong className="battle-player-name">{defender.name}</strong>
        <BattleTroops player={defender} troops={battle.defendingTroops} />
        <BattleScore score={battle.defenderScore} />
        <div className="battle-dice-area">
          <button className="battle-dice-button" type="button" onClick={onRoll} disabled={!canRoll} aria-label="Roll dice">
            <DiceRow dice={defenderDice} label="Defender dice" tone="defender" />
            <DiceRow dice={attackerDice} label="Attacker dice" tone="attacker" />
          </button>
        </div>
        <BattleScore score={battle.attackerScore} />
        <BattleTroops player={attacker} troops={battle.attackingTroops} />
        <strong className="battle-player-name">{attacker.name}</strong>
        {battle.result ? (
          <button className="primary icon-text-button wide-button" type="button" onClick={onDismiss} disabled={!canControl} aria-label="Dismiss battle">
            <Check size={20} />
          </button>
        ) : (
          <button className="secondary icon-text-button wide-button" type="button" onClick={onRetreat} disabled={!canRetreat}>
            <Flag size={18} />
            Retreat
          </button>
        )}
      </section>
    </div>
  );
}

function BattleTroops({ player, troops }: { player: GamePlayer; troops: TroopCounts }) {
  return (
    <div className="battle-troops">
      <TroopCountRow counts={troops} player={player} />
    </div>
  );
}

function BattleScore({ score }: { score: number | null }) {
  return <span className="battle-score">{score !== null ? `${score.toFixed(1)} / 10` : "-- / 10"}</span>;
}

function DiceRow({ dice, label, tone }: { dice: Array<number | null>; label: string; tone: "attacker" | "defender" }) {
  return (
    <div className="battle-dice-row" aria-label={label}>
      {dice.map((die, index) => (
        <Die face={die} key={index} tone={tone} />
      ))}
    </div>
  );
}

function Die({ face, tone }: { face: number | null; tone: "attacker" | "defender" }) {
  const positions = face ? DIE_PIPS[face] : [];

  return (
    <span className={`battle-die battle-die-${tone}`} data-empty={face === null ? "true" : undefined}>
      {Array.from({ length: 9 }, (_, index) => (
        <span className={positions.includes(index) ? `battle-pip p${index} visible` : `battle-pip p${index}`} key={index} />
      ))}
    </span>
  );
}

function emptyDice(count: number) {
  return Array.from({ length: count }, () => null);
}

function troopTotal(troops: TroopCounts) {
  return troops.cavalry + troops.elite + troops.heavy + troops.leader;
}

function resultMessage(battle: BattleState, attacker: GamePlayer, defender: GamePlayer) {
  if (battle.result?.type === "attackerWon") {
    return `${attacker.name} won`;
  }

  if (battle.result?.type === "defenderWon") {
    return `${defender.name} won`;
  }

  return `${attacker.name} retreated`;
}
