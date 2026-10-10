# SC午前Ⅱ 演習アプリ

スマホのブラウザで使う、情報処理安全確保支援士 午前Ⅱの演習アプリです。
ビルド不要の静的サイト（HTML / CSS / JavaScript）で、Firebase Hosting に置いて使います。

## できること
- 問題文と選択肢（ア〜エ）を表示し、ボタンを押して回答
- その場で正誤を表示し、回答記録を保存
- 正解率・回答数・平均解答時間、問題ごとの最新の正誤（○×）を表示
- 演習開始からの経過時間と、問題ごとの解答時間を計測
- 全問（順番／ランダム）、間違えた問題だけ、未回答だけ、を選んで演習

## ファイル構成
- `public/index.html` 画面
- `public/app.js` 演習ロジック（タイマー、正誤判定、集計）
- `public/storage.js` 回答記録の保存（端末内 localStorage ＋ Firestore）
- `public/firebase-config.js` Firebase の設定値（未設定なら端末内のみに保存）
- `public/data/r07a_sc_am2.json` 問題データ（令和7年度秋期 午前Ⅱ 25問）
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

## セキュリティ
- Firestore は本人（匿名ログインのユーザー）の記録だけ読み書きでき、保存できる項目・型・値の範囲もルールで制限（`firestore.rules`）。記録の書き換えは不可
- 端末内や Firestore から読み込んだ記録も、アプリ側で形をチェックしてから使う
- 画面への表示は自前の問題データ以外 `textContent` で行い、HTML として解釈させない
- Content-Security-Policy などのセキュリティヘッダーを `firebase.json` で付与（読み込めるスクリプトは自サイトと Firebase SDK のみ）
- 公開は GitHub Pages（鍵不要、`.github/workflows/github-pages.yml`）または Hosting 公開権限だけの専用アカウント（`firebase-deploy.yml`）で行い、どちらも手動実行のみ
