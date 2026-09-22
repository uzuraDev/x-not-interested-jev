import type { Following } from "./types.js";

/**
 * Eligible posts are ones we can see are not followed (a Follow button).
 * Missing that signal is treated as followed-or-unknown and skipped, so a
 * post from someone you already follow is not marked Not interested.
 */
export function isEligibleFollowing(following: Following): boolean {
  return following === "no";
}

/**
 * Classify follow-state from button labels on one post.
 * "yes" only on positive evidence (Following / Unfollow). A visible Follow
 * button means the viewer does not follow the author.
 */
export function classifyFollowing(labels: string[]): Following {
  const joined = labels
    .map((label) => label.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  if (!joined) return "unknown";

  // Word-ish tokens. Japanese has no \b, so delimit on whitespace or ends.
  if (/unfollow|フォロー解除/i.test(joined)) return "yes";
  if (/(?:^|\s)(?:following|フォロー中)(?:\s|$)/i.test(joined)) return "yes";

  if (/(?:^|\s)follow @/i.test(joined) || /をフォロー/.test(joined)) return "no";
  if (/(?:^|\s)(?:follow|フォローする|フォロー)(?:\s|$)/i.test(joined)) return "no";

  return "unknown";
}
