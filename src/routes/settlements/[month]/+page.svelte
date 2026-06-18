<script lang="ts">
  import { enhance } from "$app/forms";
  import { browser } from "$app/environment";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import { formatDateTime, formatIssueName, formatProjectName, formatYen } from "$lib/format";
  import { addMonths, currentJstMonth, formatMonthLabel } from "$lib/month";

  let { data, form }: PageProps = $props();
  let pendingAction = $state<string | null>(null);
  const snapshotByAssignee = $derived(
    new Map(data.snapshots.map((snapshot) => [snapshot.assigneeLogin, snapshot]))
  );

  const enhanceAction = (name: string, clearHashOnSuccess = false): SubmitFunction =>
    () => {
      pendingAction = name;
      return async ({ result, update }) => {
        await update();
        pendingAction = null;
        if (browser && clearHashOnSuccess && result.type === "success" && globalThis.location.hash) {
          globalThis.history.replaceState(
            null,
            "",
            `${globalThis.location.pathname}${globalThis.location.search}`
          );
        }
      };
    };

  const actionMessage = $derived((form as ActionData | undefined)?.message);
  const pendingRequests = $derived(data.requests.filter((request) => request.status === "pending"));
  const formatProjectStatus = (status: string | null): string =>
    status === "In Progress" ? "作業中" : status ?? "-";
  const formatUnsettledReason = (reason: "open_in_progress" | "closed_not_done"): string =>
    reason === "closed_not_done" ? "Status未完了" : "未close";
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
        {@const snapshot = snapshotByAssignee.get(summary.assigneeLogin)}
        <tr>
          <td>
            <a href={`/settlements/${data.month}/${summary.assigneeLogin}`}>{summary.assigneeLogin}</a>
          </td>
          <td>{formatYen(summary.fixedRewardYen)}</td>
          <td>{formatYen(summary.timedRewardYen)}</td>
          <td>{formatYen(summary.taxExcludedYen)}</td>
          <td>{formatYen(summary.taxIncludedYen)}</td>
          <td>
            {#if !summary.approvalRequired}
              <span class="muted">精算対象なし</span>
            {:else if snapshot}
              <span class="status-stack">
                {#if snapshot.hasChanges && summary.blockingReasons.length}
                  <strong class="bad">承認済み・要確認</strong>
                {:else if snapshot.hasChanges}
                  <strong class="bad">承認後変更あり</strong>
                {:else}
                  <strong class="ok">承認済み</strong>
                {/if}
                <small>{formatDateTime(snapshot.approvedAt)} / {snapshot.approvedBy}</small>
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
            {:else if summary.blockingReasons.length > 0}
              <button class="button primary" type="button" disabled>{snapshot ? "再承認" : "承認"}</button>
            {:else}
              <a class={`button ${snapshot ? "secondary" : "primary"}`} href={`#approve-${summary.assigneeLogin}`} data-sveltekit-reload>
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
    <div
      id={`approve-${summary.assigneeLogin}`}
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`approval-dialog-${summary.assigneeLogin}`}
    >
      <a class="modal-scrim" href="#settlement-top" aria-label="閉じる"></a>
      <div class="modal">
        <header class="modal-header">
          <div>
            <p class="eyebrow">monthly approval</p>
            <h2 id={`approval-dialog-${summary.assigneeLogin}`}>
              {summary.assigneeLogin} の月次{snapshot ? "再承認" : "承認"}
            </h2>
            {#if snapshot}
              <p class="approval-record">
                前回承認: {formatDateTime(snapshot.approvedAt)} / {snapshot.approvedBy}
                {#if snapshot.hasChanges}
                  <span>現在の承認内容に変更があります</span>
                {/if}
              </p>
            {/if}
          </div>
          <a class="icon-button" href="#settlement-top" aria-label="閉じる">
            ×
          </a>
        </header>

        <div class="approval-summary" aria-label="承認金額">
          <div>
            <span>固定</span>
            <strong>{formatYen(summary.fixedRewardYen)}</strong>
          </div>
          <div>
            <span>時間</span>
            <strong>{formatYen(summary.timedRewardYen)}</strong>
          </div>
          <div>
            <span>税抜</span>
            <strong>{formatYen(summary.taxExcludedYen)}</strong>
          </div>
          <div>
            <span>税込</span>
            <strong>{formatYen(summary.taxIncludedYen)}</strong>
          </div>
        </div>

        {#if summary.blockingReasons.length}
          <div class="modal-alert">
            <strong>承認不可</strong>
            <ul>
              {#each summary.blockingReasons as reason (reason)}
                <li>{reason}</li>
              {/each}
            </ul>
          </div>
        {/if}

        <div class="modal-section">
          <div class="section-heading">
            <h3>精算対象明細</h3>
            <a href={`/settlements/${data.month}/${summary.assigneeLogin}`}>個人明細を開く</a>
          </div>
          <div class="detail-list">
            {#each summary.lines as line (`${line.issue.repository}#${line.issue.number}`)}
              <article class="detail-item">
                <div class="issue-heading">
                  <span class="project-name">{formatProjectName(line.issue.repository)}</span>
                  <a href={line.issue.url} target="_blank" rel="noreferrer">
                    {formatIssueName(line.issue.number, line.issue.title)}
                  </a>
                </div>
                <dl>
                  <div>
                    <dt>報酬</dt>
                    <dd>{line.issue.rewardMode ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>固定</dt>
                    <dd>{formatYen(line.fixedRewardYen)}</dd>
                  </div>
                  <div>
                    <dt>稼働</dt>
                    <dd>{line.workMinutes}分</dd>
                  </div>
                  <div>
                    <dt>時間</dt>
                    <dd>{formatYen(line.timedRewardYen)}</dd>
                  </div>
                  <div>
                    <dt>小計</dt>
                    <dd>{formatYen(line.taxExcludedYen)}</dd>
                  </div>
                </dl>
              </article>
            {/each}
          </div>
        </div>

        <div class="modal-section">
          <h3>未精算予定</h3>
          {#if summary.unsettledProjectIssues.length === 0 && summary.unsettledIssueSessions.length === 0}
            <p class="muted">未精算予定のProject Issueや稼働ログはありません。</p>
          {:else}
            <ul class="planned-list">
              {#each summary.unsettledProjectIssues as line (`${line.issue.repository}#${line.issue.number}`)}
                <li>
                  <div>
                    <span class="project-name">{formatProjectName(line.issue.repository)}</span>
                    <a href={line.issue.url} target="_blank" rel="noreferrer">
                      <strong>{formatIssueName(line.issue.number, line.issue.title)}</strong>
                    </a>
                  </div>
                  <div class="planned-meta">
                    <span>状態: {formatProjectStatus(line.issue.status)}</span>
                    <span>理由: {formatUnsettledReason(line.reason)}</span>
                    <span>ログ: {line.sessions.length}件</span>
                    <span>稼働: {line.workMinutes}分</span>
                  </div>
                </li>
              {/each}
              {#each summary.unsettledIssueSessions as session (session.id)}
                <li>
                  <div>
                    <span class="project-name">{formatProjectName(session.repository)}</span>
                    <a
                      href={`https://github.com/${session.repository}/issues/${session.issueNumber}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <strong>{formatIssueName(session.issueNumber, session.issueTitle)}</strong>
                    </a>
                  </div>
                  <div class="planned-meta">
                    <span>Project外/未検出ログ</span>
                    <span>{formatDateTime(session.startedAt)} - {formatDateTime(session.endedAt)}</span>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <footer class="modal-actions">
          <a class="button secondary" href="#settlement-top">
            キャンセル
          </a>
          <form method="POST" action="?/approve" use:enhance={enhanceAction(`approve-${summary.assigneeLogin}`, true)}>
            <input type="hidden" name="assigneeLogin" value={summary.assigneeLogin} />
            <ActionSubmit
              actionName={`approve-${summary.assigneeLogin}`}
              {pendingAction}
              label={snapshot ? "この内容で再承認" : "この内容で承認"}
              pendingLabel={snapshot ? "再承認中..." : "承認中..."}
              disabled={summary.blockingReasons.length > 0}
            />
          </form>
        </footer>
      </div>
    </div>
  {/if}
{/each}

<style>
  .page-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .month-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .month-nav a,
  .month-nav span {
    border: 1px solid #d8ded7;
    border-radius: 6px;
    padding: 0.45rem 0.7rem;
    background: white;
    color: #38514a;
    font-weight: 700;
    text-decoration: none;
  }

  .month-nav span {
    color: #9aa59f;
  }

  .eyebrow {
    margin: 0 0 0.25rem;
    color: #66736d;
    font-size: 0.78rem;
    text-transform: uppercase;
  }

  h1,
  h2,
  h3 {
    margin: 0;
  }

  h3 {
    font-size: 0.95rem;
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
    margin: -0.2rem 0 1rem;
    border-radius: 6px;
    background: #ecfdf5;
    color: #047857;
    padding: 0.7rem 0.85rem;
    font-weight: 700;
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

  .status-stack,
  .approval-record {
    display: grid;
    gap: 0.18rem;
  }

  .status-stack small,
  .approval-record {
    color: #66736d;
    font-size: 0.78rem;
  }

  .status-stack strong {
    white-space: nowrap;
  }

  .approval-record {
    margin: 0.3rem 0 0;
  }

  .approval-record span {
    color: #b91c1c;
    font-weight: 700;
  }

  .review-actions {
    display: flex;
    gap: 0.5rem;
  }

  .button {
    display: inline-block;
    min-width: 8rem;
    border: 0;
    border-radius: 6px;
    padding: 0.55rem 0.9rem;
    font: inherit;
    font-weight: 700;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
  }

  .button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .button.primary {
    background: #0f766e;
    color: white;
  }

  .button.secondary {
    background: #e5e7eb;
    color: #111827;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: none;
    place-items: center;
    padding: 1rem;
    background: rgb(15 23 42 / 0.35);
  }

  .modal-backdrop:target {
    display: grid;
  }

  .modal {
    position: relative;
    z-index: 1;
    width: min(48rem, 100%);
    max-height: min(46rem, calc(100vh - 2rem));
    overflow: auto;
    border-radius: 8px;
    background: white;
    box-shadow: 0 18px 60px rgb(15 23 42 / 0.22);
    padding: 1rem;
  }

  .modal-scrim {
    position: absolute;
    inset: 0;
    z-index: 0;
  }

  .modal-header,
  .section-heading,
  .modal-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .modal-header {
    align-items: start;
    margin-bottom: 1rem;
  }

  .icon-button {
    display: grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border: 1px solid #d8ded7;
    border-radius: 999px;
    background: white;
    color: #111827;
    font-size: 1.2rem;
    line-height: 1;
    text-decoration: none;
    cursor: pointer;
  }

  .approval-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
    gap: 0.6rem;
    margin-bottom: 1rem;
  }

  .approval-summary div {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.7rem;
  }

  .approval-summary span,
  .modal-section dt,
  .planned-list span,
  .detail-item span {
    color: #66736d;
  }

  .approval-summary strong {
    display: block;
    margin-top: 0.25rem;
    font-size: 1.15rem;
  }

  .modal-alert {
    margin-bottom: 1rem;
    border-radius: 6px;
    background: #fff7ed;
    color: #9a3412;
    padding: 0.8rem;
  }

  .modal-alert ul,
  .planned-list {
    margin: 0.5rem 0 0;
  }

  .modal-section {
    border-top: 1px solid #e5e7eb;
    padding-top: 1rem;
    margin-top: 1rem;
  }

  .detail-list {
    display: grid;
    gap: 0.65rem;
    margin-top: 0.7rem;
  }

  .issue-heading {
    display: grid;
    gap: 0.15rem;
  }

  .project-name {
    color: #66736d;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .detail-item {
    display: grid;
    gap: 0.7rem;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.75rem;
  }

  .detail-item a {
    font-weight: 700;
  }

  .detail-item span {
    display: block;
    margin-top: 0.15rem;
  }

  .detail-item dl {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr));
    gap: 0.5rem;
    margin: 0;
  }

  .detail-item dt,
  .detail-item dd {
    margin: 0;
  }

  .detail-item dd {
    font-weight: 700;
  }

  .planned-list {
    display: grid;
    gap: 0.45rem;
    padding: 0;
    list-style: none;
  }

  .planned-list li {
    display: grid;
    gap: 0.25rem;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.65rem;
  }

  .planned-list a {
    width: fit-content;
    font-weight: 700;
  }

  .planned-list span {
    display: block;
  }

  .planned-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0.75rem;
  }

  .modal-actions {
    border-top: 1px solid #e5e7eb;
    padding-top: 1rem;
    margin-top: 1rem;
  }

  @media (max-width: 640px) {
    .modal-actions,
    .section-heading {
      align-items: stretch;
      flex-direction: column;
    }

    .button {
      width: 100%;
    }
  }
</style>
