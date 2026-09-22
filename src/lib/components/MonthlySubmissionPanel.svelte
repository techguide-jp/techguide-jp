<script lang="ts">
  import MonthlySubmissionModal from "$lib/components/MonthlySubmissionModal.svelte";
  import { formatDateTime } from "$lib/format";
  import { groupSubmissionTasks } from "$lib/submissionReadiness";
  import type { MonthlyFeedbackInput } from "$lib/monthlyFeedback";
  import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";
  let {
    month,
    assignee,
    isSelf,
    isAdmin,
    required,
    approved,
    projectFetchError,
    blockingReasons,
    submission,
    feedbackInput,
    summary,
    result,
    initiallyOpen,
  }: {
    month: string;
    assignee: string;
    isSelf: boolean;
    isAdmin: boolean;
    required: boolean;
    approved: boolean;
    projectFetchError: string | null;
    blockingReasons: string[];
    submission: {
      submittedAt: Date | string;
      hasChanges: boolean | null;
    } | null;
    feedbackInput: MonthlyFeedbackInput;
    summary: SettlementSummary;
    initiallyOpen: boolean;
    result?: {
      scope?: string;
      message?: string;
      feedbackInput?: MonthlyFeedbackInput;
    } | null;
  } = $props();
  const tasks = $derived(groupSubmissionTasks(blockingReasons));
  const ready = $derived(
    required &&
      !projectFetchError &&
      blockingReasons.length === 0 &&
      (!submission || submission.hasChanges),
  );
</script>

<section class="panel" aria-labelledby="monthly-submission-panel-heading">
  <h2 id="monthly-submission-panel-heading">月次確定申請</h2>
  <ol class="flow" aria-label="月次精算の流れ">
    <li>
      <strong>管理者</strong>が稼働時刻の修正申請を確認（修正申請がある場合）
    </li>
    <li><strong>{assignee}さん</strong>が月次確定申請</li>
    <li><strong>管理者</strong>が精算内容を承認</li>
  </ol>
  {#if submission}<p>申請日時：{formatDateTime(submission.submittedAt)}</p>{/if}
  {#if projectFetchError}
    <h3>管理者による精算データの取得状況の確認が必要です</h3>
    <p>
      管理者がGitHubとの接続を確認してください。復旧後、{assignee}さんが金額を確認して月次確定申請できます。
    </p>
  {:else}
    {#if tasks.timeReviews.length}
      <div class="next-action">
        <h3>稼働時刻の管理者の確認待ち</h3>
        <p>
          管理者が稼働時刻の修正申請を確認し、承認・却下します。すべての確認が終わったら、{assignee}さんがこの画面から月次確定申請してください。
        </p>
        <ul>
          {#each tasks.timeReviews as issue (issue)}<li>{issue}</li>{/each}
        </ul>
        {#if isAdmin}<a href={`/settlements/${month}`}
            >管理者として修正申請を確認する</a
          >{/if}
        {#if isSelf}<p>
            <a href="/work">自分の修正申請を確認する</a
            >（間違った申請は取り消せます）
          </p>{/if}
      </div>
    {/if}
    {#if tasks.unfinishedWork.length}
      <div class="next-action">
        <h3>{assignee}さんによる稼働終了の入力待ち</h3>
        <p>
          {assignee}さんが稼働画面で終了時刻を入力してください。時刻の修正申請を出した場合は、管理者の確認後に月次確定申請できます。
        </p>
        <ul>
          {#each tasks.unfinishedWork as issue (issue)}<li>{issue}</li>{/each}
        </ul>
        {#if isSelf}<a href="/work">稼働の終了時刻を入力する</a>{/if}
      </div>
    {/if}
    {#if tasks.settlementSettings.length}
      <div class="next-action">
        <h3>管理者による精算設定の確認が必要です</h3>
        <p>
          管理者が次の内容を確認・修正してください。解消後、{assignee}さんが月次確定申請できます。
        </p>
        <ul>
          {#each tasks.settlementSettings as reason (reason)}<li>
              {reason}
            </li>{/each}
        </ul>
        {#if isAdmin}<a href={`/settlements/${month}`}
            >管理者として精算内容を確認する</a
          >{/if}
      </div>
    {/if}
    {#if !required}
      <p>この月は精算対象がないため、月次確定申請は不要です。</p>
    {:else if blockingReasons.length === 0}
      {#if ready}
        <p>
          {submission
            ? "申請後に稼働内容が変わっています。"
            : "稼働内容を確認できたら、"}{assignee}さんが月次確定申請してください。申請後、管理者が精算内容を承認します。
        </p>
        {#if isSelf}
          <MonthlySubmissionModal
            {month}
            {assignee}
            {summary}
            input={feedbackInput}
            {result}
            resubmission={Boolean(submission)}
            includeFeedback={!approved}
            {initiallyOpen}
          />
        {:else}<p>次に操作する人：{assignee}さん（本人）</p>{/if}
      {:else if approved}
        <p class="ok">管理者による月次精算の承認が完了しています。</p>
      {:else if submission}
        <p class="ok">月次確定申請済み・管理者の精算承認待ち</p>
        <p>
          管理者が申請内容を確認して精算を承認します。{assignee}さんの再申請は不要です。
        </p>
        {#if isAdmin}<a href={`/settlements/${month}`}
            >管理者として月次精算を確認する</a
          >{/if}
      {/if}
    {/if}
  {/if}
</section>

<style>
  .flow {
    display: grid;
    list-style: decimal;
    gap: 0.5rem;
    padding-left: 1.5rem;
    margin: 1rem 0 1.5rem;
  }
  .next-action {
    padding: 1rem;
    margin: 1rem 0;
    border: 1px solid #cbd5e1;
    border-radius: 0.5rem;
    background: #f8fafc;
    overflow-wrap: anywhere;
  }
  h3 {
    margin-top: 0;
    font-size: 1rem;
  }
</style>
