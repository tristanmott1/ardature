import { useEffect, useRef } from "react";
import { LOCAL_GAME_KEY, pauseLocalGameForStorage, saveLocalGame } from "../game/gameState";
import type { GameState } from "../game/gameTypes";

export function useLocalPauseRecovery(game: GameState) {
  const latestGameRef = useRef(game);

  useEffect(() => {
    latestGameRef.current = game;
  }, [game]);

  useEffect(() => {
    function savePausedLocalGame() {
      const current = latestGameRef.current;

      if (current.mode === "local" && current.phase !== "home" && current.phase !== "setup" && localStorage.getItem(LOCAL_GAME_KEY)) {
        saveLocalGame(pauseLocalGameForStorage(current, Date.now()));
      }
    }

    window.addEventListener("pagehide", savePausedLocalGame);
    window.addEventListener("beforeunload", savePausedLocalGame);

    return () => {
      window.removeEventListener("pagehide", savePausedLocalGame);
      window.removeEventListener("beforeunload", savePausedLocalGame);
    };
  }, []);
}
