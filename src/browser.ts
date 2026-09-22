import { chromium, type Browser, type Locator, type Page } from "playwright";
import { classifyFollowing } from "./following.js";
import { resolveLanguage } from "./language.js";
import { isFollowingTabName, isForYouTabName, pickNotInterestedItem, type MenuItemLabel } from "./labels.js";
import { sleep } from "./pacing.js";
import type { PostSnapshot } from "./types.js";

const HOME_URL = "https://x.com/home";

type RawPost = {
  id: string;
  text: string;
  authorHandle: string;
  authorDisplayName: string;
  buttonLabels: string[];
  recommendationReason: string | null;
  mediaPresent: boolean;
  langAttr: string;
};

export function chromeLaunchHelp(): string {
  return [
    "Chrome に接続できませんでした。リモートデバッグ付きで起動してから再実行してください。",
    "",
    "1. Chrome を完全に終了する（起動中だと --remote-debugging-port は無視されます）。",
    "2. 普段のプロファイルのまま起動する:",
    "",
    "   macOS:",
    '   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222',
    "",
    "   Linux:",
    "   google-chrome --remote-debugging-port=9222",
    "",
    "   Windows (PowerShell):",
    '   & "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222',
    "",
    "3. そのウィンドウで X にログインし、ホームを開く。",
    "4. CDP_URL の既定は http://127.0.0.1:9222 です。",
  ].join("\n");
}

function isXHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "x.com" || host === "twitter.com" || host.endsWith(".x.com");
  } catch {
    return false;
  }
}

/**
 * Logged-in Chrome via CDP. Observes the For You timeline and, only when
 * asked, clicks 「このポストに興味がない」 through the ••• menu.
 * Does not call timeline/feedback.json or any other private X endpoint.
 */
export class ForYouSession {
  private constructor(
    private readonly browser: Browser,
    private readonly page: Page,
  ) {}

  static async connect(cdpUrl: string): Promise<ForYouSession> {
    let browser: Browser;
    try {
      browser = await chromium.connectOverCDP(cdpUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${message}\n\n${chromeLaunchHelp()}`);
    }

    const context = browser.contexts()[0];
    if (!context) {
      await browser.close();
      throw new Error(`CDP にブラウザコンテキストがありません: ${cdpUrl}`);
    }

    const pages = context.pages().filter((page) => isXHost(page.url()));
    let page =
      pages.find((candidate) => {
        try {
          return new URL(candidate.url()).pathname.startsWith("/home");
        } catch {
          return false;
        }
      }) ?? pages[0];

    if (!page) {
      page = await context.newPage();
      await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    }

    await page.bringToFront();
    return new ForYouSession(browser, page);
  }

  url(): string {
    return this.page.url();
  }

  /** Open https://x.com/home and select the For You / おすすめ tab. */
  async ensureForYou(): Promise<void> {
    if (!isXHost(this.page.url()) || !new URL(this.page.url()).pathname.startsWith("/home")) {
      await this.page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    }

    if (/\/i\/flow\/login|\/login/.test(new URL(this.page.url()).pathname)) {
      throw new Error("X がログイン画面です。この Chrome でログインしてから再実行してください。");
    }

    await this.page.waitForSelector('[role="tab"]', { timeout: 20_000 }).catch(() => {
      throw new Error(
        "ホームのタブ（おすすめ / For You）が見つかりません。ログイン済みのホームを開いてください。",
      );
    });

    const selected = await this.selectedTabName();
    if (selected && isForYouTabName(selected)) {
      await this.waitForTimeline();
      return;
    }

    if (selected && !isFollowingTabName(selected) && selected.length > 0) {
      throw new Error(
        `選択中のタブが For You ではありません（"${selected}"）。おすすめ以外では操作しません。`,
      );
    }

    const forYou = this.page.getByRole("tab", { name: /^(For you|おすすめ)/i });
    if ((await forYou.count()) === 0) {
      throw new Error("おすすめ / For You タブが見つかりません。UI 言語かセレクタが変わった可能性があります。");
    }
    await forYou.first().click();
    await this.page.waitForTimeout(800);
    const after = await this.selectedTabName();
    if (!after || !isForYouTabName(after)) {
      throw new Error(`For You タブをクリックしましたが選択を確認できません（現在: ${after ?? "なし"}）。`);
    }
    await this.waitForTimeline();
  }

  async isForYou(): Promise<boolean> {
    if (!isXHost(this.page.url())) return false;
    try {
      if (!new URL(this.page.url()).pathname.startsWith("/home")) return false;
    } catch {
      return false;
    }
    const selected = await this.selectedTabName();
    return selected != null && isForYouTabName(selected);
  }

  async observe(): Promise<PostSnapshot[]> {
    const raw = await this.page.evaluate(() => {
      const articles = [...document.querySelectorAll('[data-testid="tweet"]')].filter(
        (el) => !el.parentElement?.closest('[data-testid="tweet"]'),
      );

      const promoWords = new Set(["Ad", "Promoted", "広告", "プロモーション"]);

      return articles.map((el) => {
        const own = (node: Element | null) =>
          node != null && node.closest('[data-testid="tweet"]') === el;

        const textNodes = [...el.querySelectorAll('[data-testid="tweetText"]')].filter(own);
        const text = textNodes
          .map((node) => node.textContent ?? "")
          .join("\n")
          .trim()
          .slice(0, 4000);
        const langAttr = textNodes[0]?.getAttribute("lang") ?? "";

        const nameRoot = [...el.querySelectorAll('[data-testid="User-Name"]')].find(own) ?? null;
        const anchors = nameRoot ? [...nameRoot.querySelectorAll("a[href]")].filter(own) : [];
        let handle = "";
        let display = "";
        for (const anchor of anchors) {
          const href = anchor.getAttribute("href") ?? "";
          const match = href.match(/^\/([A-Za-z0-9_]{1,15})$/);
          if (!match) continue;
          const content = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
          if (content.startsWith("@")) {
            handle = (content.slice(1).split(" ")[0] ?? match[1]) || match[1];
          } else if (!display) {
            display = content;
            if (!handle) handle = match[1];
          }
        }

        let id = "";
        for (const time of [...el.querySelectorAll("time")].filter(own)) {
          const link = time.closest('a[href*="/status/"]');
          const href = link?.getAttribute("href") ?? "";
          const match = href.match(/\/status\/(\d+)/);
          if (match?.[1]) {
            id = match[1];
            break;
          }
        }

        const social = [...el.querySelectorAll('[data-testid="socialContext"]')]
          .filter(own)
          .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .join(" · ");

        let promo = "";
        for (const node of [...el.querySelectorAll("span")].filter(own)) {
          if (node.closest('[data-testid="tweetText"]')) continue;
          const label = (node.textContent ?? "").replace(/\s+/g, " ").trim();
          if (promoWords.has(label) && node.childElementCount === 0) {
            promo = label;
            break;
          }
        }

        const placement = [...el.querySelectorAll('[data-testid="placementTracking"]')]
          .filter(own)
          .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
          .find((label) => label.length > 0 && label.length <= 180);

        const mediaPresent = [...el.querySelectorAll(
          '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="card.wrapper"]',
        )].some(own);

        const buttonLabels = [...el.querySelectorAll('button, [role="button"]')]
          .filter(own)
          .map((node) =>
            `${node.getAttribute("aria-label") ?? ""} ${(node.textContent ?? "").trim()}`
              .replace(/\s+/g, " ")
              .trim(),
          )
          .filter(Boolean)
          .slice(0, 24);

        const recommendationReason = [promo, placement, social].filter(Boolean).join(" · ") || null;

        return {
          id,
          text,
          authorHandle: handle,
          authorDisplayName: display,
          buttonLabels,
          recommendationReason,
          mediaPresent,
          langAttr,
        };
      });
    });

    return raw.filter((post) => post.id.length > 0).map((post) => this.normalize(post));
  }

  /**
   * Open the post ••• menu and click Not interested.
   * Refuses entirely while dry-run is on, so a caller cannot click by accident.
   * Does not call timeline/feedback.json or any other private X endpoint.
   */
  async markNotInterested(
    statusId: string,
    options: { dryRun: boolean },
  ): Promise<{ ok: boolean; message: string }> {
    if (options.dryRun) {
      return { ok: false, message: "dry-run: refused to open the menu" };
    }
    if (!/^\d+$/.test(statusId)) {
      return { ok: false, message: "refusing to click without a numeric status id" };
    }
    if (!(await this.isForYou())) {
      return { ok: false, message: "not on For You; refused to open the menu" };
    }

    const article = await this.articleFor(statusId);
    if (!article) {
      return { ok: false, message: `post ${statusId} is no longer visible` };
    }

    try {
      await article.scrollIntoViewIfNeeded().catch(() => {});
      await article.hover().catch(() => {});

      const caret = await this.findCaret(article);
      if (!caret) {
        return { ok: false, message: "caret (•••) button not found" };
      }
      await caret.click({ timeout: 5_000 });

      const menu = this.page.locator('[role="menu"], [role="dialog"]').last();
      try {
        await menu.waitFor({ state: "visible", timeout: 5_000 });
      } catch {
        await this.page.keyboard.press("Escape").catch(() => {});
        return { ok: false, message: "menu did not open" };
      }

      let rows = menu.locator('[role="menuitem"]');
      if ((await rows.count()) === 0) {
        rows = menu.locator(
          '[data-testid*="notInterested" i], [data-testid*="not-interested" i], [role="button"]',
        );
      }
      const count = await rows.count();
      const items: Array<MenuItemLabel & { index: number }> = [];
      for (let index = 0; index < count; index++) {
        const row = rows.nth(index);
        const text = ((await row.innerText().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
        if (text.length > 160) continue;
        items.push({
          index,
          text,
          ariaLabel: ((await row.getAttribute("aria-label")) ?? "").trim(),
          testId: ((await row.getAttribute("data-testid")) ?? "").trim(),
        });
      }

      const picked = pickNotInterestedItem(items);
      if (!picked) {
        const seen = items.map((item) => item.text || item.ariaLabel || item.testId).slice(0, 12);
        await this.page.keyboard.press("Escape").catch(() => {});
        return {
          ok: false,
          message: `Not interested item not found. Menu: ${seen.join(" | ") || "(empty)"}`,
        };
      }

      await sleep(400 + Math.floor(Math.random() * 500));
      const target = rows.nth(picked.index);
      const liveText = ((await target.innerText().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
      const confirmed = pickNotInterestedItem([
        { text: liveText, ariaLabel: picked.ariaLabel, testId: picked.testId },
      ]);
      if (!confirmed) {
        await this.page.keyboard.press("Escape").catch(() => {});
        return { ok: false, message: `menu row changed before click (${liveText})` };
      }

      await target.click({ timeout: 5_000 });
      await sleep(400);
      await this.page.keyboard.press("Escape").catch(() => {});
      return { ok: true, message: `clicked: ${liveText || picked.ariaLabel || picked.testId}` };
    } finally {
      await this.clearPostMark(statusId);
    }
  }

  async scroll(): Promise<void> {
    const column = this.page.locator('[data-testid="primaryColumn"]');
    if ((await column.count()) > 0) {
      await column.first().hover().catch(() => {});
    }
    await this.page.mouse.wheel(0, 700 + Math.floor(Math.random() * 500));
  }

  /** Disconnect CDP. Does not quit Chrome. */
  async disconnect(): Promise<void> {
    await this.browser.close();
  }

  private normalize(post: RawPost): PostSnapshot {
    return {
      id: post.id,
      text: post.text,
      authorHandle: post.authorHandle || "(unknown)",
      authorDisplayName: post.authorDisplayName || post.authorHandle || "(unknown)",
      following: classifyFollowing(post.buttonLabels),
      recommendationReason: post.recommendationReason,
      mediaPresent: post.mediaPresent,
      language: resolveLanguage(post.langAttr, post.text),
    };
  }

  private async selectedTabName(): Promise<string | null> {
    return this.page.evaluate(() => {
      const selected = document.querySelector('[role="tab"][aria-selected="true"]');
      if (!selected) return null;
      return (selected.getAttribute("aria-label") || selected.textContent || "").replace(/\s+/g, " ").trim();
    });
  }

  private async waitForTimeline(): Promise<void> {
    await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 20_000 }).catch(() => {
      throw new Error("タイムラインにポストが見えません。おすすめが読み終わるまで待って再実行してください。");
    });
  }

  private async articleFor(statusId: string): Promise<Locator | null> {
    const marked = await this.page.evaluate((id) => {
      for (const node of document.querySelectorAll("[data-jev-post]")) {
        node.removeAttribute("data-jev-post");
      }
      const pattern = new RegExp(`/status/${id}(?!\\d)`);
      for (const article of document.querySelectorAll('[data-testid="tweet"]')) {
        const link = [...article.querySelectorAll('a[href*="/status/"]')].find((anchor) => {
          if (anchor.closest('[data-testid="tweet"]') !== article) return false;
          const href = anchor.getAttribute("href") ?? "";
          return pattern.test(href) && anchor.querySelector("time") != null;
        });
        if (link) {
          article.setAttribute("data-jev-post", id);
          return true;
        }
      }
      return false;
    }, statusId);
    if (!marked) return null;
    const article = this.page.locator(`[data-testid="tweet"][data-jev-post="${statusId}"]`).first();
    if ((await article.count()) === 0) {
      await this.clearPostMark(statusId);
      return null;
    }
    return article;
  }

  private async clearPostMark(statusId: string): Promise<void> {
    await this.page
      .evaluate((id) => {
        const node = document.querySelector(`[data-jev-post="${id}"]`);
        node?.removeAttribute("data-jev-post");
      }, statusId)
      .catch(() => {});
  }

  private async findCaret(article: Locator): Promise<Locator | null> {
    const byTestId = article.locator('[data-testid="caret"]').first();
    if ((await byTestId.count()) > 0) return byTestId;

    const exact = [
      "More",
      "More options",
      "もっと見る",
      "その他",
      "さらに表示",
    ];
    const buttons = article.locator('button, [role="button"]');
    const count = await buttons.count();
    for (let index = 0; index < count; index++) {
      const button = buttons.nth(index);
      const aria = ((await button.getAttribute("aria-label")) ?? "").trim();
      if (exact.includes(aria)) return button;
    }
    return null;
  }
}
