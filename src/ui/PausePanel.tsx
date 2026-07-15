import { Play, RotateCcw, ScanLine, Trash2 } from "lucide-react";
import type { GamePlayer } from "../game/gameTypes";
import { QrPanel } from "../sync/QrCodeUi";
import { PlayerIdentity } from "./PlayerChrome";

export function PausePanel({
  canRemove,
  canResume,
  localPlayerId,
  mode,
  onRemovePlayer,
  onRestart,
  onResume,
  onScanRecoveryAnswer,
  onTransferHost,
  players,
  syncMessage,
  syncQrText,
}: {
  canRemove: boolean;
  canResume: boolean;
  localPlayerId: string | null;
  mode: "local" | "sync";
  onRemovePlayer: (playerId: string) => void;
  onRestart?: () => void;
  onResume: () => void;
  onScanRecoveryAnswer?: () => void;
  onTransferHost?: (playerId: string) => void;
  players: GamePlayer[];
  syncMessage?: string;
  syncQrText?: string;
}) {
  const showRecoveryTools = mode === "sync" && Boolean(onScanRecoveryAnswer);
  const transferPlayers = onTransferHost
    ? players.filter((player) => player.id !== localPlayerId && player.connectionStatus === "connected")
    : [];

  return (
    <div className="modal-scrim">
      <section className="modal-panel pause-modal" role="dialog" aria-label="Paused">
        <div className="panel-header">
          <h1>Paused</h1>
          {onRestart ? (
            <button className="icon-button" type="button" onClick={onRestart} aria-label="Restart game">
              <RotateCcw size={18} />
            </button>
          ) : null}
        </div>
        <div className="player-list paused-list">
          {players.map((player) => (
            <article className="player-row compact-row" data-player-status={player.connectionStatus} key={player.id}>
              <PlayerIdentity color={player.color} name={player.name} />
              <span className="connection-label pause-row-status" aria-hidden={mode !== "sync"}>
                {mode === "sync" ? player.connectionStatus : ""}
              </span>
              {canRemove && player.id !== localPlayerId ? (
                <button className="icon-button danger pause-row-action" type="button" onClick={() => onRemovePlayer(player.id)} aria-label={`Remove ${player.name}`}>
                  <Trash2 size={16} />
                </button>
              ) : (
                <span className="icon-button-spacer pause-row-action" aria-hidden="true" />
              )}
            </article>
          ))}
        </div>
        {onTransferHost ? (
          <div className="host-transfer-panel">
            <p className="sync-status">Transfer host before resuming.</p>
            {transferPlayers.map((player) => (
              <button className="secondary icon-text-button wide-button" type="button" key={player.id} onClick={() => onTransferHost(player.id)}>
                Transfer to {player.name}
              </button>
            ))}
          </div>
        ) : null}
        {showRecoveryTools ? (
          <div className="pause-recovery-tools">
            {syncQrText ? <QrPanel text={syncQrText} /> : null}
            <button className="secondary icon-text-button scan-answer-button" type="button" onClick={onScanRecoveryAnswer}>
              <ScanLine size={18} />
              Scan
            </button>
            {syncMessage ? <p className="sync-status">{syncMessage}</p> : null}
          </div>
        ) : null}
        <button className="primary icon-text-button wide-button" type="button" onClick={onResume} disabled={!canResume || players.length < 2}>
          <Play size={20} />
          Resume
        </button>
      </section>
    </div>
  );
}
