# Issue #8 支払い状態と支払い予定日の管理 — 実装プラン

## 1. 目的

月次精算ごとに、支払い状態と支払い予定日を管理できるようにする。

管理者は、承認済みの月次精算について「未処理」「支払い済み」を確認・更新できる。稼働者は、自分に関係する支払い予定日と支払い済み状況を確認できる。

関連 Issue: [#8 支払い状態と支払い予定日を管理できるようにする](https://github.com/techguide-jp/techguide-jp/issues/8)（統合元: #5）

## 2. 設計方針

- 支払い情報は `month` × `assignee_login` 単位で `monthly_payments` テーブルに保存する。
- 支払い状態は「未処理」「支払い済み」の 2 値のみ。多段階ステータスは扱わない。
- 支払い状態と支払い予定日は独立した項目として扱う。
- 支払い予定日が個別未設定の場合は、対象月の翌月 14 日をデフォルト表示する（レコードが無くても表示できる）。
- 支払い状態・支払い予定日の更新は管理者のみ。閲覧は管理者と本人のみ。
- 支払い済み登録時に、登録者・管理メモ・更新履歴・監査ログは保存しない（Issue の対象外要件）。
- 振込先情報（#12）の登録・更新フローは変更しない。
- 月次申請状態・月次承認状態・振込先登録状態・支払い状態は、画面上で区別して表示する。

## 3. スコープ

### 3.1 対象

- 月次精算単位の支払い状態保存（未処理 / 支払い済み）。
- 支払い予定日の保存・表示（個別未設定時は翌月 14 日）。
- 管理者による支払い済み登録（支払日を保存）。
- 管理者による支払い済み登録の取り消し（未処理に戻す）。
- 稼働者向けの支払い予定日・支払い済み状況表示。
- 月次一覧・月次詳細画面への表示追加。
- 必要な DB migration、テスト、ドキュメント更新。

### 3.2 対象外

- 銀行振込や決済代行サービスへの実送金処理。
- 振込先情報の登録・変更フロー（#12 実装済み）。
- 振込先情報の確認済み・要修正などの手動ステータス管理。
- 税務・会計システムへの自動連携。
- 支払い状態の多段階管理。
- 支払い状態による一覧フィルタ。
- 支払い状態の更新履歴・監査ログ。
- 支払い済み登録時の管理メモ保存。

## 4. データモデル

`monthly_payments` テーブル（`src/lib/server/db/schema.ts`）。

| カラム                      | 型                                                | 説明                                                        |
| --------------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| `month`                     | text                                              | `YYYY-MM`。PK の一部。正規表現 check 付き。                 |
| `assignee_login`            | text                                              | 稼働者ログイン。PK の一部。                                 |
| `status`                    | enum `monthly_payment_status` (`unpaid` / `paid`) | 支払い状態。既定 `unpaid`。                                 |
| `scheduled_date`            | date (null 可)                                    | 個別の支払い予定日。null ならデフォルト（翌月 14 日）表示。 |
| `paid_on`                   | date (null 可)                                    | 支払い済み時の支払日。                                      |
| `created_at` / `updated_at` | timestamptz                                       | 作成・更新時刻。                                            |

- PK: (`month`, `assignee_login`)
- check `monthly_payments_month_chk`: `month` が `YYYY-MM` 形式。
- check `monthly_payments_paid_chk`: `status='paid'` なら `paid_on IS NOT NULL`、`status='unpaid'` なら `paid_on IS NULL`。
- 登録者・監査情報カラムは持たない（Issue 要件）。

migration: `migrations/0006_add_monthly_payments.sql`。

## 5. レイヤー構成

- `src/lib/server/payments/paymentTypes.ts` — `PaymentStatus`, `MonthlyPaymentView`, ラベル定義。
- `src/lib/server/payments/paymentRepository.ts` — DB アクセス（取得・upsert）。支払い済み / 未処理 / 予定日更新をそれぞれ独立した upsert で表現し、他項目を保持する。
- `src/lib/server/payments/paymentService.ts` — ビジネスロジック。
  - `defaultPaymentDueDate(month)` — 翌月 14 日。
  - `getPaymentForViewer(month, assignee, viewer)` — 本人 / 管理者のみ。権限なしは null。
  - `listPaymentViewsForMonth(month, assignees)` — 月次一覧向け。
  - `markSettlementPaid` / `revertSettlementPayment` / `updatePaymentScheduledDate` — 管理者操作。日付バリデーション付き。

## 6. UI

- 月次一覧 `/settlements/[month]`（管理者のみ）: 「支払い予定日」「支払い状態」列を追加。既存の申請 / 承認状態列は「承認状態」に改名し、支払い状態と混同しないようにした。表示のみ（更新は詳細画面）。
- 月次詳細 `/settlements/[month]/[assignee]`（本人 / 管理者）: `SettlementPaymentPanel` を追加。
  - 全員: 支払い状態・支払日・支払い予定日（デフォルトか個別かを明示）を表示。
  - 管理者のみ: 支払い済み登録（支払日入力）、取り消し、支払い予定日の保存フォームを表示。

## 7. 権限

| 操作                     | 実装                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------- |
| 支払い状態・予定日の閲覧 | `getPaymentForViewer` が管理者 / 本人のみ許可。月次詳細 load は `requireSelfOrAdmin`。 |
| 支払い状態・予定日の更新 | 詳細画面の各 action で `requireAdmin`。                                                |

## 8. テスト

- `tests/paymentService.test.ts` — デフォルト予定日、日付バリデーション、閲覧権限（本人 / 管理者 / 他人 / 未ログイン）、支払い済み / 取り消し / 予定日更新。
- `tests/dbConstraints.integration.test.ts` — `paid_chk` / `month_chk` 制約（`RUN_DB_INTEGRATION=1` 時のみ）。
- 既存の e2e リセット・DB リセットに `monthly_payments` を追加。

## 9. 受け入れ条件との対応

- 支払い状態を未処理 / 支払い済みで確認・更新できる → 一覧表示 + 詳細の管理者操作。
- 支払い予定日を確認できる / 個別未設定なら翌月 14 日 → `defaultPaymentDueDate` + ビュー。
- 支払い済み登録で状態が支払い済みになり支払日を保存 → `markSettlementPaid`。
- 取り消しで未処理に戻る → `revertSettlementPayment`。
- 稼働者が自分の支払い予定日と支払い済み状況を確認できる → 詳細画面パネル（本人閲覧可）。
- 他者の支払い情報を閲覧・更新できない → `getPaymentForViewer` / `requireAdmin`。
- 各状態を区別して表示 → 一覧の列分離・ヘッダ改名。
- 既存の申請・承認フロー、#12 の振込先フローを変更しない。
- 一覧フィルタ・更新履歴・監査ログは追加しない。
