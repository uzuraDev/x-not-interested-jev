export type AppConfig = {
  cdpUrl: string;
  /** True unless DRY_RUN is exactly "false". */
  dryRun: boolean;
  threshold: number;
  maxActions: number;
  maxPosts: number;
  minDelayMs: number;
  maxDelayMs: number;
};

function intFrom(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer (got ${raw}).`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dryRaw = (env.DRY_RUN ?? "true").trim().toLowerCase();
  const dryRun = dryRaw !== "false";

  const thresholdRaw = (env.THRESHOLD ?? "0.85").trim();
  const threshold = Number(thresholdRaw);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(`THRESHOLD must be a number from 0 to 1 (got ${thresholdRaw}).`);
  }

  const minDelayMs = intFrom(env, "MIN_DELAY_MS", 3000);
  const maxDelayMs = intFrom(env, "MAX_DELAY_MS", 8000);
  if (maxDelayMs < minDelayMs) {
    throw new Error(
      `MAX_DELAY_MS (${maxDelayMs}) must be greater than or equal to MIN_DELAY_MS (${minDelayMs}).`,
    );
  }

  return {
    cdpUrl: (env.CDP_URL ?? "http://127.0.0.1:9222").trim() || "http://127.0.0.1:9222",
    dryRun,
    threshold,
    maxActions: intFrom(env, "MAX_ACTIONS", 20),
    maxPosts: intFrom(env, "MAX_POSTS", 40),
    minDelayMs,
    maxDelayMs,
  };
}

/** Mute / Block are intentionally unimplemented. Surface a warning if opted in. */
export function unusedSafetyFlags(env: NodeJS.ProcessEnv = process.env): string[] {
  const warnings: string[] = [];
  for (const name of ["ENABLE_MUTE", "ENABLE_BLOCK"] as const) {
    if (/^(1|true|yes)$/i.test((env[name] ?? "").trim())) {
      warnings.push(`${name} is set, but that action is not implemented and stays off.`);
    }
  }
  return warnings;
}
