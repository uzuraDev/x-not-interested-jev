import { experimental_evaluate as evaluate } from "ai";
import type { JevAnswer, JevPostState } from "./types.js";

/** Vercel AI Gateway model id. Never a TypeSafe direct-API client. */
export const JEV_MODEL = "typesafe-ai/jev";

export const NOT_INTERESTED_INSTRUCTIONS = [
  "Decide whether the user is not interested in this single X (Twitter) post.",
  "Choose yes only when at least one of these is clearly present:",
  "(1) Ads, sales, or affiliate promotion: sponsored posts, promo codes, shop links, PR, 広告, プロモーション, affiliate disclosure, or a hard sell. recommendationReason may say Promoted or 広告 when X labeled the post as an ad.",
  "(2) Flame wars or conflict bait: posts written to start or inflame a fight, insult-trading, pile-ons, or outrage bait. Politics counts only when the post itself is conflict or flame. Calm or ordinary political talk is not enough.",
  "Choose no for everything else.",
  "Do not choose yes merely because the account is not followed, the post is English-only, or the writing looks like generic AI text. Those are out of scope.",
  "If following is yes, choose no. This tool only targets the For You timeline and skips accounts the user already follows.",
].join(" ");

export const NOT_INTERESTED_CRITERIA = {
  yes: "The post is an ad, sales pitch, or affiliate promotion, OR it is a flame war / conflict bait (including politics only when it is actually a fight or bait).",
  no: "Keep the post. It is not an ad and not a flame war. Do not reject it only because the account is not followed, the post is in English, or it looks like generic AI writing.",
} as const;

/**
 * Choice question through Vercel AI Gateway only.
 * A string model id is routed to the gateway; AI_GATEWAY_API_KEY authenticates.
 */
export async function judgeNotInterested(state: JevPostState): Promise<JevAnswer> {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error(
      "AI_GATEWAY_API_KEY is missing. Copy .env.example to .env and set a Vercel AI Gateway key.",
    );
  }

  const result = await evaluate({
    model: JEV_MODEL,
    state,
    questions: {
      notInterested: {
        type: "choice",
        instructions: NOT_INTERESTED_INSTRUCTIONS,
        criteria: NOT_INTERESTED_CRITERIA,
      },
    },
    providerOptions: {
      gateway: { zeroDataRetention: true },
    },
  });

  const answer = result.answers.notInterested;
  if (!answer || answer.type !== "choice") {
    throw new Error(`Unexpected Jev answer shape: ${JSON.stringify(answer)}`);
  }
  if (answer.choice !== "yes" && answer.choice !== "no") {
    throw new Error(`Jev returned unknown choice "${answer.choice}". Expected yes or no.`);
  }

  const probabilities = answer.probabilities
    ? {
        ...(typeof answer.probabilities.yes === "number" ? { yes: answer.probabilities.yes } : {}),
        ...(typeof answer.probabilities.no === "number" ? { no: answer.probabilities.no } : {}),
      }
    : undefined;

  return {
    choice: answer.choice,
    ...(probabilities ? { probabilities } : {}),
  };
}

export function toJevState(post: JevPostState): JevPostState {
  return {
    text: post.text,
    authorHandle: post.authorHandle,
    authorDisplayName: post.authorDisplayName,
    following: post.following,
    recommendationReason: post.recommendationReason,
    mediaPresent: post.mediaPresent,
    language: post.language,
  };
}
