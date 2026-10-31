# SC 演習アプリ（午前Ⅱ・午後）

スマホのブラウザで使う、情報処理安全確保支援士 午前Ⅱ・午後の演習アプリです。
ビルド不要の静的サイト（HTML / CSS / JavaScript）で、Firebase Hosting に置いて使います。

## できること
- 問題文と選択肢（ア〜エ）を表示し、ボタンを押して回答
- その場で正誤を表示し、回答記録を保存
- 正解率・回答数・平均解答時間、問題ごとの最新の正誤（○×）を表示
- 演習開始からの経過時間と、問題ごとの解答時間を計測
- 解く回を選択（令和7年度秋期／令和7年度春期／令和6年度秋期）、または3回分75問をまとめて演習
- 全問（順番／ランダム）、間違えた問題だけ、未回答だけ、を選んで演習
- 午後：ホーム上部で「午後」に切り替え、1問ずつ演習。問題文と設問をタブで行き来し、設問ごとに答えを書いてから解答例・採点講評を表示して ○△× で自己採点（1問75分の目安タイマー付き）

## ファイル構成
- `public/index.html` 画面
- `public/app.js` 午前Ⅱの演習ロジック（タイマー、正誤判定、集計）と午前Ⅱ／午後の切り替え
- `public/pm.js` 午後の演習ロジック（記述・解答例の表示・自己採点）
- `public/util.js` 共通の小さな関数
- `public/storage.js` 回答記録の保存（端末内 localStorage ＋ Firestore）
- `public/firebase-config.js` Firebase の設定値（未設定なら端末内のみに保存）
- `public/data/r07a_sc_am2.json` 問題データ（令和7年度秋期 午前Ⅱ 25問）
- `public/data/r07h_sc_am2.json` 問題データ（令和7年度春期 午前Ⅱ 25問）
- `public/data/r06a_sc_am2.json` 問題データ（令和6年度秋期 午前Ⅱ 25問）
- `public/data/r07a_sc_pm.json` / `r07h_sc_pm.json` / `r06a_sc_pm.json` 問題データ（令和7年度秋期・春期、令和6年度秋期 午後 各4問）。図は `public/data/img/`
- `firebase.json` / `firestore.rules` Firebase Hosting と Firestore の設定

## 手元で試す
```
cd public
python3 -m http.server 8000
```
http://localhost:8000 を開く（同じ Wi-Fi のスマホからは PC の IP アドレス:8000）。

## Firebase に公開する
ブラウザだけで行う詳しい手順は [DEPLOY.md](DEPLOY.md) を見てください。

1. Firebase コンソールでプロジェクトを作り、ウェブアプリを追加して表示された設定値を `public/firebase-config.js` に貼る
2. Authentication で「匿名」ログインを有効にする
3. Firestore Database を作成する
4. `firebase use --add` でプロジェクトを選び、`firebase deploy` で Hosting と Firestore ルールを公開

回答記録は Firestore の `users/{匿名ユーザーID}/attempts/{記録ID}` に保存されます。
1件の記録は `questionNo`, `chosen`, `answer`, `correct`, `timeMs`（解答時間ミリ秒）, `answeredAt` を持ちます。

## 問題を追加する
`public/data/` に同じ形の JSON を追加します。各問題は `no`, `text`, `choices`（ア〜エ）, `answer`、図表がある場合は `figure`（HTML）を持ちます。
ファイル名（拡張子なし）を試験 ID として `public/app.js` の `EXAMS` に1行追加すると、回の選択と「まとめて解く」に加わります。

午後は `public/data/<試験ID>.json`（例 `r07a_sc_pm.json`）に置き、`public/pm.js` の `PM_EXAMS` に1行追加します。各問題は次の形です。
- `no`, `title`（テーマ）, `body`（問題文の HTML。図は `data/img/` の画像を `<img>` で参照。省略すると `pages` を添えて「問題冊子を見て解く」案内を表示）
- `items`：設問の配列。各設問は `id`（例 `1-2`）, `label`（例 `設問1 (2)`）, `prompt`（HTML）, 任意で `limit`（字数制限）, `answers`（解答例。2つ目以降は別解として表示）, 任意で `note`
- 任意で `commentary`（採点講評）

午後の記録は Firestore の `users/{匿名ユーザーID}/pmAttempts/{記録ID}` に、設問ごとに `itemId`, `grade`（ok / partial / ng）, `response`（書いた答え、500字まで）, `timeMs`, `answeredAt` を保存します。

## セキュリティ
- Firestore は本人（匿名ログインのユーザー）の記録だけ読み書きでき、保存できる項目・型・値の範囲もルールで制限（`firestore.rules`）。記録の書き換えは不可
- 端末内や Firestore から読み込んだ記録も、アプリ側で形をチェックしてから使う
- 画面への表示は自前の問題データ以外 `textContent` で行い、HTML として解釈させない
- Content-Security-Policy などのセキュリティヘッダーを `firebase.json` で付与（読み込めるスクリプトは自サイトと Firebase SDK のみ）
- 公開は GitHub Pages（鍵不要、`.github/workflows/github-pages.yml`）または Hosting 公開権限だけの専用アカウント（`firebase-deploy.yml`）で行い、どちらも手動実行のみ
