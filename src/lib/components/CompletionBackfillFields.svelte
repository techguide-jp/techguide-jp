<script lang="ts">
  import { formatMonthLabel } from "$lib/month";
  let {
    reportedAt = $bindable(""),
    evidenceUrl = $bindable(""),
    evidenceNote = $bindable(""),
    settlementRuleV2Enabled,
  }: {
    reportedAt?: string;
    evidenceUrl?: string;
    evidenceNote?: string;
    settlementRuleV2Enabled: boolean;
  } = $props();
  const settlementMonth = $derived(reportedAt.slice(0, 7));
</script>

<label class="backfill-field">
  完了日時（JST）
  <input
    type="datetime-local"
    name="reportedAt"
    bind:value={reportedAt}
    min="2026-08-01T00:00"
    required
    aria-describedby="backfill-month-help"
  />
</label>
<div id="backfill-month-help" class="text-sm text-slate-600">
  <p>
    固定報酬は、この日時が属する月の精算対象になります。時間報酬は実際に稼働した月に計上されます。
  </p>
  {#if settlementMonth}
    <p class="mt-1 font-bold text-teal-800" role="status">
      固定報酬の精算月：{formatMonthLabel(settlementMonth)}
    </p>
  {/if}
  {#if !settlementRuleV2Enabled}
    <p class="mt-1">登録内容は、新精算ルールの有効化後に反映されます。</p>
  {/if}
</div>
<label class="backfill-field">
  証跡URL
  <input
    type="url"
    name="evidenceUrl"
    bind:value={evidenceUrl}
    placeholder="https://github.com/.../pull/123#issuecomment-..."
    maxlength="2000"
    required
    aria-describedby="backfill-evidence-help"
  />
</label>
<p id="backfill-evidence-help" class="text-sm text-slate-600">
  レビュー依頼や納品・作業完了の連絡を確認できるURLを入力してください。例：GitHubのPR・Issueコメント、Slackの該当メッセージへのリンク。入力した完了日時の根拠が分かる箇所を指定します。
</p>
<label class="backfill-field">
  登録理由
  <textarea
    name="evidenceNote"
    rows="3"
    bind:value={evidenceNote}
    maxlength="2000"
    placeholder="例：完了報告機能の導入前に、8/20のPRコメントでレビューを依頼済みのため。"
    required></textarea>
</label>

<style>
  .backfill-field {
    display: grid;
    gap: 0.375rem;
    font-size: 0.875rem;
    font-weight: 600;
  }
  .backfill-field input,
  .backfill-field textarea {
    width: 100%;
    min-width: 0;
    padding: 0.625rem;
    border: 1px solid #cbd5e1;
    border-radius: 0.375rem;
    background: white;
    font: inherit;
    font-weight: 400;
  }
  .backfill-field :focus-visible {
    outline: 2px solid #0f766e;
    outline-offset: 2px;
  }
</style>
