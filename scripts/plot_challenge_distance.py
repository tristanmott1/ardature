from __future__ import annotations

import argparse
import csv
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.stats import beta, gamma


GAMMA_SHAPE = 3.25
GAMMA_SCALE = 0.76
BETA_ALPHA = 2
BETA_BETA = 2
DEFAULT_DISTANCE_MULTIPLIERS = [0.16, 0.25, 0.35, 0.5, 0.75, 1.0, 1.25, 1.5, 1.63, 1.85, 2.0]
SCORE_BIN_EDGES = np.linspace(0, 10, 41)
SUMMARY_BIN_EDGES = np.linspace(0, 10, 1001)
BUCKET_LABELS = ["<1", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]


def main() -> None:
    args = parse_args()
    output_dir = args.output
    output_dir.mkdir(parents=True, exist_ok=True)
    distances = parse_distances(args.distances)
    rows = [distance_summary(distance) for distance in distances]

    write_summary(output_dir / "distance-summary.csv", rows)
    write_score_distribution(output_dir / "score-distributions.csv", distances)
    plot_score_distributions(output_dir / "score-distributions.png", distances)
    plot_score_pdfs(output_dir / "score-pdfs.png", distances)
    plot_bucket_heatmap(output_dir / "score-bucket-heatmap.png", rows)
    remove_stale_output(output_dir / "score-cdfs.png")
    remove_stale_output(output_dir / "score-cdfs.svg")

    print(f"Wrote challenge distance plots to {output_dir}")
    print("Distance multipliers:", ", ".join(format_distance(distance) for distance in distances))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Plot challenge score distributions as target distance changes.")
    parser.add_argument(
        "--output",
        default=Path("verification-output/challenge-calibration"),
        type=Path,
        help="Folder for generated plots and CSV files.",
    )
    parser.add_argument(
        "--distances",
        default=",".join(str(distance) for distance in DEFAULT_DISTANCE_MULTIPLIERS),
        help="Comma-separated target distance multipliers. Distance 1.0 is the current cavalry distance.",
    )
    return parser.parse_args()


def parse_distances(raw_distances: str) -> list[float]:
    distances = []

    for raw_distance in raw_distances.split(","):
        distance = float(raw_distance.strip())
        if distance <= 0:
            raise ValueError("Distances must be positive.")
        distances.append(distance)

    return distances


def score_for_radius(radius: np.ndarray | float) -> np.ndarray | float:
    accuracy_percentile = 1 - gamma_dist().cdf(radius)
    return 10 * beta_dist().ppf(accuracy_percentile)


def radius_for_score(score: float) -> float:
    if score <= 0:
        return float("inf")

    if score >= 10:
        return 0

    accuracy_percentile = beta_dist().cdf(score / 10)
    return gamma_dist().ppf(1 - accuracy_percentile)


def score_probability(distance: float, low_score: float, high_score: float) -> float:
    low_radius = radius_for_score(low_score)
    high_radius = radius_for_score(high_score)
    low_cdf = 1 if np.isinf(low_radius) else gamma_dist().cdf(low_radius / distance)
    high_cdf = gamma_dist().cdf(high_radius / distance)

    return max(0, low_cdf - high_cdf)


def score_distribution(distance: float, bin_edges: np.ndarray) -> list[float]:
    return [
        score_probability(distance, float(bin_edges[index]), float(bin_edges[index + 1]))
        for index in range(len(bin_edges) - 1)
    ]


def distance_summary(distance: float) -> dict[str, float | str]:
    distribution = np.array(score_distribution(distance, SUMMARY_BIN_EDGES))
    midpoints = (SUMMARY_BIN_EDGES[:-1] + SUMMARY_BIN_EDGES[1:]) / 2
    mean_score = float(np.sum(distribution * midpoints))
    variance = float(np.sum(distribution * (midpoints - mean_score) ** 2))
    buckets = bucket_probabilities(distance)
    row: dict[str, float | str] = {
        "distance": distance,
        "meanScore": mean_score,
        "scoreStdDev": variance ** 0.5,
    }

    for label, probability in zip(BUCKET_LABELS, buckets):
        row[f"bucket_{label}"] = probability

    return row


def bucket_probabilities(distance: float) -> list[float]:
    return [
        score_probability(distance, 0, 0.5),
        score_probability(distance, 0.5, 1.5),
        score_probability(distance, 1.5, 2.5),
        score_probability(distance, 2.5, 3.5),
        score_probability(distance, 3.5, 4.5),
        score_probability(distance, 4.5, 5.5),
        score_probability(distance, 5.5, 6.5),
        score_probability(distance, 6.5, 7.5),
        score_probability(distance, 7.5, 8.5),
        score_probability(distance, 8.5, 9.5),
        score_probability(distance, 9.5, 10),
    ]


def write_summary(path: Path, rows: list[dict[str, float | str]]) -> None:
    with path.open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def write_score_distribution(path: Path, distances: list[float]) -> None:
    with path.open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=["distance", "scoreLow", "scoreHigh", "probability"])
        writer.writeheader()

        for distance in distances:
            probabilities = score_distribution(distance, SCORE_BIN_EDGES)
            for index, probability in enumerate(probabilities):
                writer.writerow({
                    "distance": distance,
                    "scoreLow": SCORE_BIN_EDGES[index],
                    "scoreHigh": SCORE_BIN_EDGES[index + 1],
                    "probability": probability,
                })


def plot_score_distributions(path: Path, distances: list[float]) -> None:
    midpoints = (SCORE_BIN_EDGES[:-1] + SCORE_BIN_EDGES[1:]) / 2
    plt.figure(figsize=(11, 6.5))

    for distance in distances:
        probabilities = np.array(score_distribution(distance, SCORE_BIN_EDGES))
        plt.plot(midpoints, probabilities * 100, linewidth=1.8, label=format_distance(distance))

    plt.title("Challenge Score Distribution by Target Distance")
    plt.xlabel("Score")
    plt.ylabel("Probability per 0.25 score bin (%)")
    plt.xlim(0, 10)
    plt.ylim(bottom=0)
    plt.grid(alpha=0.24)
    plt.legend(title="Distance", ncol=2)
    plt.tight_layout()
    plt.savefig(path, dpi=180)
    plt.savefig(path.with_suffix(".svg"))
    plt.close()


def plot_score_pdfs(path: Path, distances: list[float]) -> None:
    scores = np.linspace(0.001, 9.999, 600)
    plt.figure(figsize=(11, 6.5))

    for distance in distances:
        pdf_values = [score_pdf(distance, float(score)) for score in scores]
        plt.plot(scores, pdf_values, linewidth=1.8, label=format_distance(distance))

    plt.title("Challenge Score PDF by Target Distance")
    plt.xlabel("Score")
    plt.ylabel("Probability density")
    plt.xlim(0, 10)
    plt.ylim(bottom=0)
    plt.grid(alpha=0.24)
    plt.legend(title="Distance", ncol=2)
    plt.tight_layout()
    plt.savefig(path, dpi=180)
    plt.savefig(path.with_suffix(".svg"))
    plt.close()


def score_pdf(distance: float, score: float) -> float:
    radius = radius_for_score(score)
    numerator = gamma_dist().pdf(radius / distance) * beta_dist().pdf(score / 10)
    denominator = distance * 10 * gamma_dist().pdf(radius)

    return float(numerator / denominator)


def plot_bucket_heatmap(path: Path, rows: list[dict[str, float | str]]) -> None:
    distances = [float(row["distance"]) for row in rows]
    values = np.array([[float(row[f"bucket_{label}"]) * 100 for label in BUCKET_LABELS] for row in rows])
    plt.figure(figsize=(12, 7))
    heatmap = plt.imshow(values, aspect="auto", cmap="viridis")
    plt.colorbar(heatmap, label="Probability (%)")
    plt.title("Challenge Score Bucket Probability by Target Distance")
    plt.xticks(np.arange(len(BUCKET_LABELS)), BUCKET_LABELS)
    plt.yticks(np.arange(len(distances)), [format_distance(distance) for distance in distances])
    plt.xlabel("Score bucket")
    plt.ylabel("Target distance multiplier")

    for row_index in range(values.shape[0]):
        for column_index in range(values.shape[1]):
            plt.text(column_index, row_index, f"{values[row_index, column_index]:.0f}", ha="center", va="center", color="white" if values[row_index, column_index] > 13 else "black", fontsize=7)

    plt.tight_layout()
    plt.savefig(path, dpi=180)
    plt.savefig(path.with_suffix(".svg"))
    plt.close()


def gamma_dist():
    return gamma(a=GAMMA_SHAPE, scale=GAMMA_SCALE)


def beta_dist():
    return beta(a=BETA_ALPHA, b=BETA_BETA)


def format_distance(distance: float) -> str:
    return f"{distance:.2f}".rstrip("0").rstrip(".")


def remove_stale_output(path: Path) -> None:
    if path.exists():
        path.unlink()


if __name__ == "__main__":
    main()
