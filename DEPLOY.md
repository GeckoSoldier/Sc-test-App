# Firebase へのデプロイ手順（ブラウザだけで行う）

PC のブラウザで行うのがおすすめです。所要時間の目安は 20 分ほどです。
Google アカウントは、すべての手順で同じものを使ってください。

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

### 4-1. アクセスルールを設定する
「本人の記録だけ読み書きできる」「決まった形のデータしか保存できない」ようにするルールです。
1. https://console.firebase.google.com/project/sc-test-app-b6200my37/firestore/rules を開く
2. 入力欄の中身をすべて消し、下の枠の内容を **そのまま全部** 貼り付ける（リポジトリの `firestore.rules` と同じ内容です）
3. 「公開」を押す

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 回答記録：本人（匿名ログインのユーザー）だけが読み書きできる。
    // 書き込める項目・型・値の範囲を限定し、想定外のデータを保存させない。
    match /users/{uid}/attempts/{attemptId} {
      allow read, delete: if isOwner(uid);
      allow create: if isOwner(uid)
        && attemptId.matches('^[0-9]{13}-[a-z0-9]{6}$')
        && isValidAttempt(request.resource.data, attemptId);
      // 記録は後から書き換えない
      allow update: if false;
    }

    // それ以外のパスはすべて拒否
    match /{document=**} {
      allow read, write: if false;
    }

    function isOwner(uid) {
      return request.auth != null && request.auth.uid == uid;
    }

    function isChoice(v) {
      return v is string && v in ['ア', 'イ', 'ウ', 'エ'];
    }

    function isValidAttempt(d, attemptId) {
      return d.keys().hasOnly(['id', 'examId', 'questionNo', 'chosen', 'answer', 'correct', 'timeMs', 'answeredAt'])
        && d.keys().hasAll(['id', 'examId', 'questionNo', 'chosen', 'answer', 'correct', 'timeMs', 'answeredAt'])
        && d.id == attemptId
        && d.examId is string && d.examId.matches('^[a-z0-9_]{1,40}$')
        && d.questionNo is int && d.questionNo >= 1 && d.questionNo <= 200
        && isChoice(d.chosen) && isChoice(d.answer)
        && d.correct is bool && d.correct == (d.chosen == d.answer)
        && d.timeMs is int && d.timeMs >= 0 && d.timeMs <= 86400000
        && d.answeredAt is int && d.answeredAt > 0;
    }
  }
}
```

## 5. GitHub からデプロイする（ブラウザ操作だけ）
GitHub の Actions 画面のボタンを押したときだけ、Firebase Hosting（アプリの公開）にデプロイします。

**安全のための設計**
- デプロイ用には「Hosting の公開だけ」ができる専用アカウントを作ります。Firestore のデータ、ログイン設定、ルール、課金などには一切触れられません。
- デプロイは自動では動きません。GitHub に入った変更を確認してから、森さんがボタンを押したときだけ公開されます。Claude が GitHub に push しても、それだけでは公開されません。
- 鍵は GitHub の Secrets に暗号化して保存され、画面やログには表示されません。

### 5-1. デプロイ専用のアカウントを作る（Google Cloud コンソール）
1. https://console.cloud.google.com/iam-admin/serviceaccounts/create?project=sc-test-app-b6200my37 を開く
2. 「サービス アカウント名」に `github-hosting-deploy` と入力して「作成して続行」
3. 「ロールを選択」で検索欄に「Firebase Hosting 管理者」と入力して選ぶ（英語表示なら「Firebase Hosting Admin」）
   - **これ以外のロールは追加しないでください**
4. 「続行」→「完了」

### 5-2. 鍵をダウンロードする
1. 一覧に出た `github-hosting-deploy@...` を押す
2. 上の「キー」タブ →「鍵を追加」→「新しい鍵を作成」→「JSON」→「作成」
3. JSON ファイルがダウンロードされる
   - **このファイルは秘密情報です。** Claude やチャットには送らず、次の 5-3 で GitHub に登録したら削除してください

### 5-3. 鍵を GitHub に登録する
1. https://github.com/GeckoSoldier/Sc-test-App/settings/secrets/actions/new を開く
2. Name に `FIREBASE_SERVICE_ACCOUNT` と入力
3. Secret に、ダウンロードした JSON ファイルをメモ帳などで開いて **中身を全部** 貼り付ける
4. 「Add secret」を押し、ダウンロードした JSON ファイルを削除する

### 5-4. デプロイを実行する
1. https://github.com/GeckoSoldier/Sc-test-App/actions/workflows/firebase-deploy.yml を開く
2. 右側の「Run workflow」→ 緑の「Run workflow」を押す
3. 1〜2 分待って、一覧の一番上に緑のチェック ✓ が付けば成功
   - 赤い × の場合は、その行を開いて表示されたエラーを Claude に送ってください

### 鍵が漏れたかもしれないとき
5-2 の「キー」タブで、その鍵を削除すればすぐに使えなくなります。新しい鍵を作って 5-3 をやり直してください。

## 6. スマホで開く
1. スマホのブラウザで `https://sc-test-app-b6200my37.web.app` を開く
2. ホームの一番下に「保存先：Firebase に同期済み」と出ていれば、記録が Firestore に保存されています
3. ホーム画面に追加しておくと、アプリのように開けます
   - iPhone（Safari）：共有ボタン →「ホーム画面に追加」
   - Android（Chrome）：︙メニュー →「ホーム画面に追加」

## アプリを更新したとき
Claude が GitHub に push したら、変更内容を確認してから手順 5-4 のボタンでデプロイします。
`firestore.rules` が変わったときは、手順 4-1 でルールを貼り直してください。

## さらに安全にする（任意）
公開されている API キー（`firebase-config.js` の apiKey）を、このアプリのサイトからしか使えないように制限します。
1. https://console.cloud.google.com/apis/credentials?project=sc-test-app-b6200my37 を開く
2. 「API キー」の一覧にある `Browser key (auto created by Firebase)` を押す
3. 「アプリケーションの制限」で「ウェブサイト」を選び、次の 2 つを追加して「保存」
   - `https://sc-test-app-b6200my37.web.app/*`
   - `https://sc-test-app-b6200my37.firebaseapp.com/*`

## うまくいかないとき
- 「保存先：Firebase に接続できないため端末内に保存中」と出る
  → 手順 3（匿名ログイン）、手順 4 と 4-1（Firestore とルール）が済んでいるか確認する
- 記録はスマホとPCで別々になります（端末ごとに匿名ユーザーが作られるため）
