/** Whether the logged-in account already follows the post author. */
export type Following = "yes" | "no" | "unknown";

/** Fields scraped from one visible For You post. Sent to Jev as state. */
export type PostSnapshot = {
  /** Numeric status id from the permalink, used to re-find the article. */
  id: string;
  text: string;
  authorHandle: string;
  authorDisplayName: string;
  following: Following;
  /** Visible "why you're seeing this" / social context / Promoted label, if any. */
  recommendationReason: string | null;
  mediaPresent: boolean;
  /** BCP-47-ish tag from the tweet text node, else a small script heuristic. */
  language: string;
};

/** State object passed to Jev. Keys stay stable so criteria can refer to them. */
export type JevPostState = {
  text: string;
  authorHandle: string;
  authorDisplayName: string;
  following: Following;
  recommendationReason: string | null;
  mediaPresent: boolean;
  language: string;
};

export type NotInterestedChoice = "yes" | "no";

export type JevAnswer = {
  choice: NotInterestedChoice;
  /** Present when the model returned a distribution. Values are 0–1. */
  probabilities?: Partial<Record<NotInterestedChoice, number>>;
};

export type ActDecision = {
  act: boolean;
  /** Short reason written to the log. */
  reason: string;
};
