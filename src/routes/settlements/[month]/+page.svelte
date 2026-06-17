<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import { formatDateTime, formatYen } from "$lib/format";

  let { data, form }: PageProps = $props();
  let pendingAction = $state<string | null>(null);

  const enhanceAction = (name: string): SubmitFunction =>
    () => {
      pendingAction = name;
      return async ({ update }) => {
        await update();
        pendingAction = null;
      };
    };

  const actionMessage = $derived((form as ActionData | undefined)?.message);
  const pendingRequests = $derived(data.requests.filter((request) => request.status === "pending"));
</script>

<section class="page-heading">
  <div>
    <p class="eyebrow">settlement</p>
    <h1>{data.month} 月次一覧</h1>
  </div>
  {#if actionMessage}
    <p class="notice">{actionMessage}</p>
  {/if}
</section>

<section class="panel">
  <h2>未処理の修正申請</h2>
  {#if pendingRequests.length === 0}
    <p class="muted">未処理の修正申請はありません。</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Assignee</th>
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
            <td>{request.repository}#{request.issueNumber}</td>
            <td>{request.requestType}</td>
            <td>{formatDateTime(request.requestedStartedAt)} - {formatDateTime(request.requestedEndedAt)}</td>
            <td>{request.reason}</td>
            <td class="review-actions">
              <form method="POST" action="?/reviewRequest" use:enhance={enhanceAction(`approve-request-${request.id}`)}>
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
              <form method="POST" action="?/reviewRequest" use:enhance={enhanceAction(`reject-request-${request.id}`)}>
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
        <th>状態</th>
        <th>操作</th>
      </tr>
    </thead>
    <tbody>
      {#each data.summaries as summary (summary.assigneeLogin)}
        <tr>
          <td>
            <a href={`/settlements/${data.month}/${summary.assigneeLogin}`}>{summary.assigneeLogin}</a>
          </td>
          <td>{formatYen(summary.fixedRewardYen)}</td>
          <td>{formatYen(summary.timedRewardYen)}</td>
          <td>{formatYen(summary.taxExcludedYen)}</td>
          <td>{formatYen(summary.taxIncludedYen)}</td>
          <td>
            {#if summary.blockingReasons.length}
              <span class="bad">要確認 {summary.blockingReasons.length}</span>
            {:else}
              <span class="ok">承認可能</span>
            {/if}
          </td>
          <td>
            <form method="POST" action="?/approve" use:enhance={enhanceAction(`approve-${summary.assigneeLogin}`)}>
              <input type="hidden" name="assigneeLogin" value={summary.assigneeLogin} />
              <ActionSubmit
                actionName={`approve-${summary.assigneeLogin}`}
                {pendingAction}
                label="承認"
                pendingLabel="承認中..."
                disabled={summary.blockingReasons.length > 0}
              />
            </form>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

<style>
  .page-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .eyebrow {
    margin: 0 0 0.25rem;
    color: #66736d;
    font-size: 0.78rem;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
  }

  .panel {
    background: white;
    border: 1px solid #d8ded7;
    border-radius: 8px;
    padding: 1rem;
    overflow-x: auto;
    margin-bottom: 1rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92rem;
  }

  th,
  td {
    border-bottom: 1px solid #e5e7eb;
    padding: 0.75rem;
    text-align: left;
  }

  .notice {
    border-radius: 6px;
    background: #ecfdf5;
    color: #047857;
    padding: 0.7rem 0.85rem;
  }

  .ok {
    color: #047857;
    font-weight: 700;
  }

  .bad {
    color: #b91c1c;
    font-weight: 700;
  }

  .muted {
    color: #66736d;
  }

  .review-actions {
    display: flex;
    gap: 0.5rem;
  }
</style>
