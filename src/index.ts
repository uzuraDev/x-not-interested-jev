import "dotenv/config";
import { ForYouSession } from "./browser.js";
import { loadConfig, unusedSafetyFlags } from "./config.js";
import { allowClick, decideNotInterested } from "./decision.js";
import { isEligibleFollowing } from "./following.js";
import { judgeNotInterested, JEV_MODEL, toJevState } from "./jev.js";
import { jitterDelayMs, sleep } from "./pacing.js";
import type { JevAnswer } from "./types.js";

const IDLE_SCROLL_LIMIT = 4;

function preview(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "(no text)";
  return flat.length > 100 ? `${flat.slice(0, 100)}…` : flat;
}

function formatAnswer(answer: JevAnswer): string {
  const yes = answer.probabilities?.yes;
  const no = answer.probabilities?.no;
  const parts = [`choice=${answer.choice}`];
  parts.push(typeof yes === "number" ? `P(yes)=${yes.toFixed(3)}` : "P(yes)=n/a");
  if (typeof no === "number") parts.push(`P(no)=${no.toFixed(3)}`);
  return parts.join(" ");
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (!process.env.AI_GATEWAY_API_KEY) {
    console.error(
      [
        "AI_GATEWAY_API_KEY がありません。",
        ".env.example を .env にコピーし、Vercel AI Gateway のキーを設定してください。",
        "https://vercel.com/docs/ai-gateway",
      ].join("\n"),
    );
    process.exit(1);
  }

  for (const warning of unusedSafetyFlags()) {
    console.warn(`warning: ${warning}`);
  }

  console.log(`model: ${JEV_MODEL} via Vercel AI Gateway`);
  console.log(
    `DRY_RUN=${config.dryRun} THRESHOLD=${config.threshold} MAX_ACTIONS=${config.maxActions} MAX_POSTS=${config.maxPosts} delay=${config.minDelayMs}-${config.maxDelayMs}ms CDP=${config.cdpUrl}`,
  );
  if (config.dryRun) {
    console.log("ドライランです。判定だけ記録し、「興味がない」はクリックしません。");
    console.log("クリックするには DRY_RUN=false を明示してください。");
  } else {
    console.log("LIVE です。確信度が閾値以上のときだけ「このポストに興味がない」をクリックします。");
    console.log("Mute / Block は実装されておらず、押しません。");
  }

  const life = { stopping: false, signals: 0 };
  let session: ForYouSession | null = null;

  const shutdown = (signal: string) => {
    life.signals += 1;
    if (life.signals === 1) {
      life.stopping = true;
      console.log(`\n[${signal}] このポストの処理が終わったら停止します。`);
      return;
    }
    void session?.disconnect().finally(() => process.exit(1));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  session = await ForYouSession.connect(config.cdpUrl);
  try {
    console.log(`attached: ${session.url()}`);
    await session.ensureForYou();
    console.log("For You / おすすめ を確認しました。\n");

    const seen = new Set<string>();
    let actions = 0;
    let evaluated = 0;
    let skippedFollowing = 0;
    let jevErrors = 0;
    let clickFailures = 0;
    let idleScrolls = 0;

    while (!life.stopping && actions < config.maxActions && evaluated < config.maxPosts) {
      if (!(await session.isForYou())) {
        console.log("おすすめ以外の画面になったため停止します。クリックはしません。");
        break;
      }

      let posts;
      try {
        posts = await session.observe();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`observe error: ${message}`);
        await sleep(jitterDelayMs(config.minDelayMs, config.maxDelayMs));
        continue;
      }

      const fresh = posts.filter((post) => !seen.has(post.id));
      if (fresh.length === 0) {
        idleScrolls += 1;
        if (idleScrolls > IDLE_SCROLL_LIMIT) {
          console.log("新しいポストが尽きたため停止します。");
          break;
        }
        console.log(`visible posts already seen (${posts.length}). scrolling…`);
        await session.scroll();
        await sleep(jitterDelayMs(config.minDelayMs, config.maxDelayMs));
        continue;
      }
      idleScrolls = 0;

      for (const post of fresh) {
        if (life.stopping || actions >= config.maxActions || evaluated >= config.maxPosts) break;
        seen.add(post.id);

        if (!(await session.isForYou())) {
          console.log("おすすめ以外の画面になったため停止します。クリックはしません。");
          life.stopping = true;
          break;
        }

        if (!isEligibleFollowing(post.following)) {
          skippedFollowing += 1;
          console.log(
            `skip @${post.authorHandle} ${post.id} following=${post.following} — Follow ボタンが見えないため、フォロー中の可能性があり対象外`,
          );
          continue;
        }

        evaluated += 1;
        console.log(
          `-- ${evaluated}/${config.maxPosts} ${post.id} @${post.authorHandle} following=${post.following} lang=${post.language} media=${post.mediaPresent} reason=${post.recommendationReason ?? "none"}`,
        );
        console.log(`   ${preview(post.text)}`);

        let answer: JevAnswer;
        try {
          answer = await judgeNotInterested(toJevState(post));
        } catch (err) {
          jevErrors += 1;
          const message = err instanceof Error ? err.message : String(err);
          console.error(`   jev error: ${message}`);
          await sleep(jitterDelayMs(config.minDelayMs, config.maxDelayMs));
          continue;
        }

        const decision = decideNotInterested(answer, config.threshold);
        console.log(`   jev: ${formatAnswer(answer)} -> ${decision.reason}`);

        if (!decision.act) {
          await sleep(jitterDelayMs(config.minDelayMs, config.maxDelayMs));
          continue;
        }

        actions += 1;
        if (!allowClick(config.dryRun, decision)) {
          console.log(
            `   DRY-RUN ${actions}/${config.maxActions}: would click このポストに興味がない（クリックしない）`,
          );
        } else {
          try {
            const result = await session.markNotInterested(post.id, { dryRun: false });
            if (result.ok) {
              console.log(`   click ${actions}/${config.maxActions}: ${result.message}`);
            } else {
              clickFailures += 1;
              console.log(`   click failed ${actions}/${config.maxActions}: ${result.message}`);
            }
          } catch (err) {
            clickFailures += 1;
            const message = err instanceof Error ? err.message : String(err);
            console.error(`   click error: ${message}`);
          }
        }

        await sleep(jitterDelayMs(config.minDelayMs, config.maxDelayMs));
      }
    }

    console.log(
      `\nDone. evaluated=${evaluated} skippedFollowing=${skippedFollowing} actions=${actions} clickFailures=${clickFailures} jevErrors=${jevErrors} dryRun=${config.dryRun}`,
    );
  } finally {
    await session.disconnect();
    console.log("Chrome からは切断しました。ウィンドウは開いたままです。");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
