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
PUBLIC_APP_ORIGIN=http://localhost:5173
```

`GITHUB_PROJECT_TOKEN` は private org Project v2 を読める権限を持つサーバー用トークンです。
GitHub OAuthで認証できたユーザーはログインできます。管理者画面の権限は `ADMIN_GITHUB_LOGINS` に記載されたGitHubログインで判定します。

## Vercel Analytics

`@vercel/analytics` はアプリ側で組み込み済みです。VercelのWeb Analytics画面で対象ProjectのAnalyticsを有効化すると、デプロイ後のページビューが記録されます。

## 開発

```bash
pnpm install
pnpm db:migrate
pnpm dev
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
