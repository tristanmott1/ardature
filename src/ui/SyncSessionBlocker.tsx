import { Check, X } from "lucide-react";
import type { SyncSessionStatus } from "../game/gameView";

export function SyncSessionBlocker({ onHome, session }: { onHome?: () => void; session: SyncSessionStatus }) {
  const message = session === "hostEnded"
    ? "Host ended the game"
    : session === "disconnected"
      ? "Host disconnected"
      : "Reconnecting...";
  const Icon = session === "reconnecting" ? X : Check;
  const label = session === "reconnecting" ? "Stop reconnecting" : "Return home";

  return (
    <div className="modal-scrim sync-session-scrim">
      <section className="modal-panel decision-modal sync-session-dialog" role="alertdialog" aria-label="Sync connection">
        <h2>{message}</h2>
        {onHome ? (
          <div className="sync-session-actions">
            <button className="icon-button primary large" type="button" onClick={onHome} aria-label={label}>
              <Icon size={24} />
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
