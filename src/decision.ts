import type { ActDecision, JevAnswer } from "./types.js";

/** Live clicks require an act decision and an explicit dry-run opt-out. */
export function allowClick(dryRun: boolean, decision: ActDecision): boolean {
  return decision.act && !dryRun;
}

/**
 * Decide whether to click Not interested.
 *
 * - Probabilities present: act only when choice is "yes" AND P(yes) >= threshold.
 * - Probabilities absent: act only on a clear "yes". Documented fallback because
 *   some providers omit the distribution. Jev on AI Gateway normally includes it.
 * - A distribution that omits `yes` is treated as not confident enough.
 */
export function decideNotInterested(answer: JevAnswer, threshold: number): ActDecision {
  if (answer.choice !== "yes") {
    return { act: false, reason: `choice=${answer.choice}` };
  }

  const yes = answer.probabilities?.yes;
  if (answer.probabilities == null) {
    return {
      act: true,
      reason: "choice=yes and no probabilities were returned; acting on clear yes",
    };
  }

  if (typeof yes !== "number" || Number.isNaN(yes)) {
    return {
      act: false,
      reason: "choice=yes but probabilities.yes is missing; not acting",
    };
  }

  if (yes >= threshold) {
    return { act: true, reason: `choice=yes probability=${yes.toFixed(3)} >= ${threshold}` };
  }

  return {
    act: false,
    reason: `choice=yes probability=${yes.toFixed(3)} < ${threshold}`,
  };
}
