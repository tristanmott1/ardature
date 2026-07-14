import { Check, Flag } from "lucide-react";
import type { BattleState, GamePlayer } from "../game/gameTypes";
import { TroopCountRow } from "./TroopControls";

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

  return (
    <div className="modal-scrim battle-scrim">
      <section className="modal-panel battle-modal" role="dialog" aria-label="Battle">
        <BattleArmy name={defender.name} player={defender} score={battle.defenderScore} troops={battle.defendingTroops} />
        <div className="battle-center">
          {message ? <p className="battle-message">{message}</p> : <p className="battle-message" aria-hidden="true">&nbsp;</p>}
          {canChallenge ? (
            <button className="primary icon-text-button battle-challenge-button" type="button" onClick={onChallenge}>
              Challenge
            </button>
          ) : (
            <button className="battle-dice-button" type="button" onClick={onRoll} disabled={!canRoll} aria-label="Roll dice">
              <DiceRow dice={battle.latestRoll?.defenderDice ?? []} label="Defender dice" />
              <DiceRow dice={battle.latestRoll?.attackerDice ?? []} label="Attacker dice" />
            </button>
          )}
        </div>
        <BattleArmy name={attacker.name} player={attacker} score={battle.attackerScore} troops={battle.attackingTroops} />
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

function BattleArmy({ name, player, score, troops }: { name: string; player: GamePlayer; score: number | null; troops: BattleState["attackingTroops"] }) {
  return (
    <section className="battle-army">
      <div className="battle-army-heading">
        <strong>{name}</strong>
        {score !== null ? <span>{score.toFixed(1)}</span> : null}
      </div>
      <TroopCountRow counts={troops} player={player} />
    </section>
  );
}

function DiceRow({ dice, label }: { dice: number[]; label: string }) {
  return (
    <div className="battle-dice-row" aria-label={label}>
      {(dice.length > 0 ? dice : [null, null, null]).map((die, index) => (
        <span className="battle-die" data-empty={die === null ? "true" : undefined} key={index}>
          {die ?? ""}
        </span>
      ))}
    </div>
  );
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
