import { RotateCcw, X } from "lucide-react";

export function ChallengeTestPage({ onExit }: { onExit: () => void }) {
  return (
    <section className="challenge-test-page">
      <header className="challenge-test-topbar">
        <button className="icon-button" type="button" onClick={onExit} aria-label="Return home">
          <X size={20} />
        </button>
        <button className="icon-button" type="button" aria-label="Restart challenge">
          <RotateCcw size={20} />
        </button>
      </header>
      <div className="challenge-test-stage" aria-label="Challenge test area" />
      <footer className="challenge-test-scorebar">
        <div className="challenge-score-item">
          <span>Attempts</span>
          <strong>0</strong>
        </div>
        <div className="challenge-score-item">
          <span>Sigma</span>
          <strong>0</strong>
        </div>
      </footer>
    </section>
  );
}
