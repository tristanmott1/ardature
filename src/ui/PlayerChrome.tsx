import type { CSSProperties, RefObject } from "react";
import { Pause, X } from "lucide-react";
import type { GamePlayer, PlayerColor } from "../game/gameTypes";
import { colorCss, isLightColor } from "../game/playerColors";

export function PlayerIdentity({ color, name }: { color: PlayerColor | null; name: string }) {
  return (
    <span className="player-identity">
      <span className="player-dot" style={{ background: colorCss(color) }} />
      <strong>{name}</strong>
    </span>
  );
}

export function PlayerBar({
  detail,
  onExit,
  onPause,
  onTitlePress,
  pauseLabel,
  player,
  rootRef,
  timerRemaining,
  title,
}: {
  detail?: string | null;
  onExit: () => void;
  onPause?: () => void;
  onTitlePress?: () => void;
  pauseLabel?: string;
  player: GamePlayer | null;
  rootRef?: RefObject<HTMLDivElement | null>;
  timerRemaining?: number | null;
  title: string;
}) {
  const light = isLightColor(player?.color ?? null);

  return (
    <div className="player-bar" data-tone={light ? "light" : "dark"} ref={rootRef} style={{ "--bar-color": colorCss(player?.color ?? null) } as CSSProperties}>
      <button className="icon-button player-bar-button" type="button" onClick={onExit} aria-label="End game">
        <X size={18} />
      </button>
      <button
        className="player-bar-player"
        type="button"
        onClick={onTitlePress}
        disabled={!onTitlePress}
        aria-label={onTitlePress ? "Change viewer" : undefined}
      >
        <strong>{title}</strong>
        {detail ? <span>{detail}</span> : null}
      </button>
      <div className="player-bar-tools">
        {timerRemaining !== null && timerRemaining !== undefined ? <span className="timer-chip player-bar-timer">{Math.ceil(timerRemaining / 1000)}s</span> : null}
        {onPause ? (
          <button className="icon-button player-bar-button" type="button" onClick={onPause} aria-label={pauseLabel ?? "Pause"}>
            <Pause size={18} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
