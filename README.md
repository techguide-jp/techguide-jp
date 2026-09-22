# techguide-jp

Assignee別の月次稼働精算を管理する内部向けSvelteKitアプリです。

## 機能

- GitHub OAuthによるログイン
- GitHub Project v2 `techguide-jp/projects/7` からのIssue・報酬情報取得
- Issueごとの稼働開始/終了ログ
- 複数Issueの同時稼働記録
- 後追い追加、時刻修正、除外申請
- assignee別の月次精算表示
- 完了報告月に固定報酬、実稼働月にハイブリッド時間報酬を帰属
- 月次承認後に対象化した固定報酬の追加支払い管理
- 月次申請時の運営コメント・本人限定の振り返り（承認前まで編集可能）
- プロフィールと共通の稼働・参画希望（既存値を初期表示、精算なしでも随時更新）
- 管理者による月次承認スナップショット保存
- 月次精算ごとの支払い状態（未処理／支払い済み）・支払い予定日の管理
- 支払い済み登録時の作業者向け任意コメント（最大2,000文字、管理者と本人のみ閲覧、取消時に消去）
- Projectフィールドのヘルスチェック
- 管理者向け運用ヘルス、監査ログ、期限切れセッション削除
- Vercel Web Analyticsによるページビュー計測

## 必要なGitHub Projectフィールド

Project 7 `外注管理` は全PJの外注精算を扱います。以下のフィールドが必要です。

- `Status` single select
- `報酬方式` single select: `固定`, `ハイブリッド`
- `固定報酬額（円・税抜）` number
- `追加精算上限（円・税抜）` number
- `時間単価（円・税抜）` number

## 環境変数

```env
DATABASE_URL=postgresql://...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_PROJECT_TOKEN=github_pat_...
SESSION_SECRET=change-me
ADMIN_GITHUB_LOGINS=tashua314
CRON_SECRET=change-me
SETTLEMENT_RULE_V2_ENABLED=false
# 任意: OAuth callback originを固定したい場合のみ
PUBLIC_APP_ORIGIN=https://techguide-jp.vercel.app
```

`GITHUB_PROJECT_TOKEN` は private org Project v2 を読める権限を持つサーバー用トークンです。
GitHub OAuthで認証できたユーザーはログインできます。管理者画面の権限は `ADMIN_GITHUB_LOGINS` に記載されたGitHubログインで判定します。
GitHub OAuth AppのAuthorization callback URLには、本番URLの `/auth/github/callback` を登録してください。
`PUBLIC_APP_ORIGIN` が未設定の場合はリクエストURLからOAuth callback originを自動判定します。誤って localhost が設定された本番環境では、実際のリクエストURLを優先します。

`SETTLEMENT_RULE_V2_ENABLED` はmigrationと環境変数の準備後に `true` へ切り替えます。Vercel Cronは毎月1日00:00 UTC（同日09:00 JST）に `/api/cron/settlement-maintenance` を呼び、`CRON_SECRET` のBearer認証で保護します。完了状態を確認してから、前月の精算対象がある未申請者へリマインドを送ります。月初以外の呼び出しでは更新・通知を行いません。日常の完了状態の反映は、精算画面の表示時や申請・承認時にも行います。

## Vercel Analytics

`@vercel/analytics` はアプリ側で組み込み済みです。VercelのWeb Analytics画面で対象ProjectのAnalyticsを有効化すると、デプロイ後のページビューが記録されます。

## 開発

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

### ローカルで別ユーザーの画面・操作を確認する

管理者でログインし、ナビゲーションの「ユーザー切替」から登録ユーザーを選んで「このユーザーで確認する」を押します。対象者のGitHubログインは不要で、本人の権限で稼働・プロフィール編集・月次申請を試せます。画面上部の「管理者に戻る」で元の管理者へ復帰できます。

`pnpm dev`、ループバックのURLとDB接続、`EMAIL_DELIVERY_MODE=preview`（未指定時の既定値）の組み合わせでのみ使えます。本番ビルド・Vercel・リモートDB・メール実送信モードでは無効です。`E2E_TEST_MODE`を有効にする必要はなく、通常のGitHub Project情報と現在の精算ルールを使います。

申請や編集の結果はローカルDBへ保存され、メールはプレビューへ保存します。擬似ログイン中はGitHub Projectの更新・再同期を行いません。切り替えは同じブラウザーの全タブに適用され、有効期間は1時間です。元の管理者セッションが終了した場合も無効になります。

## 本番DB migration

mainブランチへのpush時、GitHub Actionsの `verify` が成功したあとに `migrate-production-database` job が実行され、Drizzle migrationを本番DBへ反映します。

GitHub Actionsの `production` environment secret に `PRODUCTION_DATABASE_URL` を登録してください。値は本番Neon Postgresの接続文字列です。

```env
PRODUCTION_DATABASE_URL=postgresql://...
```

VercelのGit連携デプロイ自体はこのworkflowからは制御していません。破壊的なDB変更は後方互換を保って段階的に反映するか、Vercel deployもGitHub Actions管理に切り替えて migration 後に実行してください。

ローカルから緊急で手動反映する場合は、同じ接続文字列を `DATABASE_URL` として渡して実行します。

```bash
DATABASE_URL="postgresql://..." pnpm db:migrate
```

## 本番DBのdumpとローカルへのrestore

love-matchingと同じコマンド形式で、本番DBのdumpを取得してローカルDBに復元できます。
Node.js 22.9以降と、`pg_dump`・`pg_restore`・`psql` をPATHに用意してください。PostgreSQL CLIは接続先サーバー以上のメジャーバージョンを使い、復元先も本番と同じメジャーバージョンに揃えます。

`.env.production` に本番のdirect connection URLを設定します。Neonでは `-pooler` を含まない接続文字列を使います。

```env
PRODUCTION_MIGRATION_DATABASE_URL=postgresql://user:password@direct-host/db?sslmode=require
```

復元先は `.env` の `DATABASE_URL` です。

```env
DATABASE_URL=postgresql://user:password@localhost:5434/techguide-jp
```

```bash
# 本番DBをcustom形式で .db-dumps/techguide-jp-prod-<UTC日時>.dump に保存
pnpm db:dump:prod

# .db-dumps/ 内で更新日時が最新のdumpをローカルDBに復元
pnpm db:restore:local

# 復元するdumpを指定
pnpm db:restore:local -- .db-dumps/techguide-jp-prod-2026-09-22T08-30-45-123Z.dump
```

`db:dump:prod` は `.env.production` の `PRODUCTION_MIGRATION_DATABASE_URL` だけを読みます。アプリ用の `DATABASE_URL` やシェルの環境変数にはフォールバックしません。dump作成後は `pg_restore --list` でarchive形式を確認し、失敗したdumpは削除します。`.db-dumps/` はGit管理対象外で、ディレクトリは700、ファイルは600の権限で保存します。

**`db:restore:local` は対象のローカルDBへの接続を切断し、DBを削除・再作成して全置換します。** 開発サーバーを停止し、残したいローカルデータがある場合は先に退避してください。dumpをarchiveとして読み出せることを確認してから再作成します。復元先は `localhost`・`127.0.0.1`・`[::1]` のみ許可し、テストDBとsystem DBは拒否します。接続ユーザーにはDBの削除・作成権限が必要です。

両コマンドとも接続先を上書きするURLパラメーター（`host`・`hostaddr`・`dbname`・`service` など）を拒否し、シェルの `PG*` 設定も引き継ぎません。許可するURLパラメーターは `sslmode`・`sslrootcert`・`sslcert`・`sslkey`・`channel_binding`・`connect_timeout`・`application_name` です。

復元後のmigrationは自動実行しません。必要なら `pnpm db:migrate` を実行してください。振込先情報などの暗号化データを読み出すには、dump取得元と同じ `PAYOUT_ACCOUNT_ENCRYPTION_KEY` が必要です。ローカルのメール送信は `.env` の `EMAIL_DELIVERY_MODE=preview` を使います。

## 検証

```bash
pnpm format:check
pnpm check
pnpm lint
pnpm test
pnpm build
```

DB制約テストとE2Eは実DBを使います。テスト用DBへ migration を適用してから実行します。

```bash
pnpm db:migrate
RUN_DB_INTEGRATION=1 pnpm test:db
E2E_TEST_MODE=1 ADMIN_GITHUB_LOGINS=tashua314 pnpm e2e
```
