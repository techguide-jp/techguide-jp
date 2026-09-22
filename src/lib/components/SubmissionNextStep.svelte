<script lang="ts">
  import { formatMonthLabel } from "$lib/month";
  import type { SubmissionNotice } from "$lib/submissionReadiness";
  let { notice }: { notice: SubmissionNotice } = $props();
</script>

{#if notice}
  <section
    class="panel next-step"
    aria-labelledby="submission-next-step-heading"
  >
    {#if notice.kind === "ready"}
      <h2 id="submission-next-step-heading">次は月次確定申請です</h2>
      <p>
        {formatMonthLabel(
          notice.month,
        )}分の稼働入力が終わっていれば、{notice.assignee}さんが金額を確認して月次確定申請してください。その後、管理者が精算内容を承認します。
      </p>
      <a
        class="button primary"
        href={`/settlements/${notice.month}/${notice.assignee}#monthly-submission-panel-heading`}
        >精算内容を確認して申請する</a
      >
    {:else}
      <h2 id="submission-next-step-heading">
        管理者の承認後に月次確定申請してください
      </h2>
      <p>
        現在は稼働時刻の修正申請を管理者が確認しています。承認され、すべての確認が終わったら、{notice.assignee}さんが{formatMonthLabel(
          notice.month,
        )}の精算内容を確認して月次確定申請してください。
      </p>
      <a
        href={`/settlements/${notice.month}/${notice.assignee}#monthly-submission-panel-heading`}
        >精算内容と確認待ちの状況を見る</a
      >
    {/if}
  </section>
{/if}

<style>
  .next-step {
    border-color: #99d4c5;
    background: #f0fdfa;
  }
  h2 {
    margin-top: 0;
  }
</style>
