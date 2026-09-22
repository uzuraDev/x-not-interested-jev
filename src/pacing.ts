/** Inclusive random integer delay between min and max milliseconds. */
export function jitterDelayMs(minMs: number, maxMs: number, random: () => number = Math.random): number {
  const lo = Math.min(minMs, maxMs);
  const hi = Math.max(minMs, maxMs);
  return lo + Math.floor(random() * (hi - lo + 1));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
