# メール通知の運用

## GitHub メール同期

OAuth は `read:user user:email` を要求し、本人の認証済みプライマリメールだけを保存します。既存利用者はリリース後に一度ログアウトし、GitHub で再ログインしてください。アクセストークンは保存しません。

## ローカル確認

既定の `EMAIL_DELIVERY_MODE=preview` では Resend と配送履歴 DB を使わず、`.local/email-previews` に `metadata.json`、`message.txt`、`message.html` を保存します。管理者は `/admin/email-previews` で確認できます。

ローカルまたは Vercel Preview から実送信する場合は `EMAIL_DELIVERY_MODE=resend` を設定し、`EMAIL_RECIPIENT_OVERRIDE` に自分の確認用アドレスを必ず設定します。本番とは別の `RESEND_API_KEY` を使用してください。Vercel Preview では同期済みの実利用者アドレスは使用しません。

## 本番リリース確認

- Resend で送信ドメインの SPF と DKIM が検証済みである
- `RESEND_API_KEY`、検証済みドメインの `EMAIL_FROM`、必要なら `EMAIL_REPLY_TO` が設定済みである
- `PUBLIC_APP_ORIGIN` が本番 URL である
- `ADMIN_GITHUB_LOGINS` の全員が再ログインし、通知先を同期済みである
- Production は `EMAIL_DELIVERY_MODE=resend` である。Preview で `resend` を使う場合は `EMAIL_RECIPIENT_OVERRIDE` が設定済みである
- migration 適用後、管理画面の「メール通知」と「Project確認」で設定・配送状態を確認する

`unknown` は送信済みか断定できない状態です。24時間を超えたものは Resend Dashboard で確認してから再送を判断し、新しい冪等キーで無条件に送信しないでください。
