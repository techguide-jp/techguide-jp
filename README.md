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

## 必要なGitHub Projectフィールド

Project 7 `akademy_fes 外注管理` に以下のフィールドが必要です。

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
ALLOWED_GITHUB_LOGINS=Hiro3737,koideshogo,tashua314
ADMIN_GITHUB_LOGINS=Hiro3737,yuta
PUBLIC_APP_ORIGIN=http://localhost:5173
```

`GITHUB_PROJECT_TOKEN` は private org Project v2 を読める権限を持つサーバー用トークンです。
`ALLOWED_GITHUB_LOGINS` を設定すると、記載されたGitHubログインと管理者だけがログインできます。

## 開発

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

## 検証

```bash
pnpm check
pnpm lint
pnpm test
```
