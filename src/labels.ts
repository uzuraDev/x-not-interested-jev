const NOT_INTERESTED_TEXT =
  /このポストに興味がない|この投稿に興味がない|興味がない|not interested/i;

const DANGEROUS =
  /ミュート|ブロック|報告|mute|block|report|フォロー解除|unfollow/i;

const POST_LEVEL = /このポスト|この投稿|this post/i;

const NOT_INTERESTED_TESTID = /not[-_ ]?interested/i;

export type MenuItemLabel = {
  text: string;
  ariaLabel: string;
  testId: string;
};

function blob(item: MenuItemLabel): string {
  return `${item.text} ${item.ariaLabel}`.replace(/\s+/g, " ").trim();
}

function isDangerous(item: MenuItemLabel): boolean {
  return DANGEROUS.test(blob(item));
}

function matchesNotInterested(item: MenuItemLabel): boolean {
  return NOT_INTERESTED_TEXT.test(blob(item)) || NOT_INTERESTED_TESTID.test(item.testId);
}

/**
 * Pick the post-level 「このポストに興味がない」 / "Not interested" menu row.
 * Mute, Block, Report, and Unfollow never match. Author-level "@" rows lose
 * to an explicit post-level label.
 */
export function pickNotInterestedItem<T extends MenuItemLabel>(items: T[]): T | null {
  const safe = items.filter((item) => matchesNotInterested(item) && !isDangerous(item));
  const postLevel = safe.filter(
    (item) => POST_LEVEL.test(blob(item)) || NOT_INTERESTED_TESTID.test(item.testId),
  );
  if (postLevel.length > 0) return postLevel[0] ?? null;
  const generic = safe.filter((item) => !/@/.test(blob(item)));
  return generic[0] ?? null;
}

/** Accessible name of the home tab that is For You / おすすめ. */
export function isForYouTabName(name: string): boolean {
  const text = name.replace(/\s+/g, " ").trim();
  // Japanese has no \b word boundary, so require whitespace or end.
  return /^(?:for you|おすすめ)(?:\s|$)/i.test(text);
}

/** Accessible name of the Following / フォロー中 tab. */
export function isFollowingTabName(name: string): boolean {
  const text = name.replace(/\s+/g, " ").trim();
  return /^(?:following|フォロー中)(?:\s|$)/i.test(text);
}
