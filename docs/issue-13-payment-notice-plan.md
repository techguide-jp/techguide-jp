# Issue #13 作業者向け支払い通知書 — 実装プラン

## 1. 目的

作業者が月次精算の内容を「支払い通知書」として確認し、ブラウザ印刷 / PDF 保存できるようにする。

管理者承認済みの月次精算スナップショットと、承認時点で固定した通知書用情報（作業者宛先・支払い予定日）を元に、作業者本人・管理者向けの通知書表示と印刷向けレイアウトを追加する。

関連 Issue: [#13 作業者向け支払い通知書を作成・表示できるようにする](https://github.com/techguide-jp/techguide-jp/issues/13)

## 2. 前提整理と既存設計との関係

- `monthly_settlement_snapshots`（`schema.ts:199-217`）に承認済み精算スナップショット・承認者・承認日時が保存済み。明細・稼働ログ・totals は `snapshot` jsonb 内（`settlementSnapshot.ts` の `VersionedSettlementSnapshot`）。
- 振込先情報（#12）は `worker_payout_accounts`（`schema.ts:72-86`）に AES-256-GCM で暗号化保存。`recipientName`/`postalCode`/`address` は暗号化 payload 内（平文カラムなし）。
- 支払い予定日（#8）は `monthly_payments.scheduled_date`（`schema.ts:239-268`、null 可 = 翌月14日デフォルト）。
- 承認処理は `approveSettlement`（`settlementService.ts:272-332`）→ 書き込みは `recordSettlementApproval`（`settlementApprovalRepository.ts:24-161`）に集約。Neon HTTP が interactive transaction 非対応のため、承認確定の複数 INSERT を 1 トランザクションにまとめている。**通知書スナップショットの書き込みもここに追加して原子性を保つ。**

### 設計上の食い違い（要確認・本プランの判断）

`docs/issue-12-worker-payout-account-plan.md:324-337` は「#13 は振込先を掲載せず作業者名・精算明細のみ」と記載しているが、**Issue #13 本文は `recipientName`/`postalCode`/`address` の承認時スナップショット保存と通知書表示を明示要求している。** より詳細な Issue #13 を正とし、宛名・郵便番号・住所は載せる。口座番号・銀行名・支店名・口座種別・口座名義・補足メモは載せない（両ドキュメント一致）。

## 3. スコープ

### 3.1 対象

- 支払い通知書の作成・表示（作業者本人 / 管理者）。
- 月次承認実行時に、通知書用スナップショット（作業者宛先 + 支払い予定日 + 承認済み精算スナップショットのコピー）を保存する。
- 承認時点で固定した情報を元にした通知書表示。
- ブラウザ印刷 / PDF 保存に適したレイアウト。
- 管理者による通知書の再作成（履歴を上書きしない append 方式）。
- DB migration、テスト、ドキュメント更新。

### 3.2 対象外

- サーバー側 PDF バイナリ生成 / PDF のサーバー保管 / メール送付自動化。
- 振込先情報の登録・変更フロー（#12 実装済み、変更しない）。
- 通知書専用の作業者宛先入力フォーム。
- 支払い元・通知書発行者情報の登録フォーム。
- 銀行名・支店名・口座種別・口座番号・口座名義・補足メモの通知書表示 / スナップショット保存。
- 支払い状態・支払い予定日の更新 UI（#8 実装済み、変更しない）。
- 支払い済み状態・支払日・支払い済み登録履歴の通知書表示。
- 適格請求書発行事業者登録番号の登録・表示。

## 4. 主要な設計判断

以下は実装前に確認したい判断。本プランは推奨案を採用済み。

1. **承認は振込先未登録でもブロックしない（推奨）。** 振込先未登録 / 復号失敗時は精算スナップショットの承認自体は成立させ、通知書スナップショットだけをスキップする。理由: #12 が「未登録でも承認をブロックしない」方針であり、#13 も「承認済みだが通知書スナップショットがない → 再承認 / 再作成が必要」という状態を明示的にモデル化しているため。承認結果に「通知書を作成できなかった理由」を含めて UI で登録 / 管理者確認を促す。
2. **通知書の宛先 PII は暗号化して保存する（推奨）。** `recipientName`/`postalCode`/`address` は #12 と同じ AES-256-GCM で暗号化して `payment_notices` に格納。閲覧時のみ復号。理由: #12 の PII 取り扱い（平文保存しない）と整合させ、DB に住所等を平文で残さないため。
3. **通知書は append-only 履歴。** `payment_notices` に (month, assignee) あたり複数行を許可。承認時 / 再作成時に新規行を INSERT し、過去行は上書きしない。「最新の通知書」= 同一 (month, assignee) の最新 `created_at`（= 最大 id）。
4. **通知書番号は id 由来の安定値。** identity `id` を PK にし、通知書番号は `PN-{id を0埋め}` 形式で表示時に導出（別カラムを持たず一意性を id に委譲）。
5. **通知書の支払い予定日は独自に固定する。** 承認時に指定された予定日、未指定なら既存 `monthly_payments.scheduled_date`、それも無ければ `defaultPaymentDueDate(month)`（翌月14日、`paymentService.ts`）を計算し、通知書行に `scheduled_date NOT NULL` として固定。#8 の `monthly_payments` の書き込み挙動は変更しない（通知書は自前の凍結値を持つ）。

## 5. データモデル

### 5.1 payment_notices（新規テーブル / `schema.ts`）

| カラム                        | 型                                  | 説明                                                                                                                                                  |
| ----------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                          | bigint GENERATED ALWAYS AS IDENTITY | PK。通知書番号の基。                                                                                                                                  |
| `month`                       | text                                | `YYYY-MM`。check 制約付き。                                                                                                                           |
| `assignee_login`              | text                                | 作業者 login。                                                                                                                                        |
| `settlement_snapshot`         | jsonb                               | 承認済み精算スナップショットの**凍結コピー**（`VersionedSettlementSnapshot`）。再承認で `monthly_settlement_snapshots` が上書きされても通知書は不変。 |
| `recipient_encrypted_payload` | text                                | 暗号化した `{ recipientName, postalCode, address }`。                                                                                                 |
| `encryption_key_version`      | integer NOT NULL DEFAULT 1          | 鍵バージョン。                                                                                                                                        |
| `scheduled_date`              | date NOT NULL                       | 凍結した支払い予定日。                                                                                                                                |
| `approved_by`                 | text NOT NULL                       | 凍結した承認者 login。                                                                                                                                |
| `approved_at`                 | timestamptz NOT NULL                | 凍結した承認日時。                                                                                                                                    |
| `issued_on`                   | date NOT NULL                       | 発行日。                                                                                                                                              |
| `created_by`                  | text NOT NULL                       | 作成 / 再作成の実行者。                                                                                                                               |
| `created_at`                  | timestamptz NOT NULL DEFAULT now()  | 作成日時。                                                                                                                                            |

- check `payment_notices_month_chk`: `month ~ '^\d{4}-(0[1-9]|1[0-2])$'`（既存テーブルと同形式）。
- index `(month, assignee_login, created_at DESC)`: 最新取得 + 履歴一覧用。
- FK は張らない方針（`monthly_settlement_snapshots` も張っていない）。あるいは `assignee_login → worker_profiles.login` cascade を検討（要判断）。
- migration: `pnpm db:generate` で `migrations/0007_*.sql` を生成。E2E reset（`src/routes/__e2e/reset/+server.ts`）と DB リセットに `payment_notices` を追加。

### 5.2 暗号化

- #12 の `payoutAccountCrypto.ts`（AES-256-GCM、`PAYOUT_ACCOUNT_ENCRYPTION_KEY`）を再利用。
- `encryptPayload` / `decryptPayload` を任意 JSON を扱える汎用ヘルパー（`encryptJson`/`decryptJson`）へ小さくリファクタし、payout と notice で共有する（既存 payload 型は据え置き）。通知書は `NoticeRecipient = { recipientName; postalCode; address }` のみ暗号化。

## 6. レイヤー構成

```text
src/lib/server/notices/
  noticeTypes.ts        # PaymentNoticeRow, PaymentNoticeView, NoticeRecipient, NoticeCreateResult
  noticeRepository.ts   # getLatestNotice / listNotices / insertNotice(単発=再作成用)
  noticeService.ts      # buildNoticeView, getNoticeForViewer, recreateNotice, prepareNoticeSnapshot
  (暗号化は payoutAccounts/payoutAccountCrypto の汎用ヘルパーを共有)

src/routes/settlements/[month]/[assignee]/notice/
  +page.server.ts       # load: requireSelfOrAdmin + getNoticeForViewer / actions: recreate(管理者)
  +page.svelte          # 印刷向け通知書レイアウト
  +layout@.svelte       # (任意) アプリシェルから外れた印刷用クリーンレイアウト
```

主要関数（案）:

```ts
// 承認フロー内で通知書スナップショットの材料を組み立てる
prepareNoticeSnapshot(summary, approvedBy, effectiveScheduledDate)
  -> { ok: true, notice: NoticeWriteInput }
   | { ok: false, reason: "payout_account_missing" | "payout_decrypt_failed" }

// 閲覧（本人 / 管理者のみ、それ以外 null）
getNoticeForViewer(month, assignee, viewer): PaymentNoticeView | null

// 管理者による再作成（承認済み snapshot + 現在の振込先から新規行を append）
recreateNotice(month, assignee, actor): { ok: true } | { ok: false; message }

// snapshot + 復号済み宛先 -> 表示用ビュー
buildNoticeView(row): PaymentNoticeView
```

## 7. 承認フローへの統合

`approveSettlement`（`settlementService.ts:272-332`）の既存チェックを全て通過した後:

1. 有効な支払い予定日を確定（指定 > 既存 `monthly_payments.scheduled_date` > `defaultPaymentDueDate(month)`）。
2. `worker_payout_accounts` を取得し復号:
   - 未登録 → 通知書スキップ。承認は続行し、結果に `noticeSkipped: "payout_account_missing"` を返す。
   - 復号失敗 → 通知書スキップ。承認は続行し、`noticeSkipped: "payout_decrypt_failed"` を返す。
   - 成功 → `{ recipientName, postalCode, address }` を再暗号化し、通知書行の材料を用意。
3. `recordSettlementApproval` に通知書材料を渡し、**snapshot UPSERT・audit・（あれば scheduled_date）・payment_notices INSERT を同一トランザクションで実行**（`postgresClient` / `neonClient` 両分岐に追加）。

`page.server.ts` の `?/approve` action（`settlements/[month]/+page.server.ts:27-41`）は、`noticeSkipped` を受けて画面に登録導線 / 管理者確認メッセージを表示する。

### 管理者による再作成

- 通知書表示画面（または月次詳細）に管理者用 `?/recreateNotice` action を追加。`requireAdmin`。
- 現在の承認済み `monthly_settlement_snapshots.snapshot` + 現在の振込先 + 有効な予定日から**新規行を INSERT**（`monthly_settlement_snapshots` は変更しない → 履歴保持）。
- 承認済みでない / 振込先未登録 / 復号失敗時はエラーメッセージを返し、再作成しない。

## 8. 画面・導線

### 8.1 通知書表示 `/settlements/[month]/[assignee]/notice`

- `load`: `requireSelfOrAdmin(event, assignee)` → `getNoticeForViewer`。
- 通知書あり → 印刷向けレイアウトで表示。「印刷 / PDF保存」ボタン（`window.print()`）。
- 通知書なし:
  - 本人: 未承認なら「管理者承認後に表示される」、承認済みだが未登録なら「振込先未登録のため表示できない」+ `/workers/[login]` への登録導線。
  - 管理者: 「承認時点の通知書用スナップショットがない → 再承認 / 再作成が必要」+ 再作成ボタン。
- 権限: 他作業者アクセスは `requireSelfOrAdmin` で `/work` へ 303（既存パターン）。

### 8.2 月次精算詳細 `/settlements/[month]/[assignee]` からの導線

- 本人・管理者に「支払い通知書を表示」リンクを追加（承認済みのとき）。

### 8.3 印刷 / PDF

- `@media print` でナビ・操作ボタン・アプリシェルを非表示にし、通知書本文だけ出力。
- 必要なら `+layout@.svelte` でルートレイアウトから外し、印刷専用の素の DOM にする。

## 9. 通知書に表示する情報（Issue 準拠）

- **書類情報**: 書類名「支払い通知書」/ 通知書番号（`PN-{id}`）/ 対象月 / 発行日 / 作成日時 / 管理者承認日時 / 承認者 login / 支払い予定日。
- **支払先作業者情報**: 宛名（凍結 `recipientName`）/ 郵便番号（凍結 `postalCode`）/ 住所（凍結 `address`）/ 作業者表示名（`worker_profiles.displayName`）/ GitHub login / 対象月の精算ページ URL。
- **支払い金額**: 固定報酬合計 / 時間精算合計 / 税抜合計 / 消費税額 / 税込合計（snapshot `totals`）。
- **明細**: Project·Repository / Issue番号 / Issueタイトル / Issue URL / 報酬方式 / 固定報酬額 / 稼働時間 / 時間単価 / 時間精算額 / 税抜小計 / 明細ごとの警告（snapshot `comparable.lines`）。既存の明細テーブル（`[assignee]/+page.svelte:259-291`）と `format.ts` を再利用。
- **稼働ログ**: 対象 Issue / 開始日時 / 終了日時 / 稼働分数 / **除外済みログは除外**（snapshot `sessions` を `excludedAt == null` でフィルタ）。`SettlementWorkLogTable.svelte` を印刷向けに読み取り専用で再利用 or 派生。
- **注意書き**: 管理者承認済みスナップショット由来である旨 / 作成後の振込先・予定日変更は反映されない旨 / 銀行名等・支払い済み状態を表示しない旨。

## 10. テスト計画

### Unit（vitest、`settlementService.test.ts` のモックパターン流用）

- 承認時に振込先ありなら `recordSettlementApproval` が通知書材料つきで呼ばれる。
- 承認時に振込先未登録なら通知書スキップ（`noticeSkipped: "payout_account_missing"`）、承認自体は成功。
- 復号失敗時は通知書スキップ（`noticeSkipped: "payout_decrypt_failed"`）、承認は成功。
- 予定日未指定時に翌月14日が通知書へ凍結される。
- `getNoticeForViewer`: 本人 / 管理者は取得可、他人 / 未ログインは null。
- `buildNoticeView`: snapshot → 明細 / 稼働ログ（除外除外）/ totals / 復号宛先が正しくマッピング。
- `recreateNotice`: 既存行を残したまま新規行を append。承認済みでなければ失敗。

### Integration（`RUN_DB_INTEGRATION=1`）

- `payment_notices_month_chk` 制約。
- 通知書行に口座番号 / 銀行名等が保存されない（recipient payload のみ）。
- 復号後の宛先が平文で DB に無い。

### E2E（Playwright）

- 本人が自分の承認済み通知書を表示できる。
- 他作業者は通知書ページから `/work` へリダイレクト。
- 未承認月は通知書を表示せず案内が出る。
- 振込先未登録月は通知書が無く登録導線が出る。
- 宛先A で承認 → 宛先B へ変更しても既存通知書はAのまま。
- 予定日A で承認 → 予定日B へ変更しても既存通知書はAのまま。
- 印刷レイアウトでナビ / ボタンが隠れ、本文項目が出力される（口座番号・支払い済み状態・登録番号が含まれない）。

## 11. 完了条件との対応

- 承認時に #12 の宛名 / 郵便番号 / 住所が通知書スナップショット保存 → §7。
- 承認時に #8 の支払い予定日が凍結、未設定なら翌月14日 → §4-5, §7。
- 承認時点の宛名 / 郵便番号 / 住所 / 支払い予定日を表示 → §9。
- 通知書専用宛先フォーム / 支払い元フォームを追加しない → §3.2。
- 銀行名等・支払い済み状態を表示 / 保存しない → §5.1, §9。
- 本人 / 管理者が表示、他作業者はブロック、未承認は非表示 → §8。
- 未登録 / 復号失敗ではスナップショット保存不可 → §4-1, §7。
- 承認後に宛先 / 予定日を変更しても既存通知書は不変 → append-only + 凍結コピー §4-3, §5.1。
- 再作成が過去通知書を上書きしない → §7 再作成。
- 印刷 / PDF に本文出力、登録番号非表示 → §8.3, §9。
- 関連テスト追加 → §10。

## 12. 作業フェーズ（目安）

- Phase 1: schema へ `payment_notices` 追加 + migration 生成 + E2E reset 追記（1〜2h）。
- Phase 2: 暗号化ヘルパー汎用化 + `notices/` の types / repository / service（3〜4h）。
- Phase 3: 承認フロー統合（`approveSettlement` / `recordSettlementApproval` 拡張）(2〜3h)。
- Phase 4: 通知書表示ルート + 印刷レイアウト + 詳細画面リンク + 再作成 action（3〜4h）。
- Phase 5: Unit / Integration / E2E テスト + help ドキュメント + PR（3〜4h）。

想定工数: 合計 **12〜17時間**。

## 13. 実装メモ（確定仕様・プランからの差分）

実装で以下を確定した。プラン本文と読み替える。

- **凍結する本文は専用ドキュメント。** `monthly_settlement_snapshots.snapshot` の正規化形（`comparable`）は Issue タイトル・URL を保持しないため、`settlement_snapshot` のコピーではなく、承認時点の `SettlementSummary`（完全な `ProjectIssue` を持つ）から専用の `PaymentNoticeDocument`（totals / lines〈title・url 含む〉/ workLogs〈除外ログ除外〉）を生成して `payment_notices.document`(jsonb) へ凍結する。
- **カラム追加。** 作業者表示名も凍結するため `worker_display_name text NOT NULL` を追加（プランの表に対する追加）。実カラム: `id`(bigint identity) / `month` / `assignee_login` / `document` / `worker_display_name` / `recipient_encrypted_payload` / `encryption_key_version` / `scheduled_date` / `approved_by` / `approved_at` / `issued_on` / `created_by` / `created_at`。migration: `migrations/0007_dashing_lockheed.sql`。
- **暗号化ヘルパー。** 汎用化は `src/lib/server/crypto/envelopeCrypto.ts`（`encryptJson`/`decryptJson`）に切り出し、`payoutAccountCrypto` はこれに委譲、通知書は `src/lib/server/notices/noticeCrypto.ts`（宛名・郵便番号・住所のみ）で利用。鍵は既存 `PAYOUT_ACCOUNT_ENCRYPTION_KEY` を共有。
- **承認フローは原子的な追記。** `approveSettlement` はコミット前に振込先を読んで通知書材料を用意し、`recordSettlementApproval`（生 SQL の単一トランザクション）へ `notice` として渡して snapshot・monthly_payments・audit と同一トランザクションで `payment_notices` を INSERT する。承認日時は `approveSettlement` で1つだけ生成し、スナップショットと通知書の両行で共有する。振込先が未登録・復号失敗のときは `notice` を渡さず、承認自体は成立させて通知書のみスキップ（`approveSettlement` の戻り値に `noticeCreated` / `noticeSkippedReason`）。「承認済みだが通知書なし」は §4-1 の回復可能状態（再作成で解消）。
- **再作成は `recreateSettlementNotice`（settlementService）。** 承認済みかつ内容変更なし（`validateSettlementPaymentEligibility`）を前提に、承認日時・承認者は既存承認スナップショットの値を凍結し、新規行を append。
- **通知書レイヤー。** `src/lib/server/notices/`（`noticeTypes.ts` / `noticeCrypto.ts` / `noticeRepository.ts` / `noticeService.ts`）。ルート: `src/routes/settlements/[month]/[assignee]/notice/`（`+page.server.ts` / `+page.svelte`）。印刷時のナビ非表示は `+page.svelte` の `@media print` + `:global()` で対応（レイアウトリセットは不使用）。
- **テスト。** `tests/noticeDocument.test.ts`（本文生成・除外ログ除外）、`tests/noticeCrypto.test.ts`（宛先のみ暗号化・往復・不正暗号文）、`tests/settlementService.test.ts`（承認時の通知書作成・デフォルト予定日凍結・振込先未登録スキップ）、`tests/dbConstraints.integration.test.ts`（`payment_notices_month_chk`）。E2E は §10 の観点を今後追加。
- **未実施。** E2E スペック追加、help ページへの案内追記は未対応（別途）。
