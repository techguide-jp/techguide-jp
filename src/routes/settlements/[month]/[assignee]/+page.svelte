<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import SettlementWorkLogTable from "$lib/components/SettlementWorkLogTable.svelte";
  import UnsettledSettlementPanel from "$lib/components/UnsettledSettlementPanel.svelte";
  import {
    formatDateTime,
    formatIssueName,
    formatProjectName,
    formatYen,
  } from "$lib/format";
  import { addMonths, currentJstMonth, formatMonthLabel } from "$lib/month";

  let { data, form }: PageProps = $props();
  let pendingAction = $state<string | null>(null);

  const snapshotTaxExcludedYen = (snapshot: unknown): number | null => {
    if (!snapshot || typeof snapshot !== "object") return null;
    const value = snapshot as {
      taxExcludedYen?: unknown;
      totals?: { taxExcludedYen?: unknown };
    };
    if (typeof value.totals?.taxExcludedYen === "number")
      return value.totals.taxExcludedYen;
    if (typeof value.taxExcludedYen === "number") return value.taxExcludedYen;
    return null;
  };

  const enhanceAction =
    (name: string): SubmitFunction =>
    () => {
      pendingAction = name;
      return async ({ update }) => {
        await update();
        pendingAction = null;
      };
    };

  const summary = $derived(data.summary);
  const approvedTaxExcludedYen = $derived(
    snapshotTaxExcludedYen(data.snapshot?.snapshot),
  );
  const actionMessage = $derived((form as ActionData | undefined)?.message);
  const submission = $derived(data.submission);
  const canSubmitWork = $derived(data.user?.login === data.assignee);
  const diff = $derived(
    approvedTaxExcludedYen === null || !summary
      ? null
      : summary.taxExcludedYen - approvedTaxExcludedYen,
  );
  const currentMonth = $derived(currentJstMonth());
  const previousMonth = $derived(addMonths(data.month, -1));
  const nextMonth = $derived(addMonths(data.month, 1));
  const canGoNext = $derived(data.month < currentMonth);
</script>

<section class="page-heading">
  <div>
    <p class="eyebrow">settlement detail</p>
    <h1>{data.assignee} / {formatMonthLabel(data.month)}</h1>
  </div>
  <nav class="month-nav" aria-label="月移動">
    <a href={`/settlements/${previousMonth}/${data.assignee}`}>前月</a>
    <a href={`/settlements/${currentMonth}/${data.assignee}`}>今月</a>
    {#if canGoNext}
      <a href={`/settlements/${nextMonth}/${data.assignee}`}>翌月</a>
    {:else}
      <span>翌月</span>
    {/if}
  </nav>
</section>

{#if !summary}
  <section class="panel">対象データがありません。</section>
{:else}
  {#if actionMessage}
    <p class="notice" role="status">{actionMessage}</p>
  {/if}

  <section class="summary-grid">
    <div>
      <span>固定報酬</span>
      <strong>{formatYen(summary.fixedRewardYen)}</strong>
    </div>
    <div>
      <span>時間精算</span>
      <strong>{formatYen(summary.timedRewardYen)}</strong>
    </div>
    <div>
      <span>税込合計</span>
      <strong>{formatYen(summary.taxIncludedYen)}</strong>
    </div>
    <div>
      <span>確定差分</span>
      <strong>{diff === null ? "-" : formatYen(diff)}</strong>
    </div>
  </section>

  <section class="panel">
    <h2>月次確定申請</h2>
    {#if !summary.approvalRequired}
      <p class="muted">この月は精算対象がないため、月次確定申請は不要です。</p>
    {:else}
      <div class="submission-status">
        {#if submission}
          <div>
            <span>申請状態</span>
            {#if submission.hasChanges}
              <strong class="bad">申請後変更あり</strong>
            {:else}
              <strong class="ok">申請済み</strong>
            {/if}
          </div>
          <div>
            <span>申請日時</span>
            <strong>{formatDateTime(submission.submittedAt)}</strong>
          </div>
        {:else}
          <div>
            <span>申請状態</span>
            <strong class="bad">未申請</strong>
          </div>
        {/if}
      </div>

      {#if data.submissionBlockingReasons.length}
        <div class="inline-alert">
          <strong>申請前に確認が必要です</strong>
          <ul>
            {#each data.submissionBlockingReasons as reason (reason)}
              <li>{reason}</li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if !canSubmitWork}
        <p class="muted">月次確定申請はassignee本人だけが実行できます。</p>
      {:else if submission && !submission.hasChanges}
        <p class="ok">
          この月の稼働は確定申請済みです。申請後に内容が変わった場合は再申請が必要です。
        </p>
      {:else}
        <form
          method="POST"
          action="?/submitWork"
          use:enhance={enhanceAction("submit-work")}
        >
          <ActionSubmit
            actionName="submit-work"
            {pendingAction}
            label={submission
              ? "変更内容で再申請"
              : "この月の稼働を確定して申請"}
            pendingLabel={submission ? "再申請中..." : "申請中..."}
            disabled={data.submissionBlockingReasons.length > 0}
          />
        </form>
      {/if}
    {/if}
  </section>

  {#if summary.blockingReasons.length}
    <section class="panel alert">
      <h2>要確認</h2>
      <ul>
        {#each summary.blockingReasons as reason (reason)}
          <li>{reason}</li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="panel">
    <h2>明細</h2>
    <table>
      <thead>
        <tr>
          <th>Project</th>
          <th>Issue</th>
          <th>報酬方式</th>
          <th>固定</th>
          <th>稼働分</th>
          <th>時間精算</th>
          <th>小計</th>
        </tr>
      </thead>
      <tbody>
        {#each summary.lines as line (`${line.issue.repository}#${line.issue.number}`)}
          <tr>
            <td>{formatProjectName(line.issue.repository)}</td>
            <td>
              <a href={line.issue.url} target="_blank" rel="noreferrer">
                {formatIssueName(line.issue.number, line.issue.title)}
              </a>
            </td>
            <td>{line.issue.rewardMode ?? "-"}</td>
            <td>{formatYen(line.fixedRewardYen)}</td>
            <td>{line.workMinutes}分</td>
            <td>{formatYen(line.timedRewardYen)}</td>
            <td>{formatYen(line.taxExcludedYen)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <SettlementWorkLogTable {summary} />

  <UnsettledSettlementPanel {summary} />
{/if}
