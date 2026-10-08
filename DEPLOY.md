# Firebase へのデプロイ手順（ブラウザだけで行う）

PC のブラウザで行うのがおすすめです。所要時間の目安は 15〜20 分です。
Google アカウントは、1〜5 の手順ですべて同じものを使ってください。

## 1. Firebase プロジェクトを作る
1. https://console.firebase.google.com を開く
2. 「Firebase プロジェクトを作成」（または「プロジェクトを追加」）を押す
3. プロジェクト名に `sc-test-app` などを入力して「続行」
   - 名前の下に表示される **プロジェクト ID**（例 `sc-test-app-1a2b3`）を控えておく。公開 URL に使われます
4. Google アナリティクスは **オフ** にして「プロジェクトを作成」
5. 完了したら「続行」

## 2. ウェブアプリを登録して設定値を取得する
1. プロジェクトのトップ画面で **`</>`（ウェブ）** アイコンを押す
2. アプリのニックネームに `sc-test-app` と入力
   - 「Firebase Hosting も設定する」のチェックは **不要** です
3. 「アプリを登録」を押す
4. 次のような `firebaseConfig` が表示されるので、`{ }` の中身をコピーして Claude に送る
   ```js
   const firebaseConfig = {
     apiKey: "AIza....",
     authDomain: "sc-test-app-xxxx.firebaseapp.com",
     projectId: "sc-test-app-xxxx",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
   - この値はブラウザに公開される前提のもので、秘密情報ではありません
   - Claude が `public/firebase-config.js` に書き込んで GitHub に push します
5. 「コンソールに進む」を押す

## 3. 匿名ログインを有効にする
回答記録を「この端末の利用者」ごとに分けて保存するために使います。
1. https://console.firebase.google.com/project/sc-test-app-b6200my37/authentication/providers を開く
2. 「始める」ボタンが出たら押す
3. 「ログイン方法（Sign-in method）」タブで「匿名（Anonymous）」を押す
   - 一覧がなく「新しいプロバイダを追加」ボタンだけの場合は、それを押すと「匿名」が出ます
4. 「有効にする」をオンにして「保存」

## 4. Firestore（データベース）を作る
1. https://console.firebase.google.com/project/sc-test-app-b6200my37/firestore を開く
2. 「データベースを作成」を押す
3. エディションを聞かれたら **Standard** を選んで「次へ」
4. データベース ID は **(default)** のまま、ロケーションは **asia-northeast1（Tokyo）** を選んで「次へ」
5. 「本番環境モードで開始する」を選んで「作成」
   - アクセスルールは手順 5 のデプロイで自動的に設定されます

## 5. Cloud Shell からデプロイする
Cloud Shell はブラウザ上で使えるコマンド画面です（無料、インストール不要）。
Firebase のコマンド（firebase）が最初から入っています。

1. https://shell.cloud.google.com を開く（初回は利用規約に同意）
2. 画面下の黒いターミナルに、次の行を 1 行ずつ貼り付けて Enter

   ```sh
   git clone https://github.com/GeckoSoldier/Sc-test-App.git
   cd Sc-test-App
   firebase login --no-localhost
   ```
   - `firebase login` で表示される URL を開いて Google アカウントでログインし、
     表示されたコードをターミナルに貼り付けて Enter
   - 「Allow Firebase to collect CLI usage...?」と聞かれたら `n` で Enter
   - `firebase: command not found` と出た場合は、先に `npm install -g firebase-tools` を実行

3. デプロイ先のプロジェクト（`sc-test-app-b6200my37`）はリポジトリの `.firebaserc` に設定済みなので、選ぶ操作は不要です

4. デプロイする
   ```sh
   firebase deploy
   ```
   - 最後に `Deploy complete!` と `Hosting URL: https://sc-test-app-b6200my37.web.app` が出れば成功

## 6. スマホで開く
1. スマホのブラウザで `https://sc-test-app-b6200my37.web.app` を開く
2. ホームの一番下に「保存先：Firebase に同期済み」と出ていれば、記録が Firestore に保存されています
3. ホーム画面に追加しておくと、アプリのように開けます
   - iPhone（Safari）：共有ボタン →「ホーム画面に追加」
   - Android（Chrome）：︙メニュー →「ホーム画面に追加」

## アプリを更新したとき
Claude が GitHub に変更を push したあと、Cloud Shell で次を実行します。

```sh
cd ~/Sc-test-App
git pull
firebase deploy
```

## うまくいかないとき
- 「保存先：Firebase に接続できないため端末内に保存中」と出る
  → 手順 3（匿名ログイン）と手順 4（Firestore 作成）が済んでいるか確認し、`firebase deploy` をもう一度実行
- 記録はスマホとPCで別々になります（端末ごとに匿名ユーザーが作られるため）
