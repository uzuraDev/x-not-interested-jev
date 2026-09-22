# x-not-interested-jev

X（Twitter）の **For You / おすすめ** に出ているポストを読み、[Jev](https://vercel.com/ai-gateway/models/jev)（Vercel AI Gateway 経由）が「興味がない」と判断したものだけ、画面の ••• メニューから **このポストに興味がない** を押すツールです。

> **警告 / Warning**
>
> これは X の公式 API ではなく、ログイン済みブラウザの UI をクリックする自動化です。X の利用規約上グレーであり、**アカウント制限や凍結のリスク**があります。自己責任で使ってください。既定はドライランで、クリックしません。
>
> This drives the logged-in X UI. It sits in a gray area of the X Terms of Service and can lead to **account limits or suspension**. Use at your own risk. The default is dry-run and does not click.

非公式の `timeline/feedback.json` などは呼びません。操作は画面上のクリックだけです。

## 何を「興味がない」とするか

Jev への指示に固定してあります。次の **どちらかがはっきりしているときだけ** yes です。

1. 広告・販売・アフィリエイト
2. 炎上・対立を煽る投稿（政治は、それ自体が対立や炎上である場合だけ。落ち着いた政治の話は対象外）

次だけでは interested にしません。

- フォローしていないアカウントだから
- 英語だけだから
- 一般的な AI っぽい文章だから

フォロー中のアカウントは押しません。タイムライン上に **Follow / フォロー** ボタンが見えるポストだけを Jev に渡します。ボタンが無い場合はフォロー済みの可能性があるのでスキップします。

Mute（ミュート）と Block（ブロック）は実装していません。`ENABLE_MUTE` / `ENABLE_BLOCK` を true にしても警告を出して何もしません。

## 必要なもの

- Node.js 22 以上
- Vercel AI Gateway の API キー（`AI_GATEWAY_API_KEY`）。TypeSafe の直接 API は使いません
- ログイン済みの Chrome（リモートデバッグ）

モデルは `typesafe-ai/jev`、AI SDK の `experimental_evaluate` Choice（`yes` / `no`）です。配線は [cookie-clicker-jev](https://github.com/uzuraDev/cookie-clicker-jev) と同じく Gateway 経由です。

## セットアップ

```bash
npm install
cp .env.example .env
# .env に AI_GATEWAY_API_KEY を書く
```

CDP で今の Chrome に繋ぐので、Playwright 用の Chromium を別途ダウンロードする必要はありません。

## Chrome を起動して X にログイン

既に開いている Chrome にはポートが付きません。**いったん完全に終了**してから、普段のプロファイルのまま起動します。

macOS:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

Linux:

```bash
google-chrome --remote-debugging-port=9222
```

Windows (PowerShell):

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

そのウィンドウで X にログインし、ホーム（`https://x.com/home`）を開きます。接続先の既定は `http://127.0.0.1:9222` です。別のポートなら `.env` の `CDP_URL` を変えます。

終了時はこのツールが CDP を切断するだけで、Chrome 自体は閉じません。

## ドライラン（既定）

```bash
npm start
```

`DRY_RUN` を書かなくてもドライランです。次だけをします。

- Chrome に接続する
- ホームのおすすめタブでなければ、そのタブを開く（フォロー中タブからの切り替え）
- 見えているポストを読む
- フォローボタンがあるものだけ Jev に聞く
- 判定と、押すとしたら押す、をログする

••• メニューは開かず、**このポストに興味がない** は押しません。ログの `DRY-RUN` 行が「押す候補」です。

ドライランでもタイムラインはスクロールします。Jev の呼び出しには `AI_GATEWAY_API_KEY` が必要です。

## 本番にする（明示的なオプトイン）

`.env` で次のようにしたときだけクリックします。`0` や `no` では本番になりません。

```bash
DRY_RUN=false
```

最初は `MAX_ACTIONS=1` で様子を見てください。確信度が `THRESHOLD`（既定 **0.85**）未満なら押しません。

- 確率が返ってきたとき: `choice=yes` かつ `P(yes) >= THRESHOLD` のときだけ押す
- 確率が無いとき: `choice=yes` の明確な yes のときだけ押す（Jev on Gateway は通常、確率を返します）
- 分布はあるが `yes` の確率が無いとき: 押さない

クリックは •••（`data-testid="caret"` または More / もっと見る などの aria-label）を開き、メニュー項目の文言・aria-label・data-testid が **このポストに興味がない** または **Not interested** に合うものだけです。ミュート、ブロック、報告、フォロー解除は候補から外します。

操作の間隔は既定で 3〜8 秒（その範囲でランダム）です。セッションのクリック上限は `MAX_ACTIONS`（既定 20、ドライランでは「押す候補」の件数）です。

## 環境変数

| 変数 | 既定 | 意味 |
| --- | --- | --- |
| `AI_GATEWAY_API_KEY` | なし（必須） | Vercel AI Gateway のキー |
| `CDP_URL` | `http://127.0.0.1:9222` | Chrome のリモートデバッグ |
| `DRY_RUN` | `true` | `false` のときだけクリック |
| `THRESHOLD` | `0.85` | yes の確率の下限 |
| `MAX_ACTIONS` | `20` | クリック（またはドライランの候補）の上限 |
| `MAX_POSTS` | `40` | Jev に渡すポスト数の上限 |
| `MIN_DELAY_MS` | `3000` | 判定間隔の下限 |
| `MAX_DELAY_MS` | `8000` | 判定間隔の上限 |
| `ENABLE_MUTE` / `ENABLE_BLOCK` | オフ | 未実装。true でも押さない |

## Jev に渡す状態

各ポストについて次を渡します。

- 本文
- 著者のハンドルと表示名
- フォローしているか（`yes` / `no` / `unknown`）。実際に評価するのは `no` だけ
- 「なぜ表示されているか」（social context や 広告 / Promoted の表示があれば）
- 画像・動画・カードの有無
- 言語（本文ノードの `lang`。無ければ文字種からの推定）

## 手動スモーク

CI では X にログインしません。セレクタは変わり得るので、次を自分のブラウザで確認してください。

1. `DRY_RUN=true` のまま `npm start`
2. ログに `For You / おすすめ を確認しました` と出る。フォロー中タイムラインのポストを評価していない
3. 各ポストに `following=`、`lang=`、`reason=`、本文の抜粋、`jev: choice=… P(yes)=…` が出る
4. 候補には `DRY-RUN … would click` と出る。Chrome 上で ••• が開いていない
5. フォロー中アカウント（Follow ボタンが無いもの）は `skip` になっている
6. 本番を試すなら `DRY_RUN=false` と `MAX_ACTIONS=1`。押した項目が「このポストに興味がない」または “Not interested” であり、ミュートやブロックではない
7. メニューに文言が無く `Not interested item not found` と出たら、X の UI が変わっています。ログの `Menu:` に出た項目名を見て `src/labels.ts` を更新してください

`npm test` は判定・ラベル・設定の単体テストです。`npm run typecheck` は型チェックです。

## 構成

- `src/index.ts` — ループ、上限、停止
- `src/browser.ts` — CDP 接続、おすすめの監視、メニューのクリック
- `src/jev.ts` — Gateway の Choice
- `src/decision.ts` — 閾値とドライラン
- `src/labels.ts` — メニュー文言とタブ名

## 開発

```bash
npm test
npm run typecheck
```
