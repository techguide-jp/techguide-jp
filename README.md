# techguide-jp

Assignee別の月次稼働精算を管理する内部向けSvelteKitアプリです。

## 機能

- GitHub OAuthによるログイン
- GitHub Project v2 `techguide-jp/projects/7` からのIssue・報酬情報取得
- Issueごとの稼働開始/終了ログ
- 複数Issueの同時稼働記録
- 後追い追加、時刻修正、除外申請
- assignee別の月次精算表示
- 管理者による月次承認スナップショット保存
- 月次精算ごとの支払い状態（未処理／支払い済み）・支払い予定日の管理
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
# 任意: OAuth callback originを固定したい場合のみ
PUBLIC_APP_ORIGIN=https://techguide-jp.vercel.app
```

`GITHUB_PROJECT_TOKEN` は private org Project v2 を読める権限を持つサーバー用トークンです。
GitHub OAuthで認証できたユーザーはログインできます。管理者画面の権限は `ADMIN_GITHUB_LOGINS` に記載されたGitHubログインで判定します。
GitHub OAuth AppのAuthorization callback URLには、本番URLの `/auth/github/callback` を登録してください。
`PUBLIC_APP_ORIGIN` が未設定の場合はリクエストURLからOAuth callback originを自動判定します。誤って localhost が設定された本番環境では、実際のリクエストURLを優先します。

## Vercel Analytics

`@vercel/analytics` はアプリ側で組み込み済みです。VercelのWeb Analytics画面で対象ProjectのAnalyticsを有効化すると、デプロイ後のページビューが記録されます。

## 開発

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

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
