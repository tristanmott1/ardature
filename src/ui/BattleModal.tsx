import { Check, Flag } from "lucide-react";
import type { BattleState, GamePlayer, TroopCounts, TroopType } from "../game/gameTypes";
import type { CapturedSpyView } from "../game/gameView";
import { ghostSoldierIconSrc, TroopIconImage } from "../game/troopIcons";
import type { CapturedSpyToken } from "./TroopControls";
import { TroopCountRow } from "./TroopControls";

const BATTLE_TROOP_TYPES: TroopType[] = ["heavy", "cavalry", "elite", "leader"];

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
  attackerTerritoryName,
  battle,
  canChallenge,
  canControl,
  challengePlayerId,
  defender,
  defenderSpies,
  defenderTerritoryName,
  onChallenge,
  onDismiss,
  onRetreat,
  onRoll,
  players,
}: {
  attacker: GamePlayer;
  attackerTerritoryName: string;
  battle: BattleState;
  canChallenge: boolean;
  canControl: boolean;
  challengePlayerId: string | null;
  defender: GamePlayer;
  defenderSpies: CapturedSpyView[];
  defenderTerritoryName: string;
  onChallenge: () => void;
  onDismiss: () => void;
  onRetreat: () => void;
  onRoll: () => void;
  players: GamePlayer[];
}) {
  const scoresReady = battle.attackerScore !== null && battle.defenderScore !== null;
  const message = battle.result
    ? resultMessage(battle, attacker, defender)
    : scoresReady
      ? ""
      : "Waiting...";
  const canRoll = canControl && scoresReady && !battle.result;
  const canRetreat = canControl && battle.hasRolled && !battle.result;
  const defenderDice = displayedDice(battle.latestRoll?.defenderDice, Math.min(2, troopTotal(battle.defendingTroops)));
  const attackerDice = displayedDice(battle.latestRoll?.attackerDice, Math.min(3, attackingBattleTotal(battle)));
  const challengePlayer = challengePlayerId === battle.defenderPlayerId ? defender : attacker;
  const challengeTroops = challengePlayer.id === battle.defenderPlayerId ? battle.defendingTroops : battle.attackingTroops;
  const challengeGhostTroops = challengePlayer.id === battle.attackerPlayerId ? battle.attackingGhostTroops : 0;
  const challengeSpies = challengePlayer.id === battle.defenderPlayerId ? defenderSpies : [];

  if (canChallenge) {
    return (
      <div className="modal-scrim battle-scrim">
        <section className="modal-panel battle-modal battle-challenge-modal" role="dialog" aria-label="Battle challenge">
          <BattleTroops ghostTroops={challengeGhostTroops} player={challengePlayer} players={players} spies={challengeSpies} troops={challengeTroops} />
          <button className="primary icon-text-button battle-challenge-button" type="button" onClick={onChallenge}>
            Challenge
          </button>
        </section>
      </div>
    );
  }

  if (battle.result?.type === "attackerWon" || battle.result?.type === "defenderWon") {
    const winner = battle.result.type === "attackerWon" ? attacker : defender;
    const loser = battle.result.type === "attackerWon" ? defender : attacker;
    const winningTroops = battle.result.type === "attackerWon" ? battle.attackingTroops : battle.defendingTroops;
    const resultSpies = battle.result.type === "attackerWon" && battle.releasedAttackerSpy
      ? [...defenderSpies, { captured: false, ownerPlayerId: attacker.id }]
      : defenderSpies;

    return (
      <div className="modal-scrim battle-scrim">
        <section className="modal-panel battle-modal battle-result-modal" role="dialog" aria-label="Battle result">
          <p className="battle-result-message">{winner.name} defeated {loser.name}</p>
          {battle.result.type === "attackerWon" ? (
            <BattleDiceRows attackerDice={attackerDice} defenderDice={defenderDice} />
          ) : null}
          <BattleTroops
            ghostTroops={battle.result.type === "attackerWon" ? battle.attackingGhostTroops : 0}
            player={winner}
            players={players}
            spies={resultSpies}
            troops={winningTroops}
          />
          {battle.result.type === "defenderWon" ? (
            <BattleDiceRows attackerDice={attackerDice} defenderDice={defenderDice} />
          ) : null}
          <button className="primary icon-text-button wide-button" type="button" onClick={onDismiss} disabled={!canControl} aria-label="Dismiss battle">
            <Check size={20} />
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="modal-scrim battle-scrim">
      <section className="modal-panel battle-modal" role="dialog" aria-label="Battle">
        {message ? <p className="battle-message">{message}</p> : <p className="battle-message" aria-hidden="true">&nbsp;</p>}
        <strong className="battle-player-name">{defender.name} at {defenderTerritoryName}</strong>
        <BattleTroops player={defender} players={players} spies={defenderSpies} troops={battle.defendingTroops} />
        <BattleScore score={battle.defenderScore} />
        <div className="battle-dice-area">
          <button className="battle-dice-button" type="button" onClick={onRoll} disabled={!canRoll} aria-label="Roll dice">
            <BattleDiceRows attackerDice={attackerDice} defenderDice={defenderDice} />
          </button>
        </div>
        <BattleScore score={battle.attackerScore} />
        <BattleTroops ghostTroops={battle.attackingGhostTroops} player={attacker} players={players} troops={battle.attackingTroops} />
        <strong className="battle-player-name">{attacker.name} at {attackerTerritoryName}</strong>
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

function BattleTroops({ ghostTroops = 0, player, players, spies = [], troops }: { ghostTroops?: number; player: GamePlayer; players: GamePlayer[]; spies?: CapturedSpyToken[]; troops: TroopCounts }) {
  const troopTypes = BATTLE_TROOP_TYPES.filter((troopType) => troops[troopType] > 0);

  return (
    <div className="battle-troops">
      <TroopCountRow counts={troops} player={player} players={players} spies={spies} troopTypes={troopTypes} />
      {ghostTroops > 0 ? <GhostSoldierCount count={ghostTroops} player={player} /> : null}
    </div>
  );
}

function GhostSoldierCount({ count, player }: { count: number; player: GamePlayer }) {
  return (
    <span className="troop-icon-count battle-ghost-count" aria-label={`Ghost soldiers: ${count}`}>
      <TroopIconImage ownerColor={player.color} src={ghostSoldierIconSrc()} />
      <span className="troop-count-bubble">{count}</span>
    </span>
  );
}

function BattleScore({ score }: { score: number | null }) {
  return <span className="battle-score">{score !== null ? `${score.toFixed(1)} / 10` : "-- / 10"}</span>;
}

function displayedDice(latestDice: number[] | undefined, currentDiceCount: number) {
  return latestDice ? [...latestDice].sort((left, right) => right - left) : emptyDice(currentDiceCount);
}

function BattleDiceRows({ attackerDice, defenderDice }: { attackerDice: Array<number | null>; defenderDice: Array<number | null> }) {
  return (
    <>
      <DiceRow dice={defenderDice} label="Defender dice" tone="defender" />
      <DiceRow dice={attackerDice} label="Attacker dice" tone="attacker" />
    </>
  );
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

function attackingBattleTotal(battle: Pick<BattleState, "attackingGhostTroops" | "attackingTroops">) {
  return troopTotal(battle.attackingTroops) + battle.attackingGhostTroops;
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
