import { RotateCcw, X } from "lucide-react";

const TARGET_RINGS = [
  "#b72432",
  "#f0ca45",
  "#245f9f",
  "#f1e3bc",
  "#b72432",
  "#245f9f",
  "#f0ca45",
  "#f1e3bc",
  "#b72432",
  "#245f9f",
  "#f0ca45",
  "#7d4a24",
];

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
      <div className="challenge-test-stage" aria-label="Challenge test area">
        <ChallengeTarget />
      </div>
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

function ChallengeTarget() {
  const ringCount = TARGET_RINGS.length;

  return (
    <svg className="challenge-target" viewBox="0 0 200 200" role="img" aria-label="Challenge target">
      {TARGET_RINGS.map((fill, index) => (
        <circle key={`${fill}-${index}`} cx="100" cy="100" r={96 - index * (90 / ringCount)} fill={fill} />
      ))}
      <circle cx="100" cy="100" r="96" fill="none" stroke="#2f1d12" strokeWidth="3" />
      <circle cx="100" cy="100" r="7" fill="#b72432" stroke="#2f1d12" strokeWidth="1.5" />
    </svg>
  );
}
