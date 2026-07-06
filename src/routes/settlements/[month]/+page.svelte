<script lang="ts">
  import { enhance } from "$app/forms";
  import { replaceState } from "$app/navigation";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import SettlementApprovalModal from "$lib/components/SettlementApprovalModal.svelte";
  import {
    formatDateTime,
    formatIssueName,
    formatProjectName,
    formatYen,
  } from "$lib/format";
  import { addMonths, currentJstMonth, formatMonthLabel } from "$lib/month";
  import { workerPayoutAccountHref } from "$lib/workerProfileRoute";

  let { data, form }: PageProps = $props();
  let pendingAction = $state<string | null>(null);
  const snapshotByAssignee = $derived(
    new Map(
      data.snapshots.map((snapshot) => [snapshot.assigneeLogin, snapshot]),
    ),
  );
  const submissionByAssignee = $derived(
    new Map(
      data.submissions.map((submission) => [
        submission.assigneeLogin,
        submission,
      ]),
    ),
  );
  const payoutStatusByAssignee = $derived(
    new Map(data.payoutAccountStatuses.map((status) => [status.login, status])),
  );

  const enhanceAction =
    (name: string, clearHashOnSuccess = false): SubmitFunction =>
    () => {
      pendingAction = name;
      return async ({ result, update }) => {
        await update();
        pendingAction = null;
        if (
          clearHashOnSuccess &&
          result.type === "success" &&
          globalThis.location.hash
        ) {
          replaceState(
            `${globalThis.location.pathname}${globalThis.location.search}`,
            {},
          );
        }
      };
    };

  const actionMessage = $derived((form as ActionData | undefined)?.message);
  const pendingRequests = $derived(
    data.requests.filter((request) => request.status === "pending"),
  );
  const formatProjectStatus = (status: string | null): string =>
    status === "In Progress" ? "作業中" : (status ?? "-");
  const formatUnsettledReason = (
    reason: "open_in_progress" | "closed_not_done",
  ): string => (reason === "closed_not_done" ? "Status未完了" : "未close");
  const currentMonth = $derived(currentJstMonth());
  const previousMonth = $derived(addMonths(data.month, -1));
  const nextMonth = $derived(addMonths(data.month, 1));
  const canGoNext = $derived(data.month < currentMonth);
</script>

<section id="settlement-top" class="page-heading">
  <div>
    <p class="eyebrow">settlement</p>
    <h1>{formatMonthLabel(data.month)} 月次一覧</h1>
  </div>
  <nav class="month-nav" aria-label="月移動">
    <a href={`/settlements/${previousMonth}`}>前月</a>
    <a href={`/settlements/${currentMonth}`}>今月</a>
    {#if canGoNext}
      <a href={`/settlements/${nextMonth}`}>翌月</a>
    {:else}
      <span>翌月</span>
    {/if}
  </nav>
</section>

{#if actionMessage}
  <p class="notice" role="status">{actionMessage}</p>
{/if}

{#if data.projectFetchError}
  <section class="panel alert">
    <h2>GitHub Projectを取得できません</h2>
    <p>{data.projectFetchError}</p>
    <p class="muted">
      Issue由来の報酬情報が取得できないため、月次承認はできません。
    </p>
  </section>
{/if}

<section class="panel">
  <h2>未処理の修正申請</h2>
  {#if pendingRequests.length === 0}
    <p class="muted">未処理の修正申請はありません。</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Assignee</th>
          <th>Project</th>
          <th>Issue</th>
          <th>種別</th>
          <th>希望時刻</th>
          <th>理由</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {#each pendingRequests as request (request.id)}
          <tr>
            <td>{request.assigneeLogin}</td>
            <td>{formatProjectName(request.repository)}</td>
            <td>
              <a
                href={`https://github.com/${request.repository}/issues/${request.issueNumber}`}
                target="_blank"
                rel="noreferrer"
              >
                {formatIssueName(request.issueNumber, request.issueTitle)}
              </a>
            </td>
            <td>{request.requestType}</td>
            <td
              >{formatDateTime(request.requestedStartedAt)} - {formatDateTime(
                request.requestedEndedAt,
              )}</td
            >
            <td>{request.reason}</td>
            <td class="review-actions">
              <form
                method="POST"
                action="?/reviewRequest"
                use:enhance={enhanceAction(`approve-request-${request.id}`)}
              >
                <input type="hidden" name="requestId" value={request.id} />
                <input type="hidden" name="status" value="approved" />
                <ActionSubmit
                  actionName={`approve-request-${request.id}`}
                  {pendingAction}
                  label="承認"
                  pendingLabel="承認中..."
                  variant="secondary"
                />
              </form>
              <form
                method="POST"
                action="?/reviewRequest"
                use:enhance={enhanceAction(`reject-request-${request.id}`)}
              >
                <input type="hidden" name="requestId" value={request.id} />
                <input type="hidden" name="status" value="rejected" />
                <ActionSubmit
                  actionName={`reject-request-${request.id}`}
                  {pendingAction}
                  label="却下"
                  pendingLabel="却下中..."
                  variant="danger"
                />
              </form>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<section class="panel">
  <table>
    <thead>
      <tr>
        <th>Assignee</th>
        <th>固定</th>
        <th>時間</th>
        <th>税抜</th>
        <th>税込</th>
        <th>振込先</th>
        <th>状態</th>
        <th>操作</th>
      </tr>
    </thead>
    <tbody>
      {#each data.summaries as summary (summary.assigneeLogin)}
        {@const snapshot = snapshotByAssignee.get(summary.assigneeLogin)}
        {@const submission = submissionByAssignee.get(summary.assigneeLogin)}
        {@const payoutStatus = payoutStatusByAssignee.get(
          summary.assigneeLogin,
        )}
        <tr>
          <td>
            <a href={`/settlements/${data.month}/${summary.assigneeLogin}`}
              >{summary.assigneeLogin}</a
            >
          </td>
          <td>{formatYen(summary.fixedRewardYen)}</td>
          <td>{formatYen(summary.timedRewardYen)}</td>
          <td>{formatYen(summary.taxExcludedYen)}</td>
          <td>{formatYen(summary.taxIncludedYen)}</td>
          <td>
            {#if payoutStatus?.registered}
              <span class="status-stack">
                <strong class="ok">登録済み</strong>
                {#if payoutStatus.updatedAt}
                  <small>{formatDateTime(payoutStatus.updatedAt)}</small>
                {/if}
              </span>
            {:else}
              <span class="bad">未登録</span>
            {/if}
            <div>
              <a href={workerPayoutAccountHref(summary.assigneeLogin)}
                >振込先を確認</a
              >
            </div>
          </td>
          <td>
            {#if !summary.approvalRequired}
              <span class="muted">精算対象なし</span>
            {:else if snapshot && !snapshot.hasChanges}
              <span class="status-stack">
                <strong class="ok">承認済み</strong>
                <small
                  >{formatDateTime(snapshot.approvedAt)} / {snapshot.approvedBy}</small
                >
              </span>
            {:else if !submission}
              <span class="bad">未申請</span>
            {:else if submission.hasChanges}
              <span class="status-stack">
                <strong class="bad">申請後変更あり</strong>
                <small
                  >{formatDateTime(submission.submittedAt)} / {submission.submittedBy}</small
                >
              </span>
            {:else if submission.blockingReasons.length}
              <span class="status-stack">
                <strong class="bad">申請済み・要確認</strong>
                <small
                  >{formatDateTime(submission.submittedAt)} / {submission.submittedBy}</small
                >
              </span>
            {:else if snapshot}
              <span class="status-stack">
                {#if summary.blockingReasons.length}
                  <strong class="bad">承認済み・要確認</strong>
                {:else}
                  <strong class="bad">承認後変更あり</strong>
                {/if}
                <small
                  >{formatDateTime(snapshot.approvedAt)} / {snapshot.approvedBy}</small
                >
              </span>
            {:else if summary.blockingReasons.length}
              <span class="bad">要確認 {summary.blockingReasons.length}</span>
            {:else}
              <span class="ok">承認可能</span>
            {/if}
          </td>
          <td>
            {#if !summary.approvalRequired}
              <span class="muted">-</span>
            {:else if snapshot && !snapshot.hasChanges}
              <span class="muted">-</span>
            {:else if !submission || submission.hasChanges || submission.blockingReasons.length}
              <button class="button primary" type="button" disabled
                >{snapshot ? "再承認" : "承認"}</button
              >
            {:else if summary.blockingReasons.length > 0}
              <button class="button primary" type="button" disabled
                >{snapshot ? "再承認" : "承認"}</button
              >
            {:else}
              <a
                class={`button ${snapshot ? "secondary" : "primary"}`}
                href={`#approve-${summary.assigneeLogin}`}
                data-sveltekit-reload
              >
                {snapshot ? "再承認" : "承認"}
              </a>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

{#each data.summaries as summary (summary.assigneeLogin)}
  {#if summary.approvalRequired}
    {@const snapshot = snapshotByAssignee.get(summary.assigneeLogin)}
    {@const submission = submissionByAssignee.get(summary.assigneeLogin)}
    <SettlementApprovalModal
      month={data.month}
      {summary}
      {snapshot}
      {submission}
      {pendingAction}
      {enhanceAction}
      {formatProjectStatus}
      {formatUnsettledReason}
    />
  {/if}
{/each}
