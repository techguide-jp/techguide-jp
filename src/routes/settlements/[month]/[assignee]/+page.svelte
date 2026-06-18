<script lang="ts">
  import type { PageProps } from "./$types";
  import { formatDateTime, formatIssueName, formatProjectName, formatYen } from "$lib/format";
  import { addMonths, currentJstMonth, formatMonthLabel } from "$lib/month";

  let { data }: PageProps = $props();
  const summary = $derived(data.summary);
  const snapshot = $derived(data.snapshot?.snapshot as { taxExcludedYen?: number } | undefined);
  const diff = $derived(
    snapshot?.taxExcludedYen === undefined || !summary
      ? null
      : summary.taxExcludedYen - snapshot.taxExcludedYen
  );
  const formatProjectStatus = (status: string | null): string =>
    status === "In Progress" ? "作業中" : status ?? "-";
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

  <section class="panel">
    <h2>未精算予定</h2>
    {#if summary.unclosedProjectIssues.length === 0 && summary.unclosedIssueSessions.length === 0}
      <p class="muted">作業中のProject Issueや未close Issueの稼働ログはありません。</p>
    {:else}
      <ul class="pending-list">
        {#each summary.unclosedProjectIssues as line (`${line.issue.repository}#${line.issue.number}`)}
          <li class="pending-session">
            <div class="pending-issue">
              <span class="project-name">{formatProjectName(line.issue.repository)}</span>
              <a href={line.issue.url} target="_blank" rel="noreferrer">
                {formatIssueName(line.issue.number, line.issue.title)}
              </a>
            </div>
            <div class="pending-meta" aria-label="Project状態">
              <span>
                <small>状態</small>
                <strong>{formatProjectStatus(line.issue.status)}</strong>
              </span>
              <span>
                <small>ログ</small>
                <strong>{line.sessions.length}件</strong>
              </span>
              <span>
                <small>稼働</small>
                <strong>{line.workMinutes}分</strong>
              </span>
              <span class="status-badge measuring">未精算</span>
            </div>
          </li>
        {/each}
        {#each summary.unclosedIssueSessions as session (session.id)}
          <li class="pending-session">
            <div class="pending-issue">
              <span class="project-name">{formatProjectName(session.repository)}</span>
              <a
                href={`https://github.com/${session.repository}/issues/${session.issueNumber}`}
                target="_blank"
                rel="noreferrer"
              >
                {formatIssueName(session.issueNumber, session.issueTitle)}
              </a>
            </div>
            <div class="pending-meta" aria-label="稼働時間">
              <span>
                <small>開始</small>
                <strong>{formatDateTime(session.startedAt)}</strong>
              </span>
              <span>
                <small>終了</small>
                <strong>{session.endedAt ? formatDateTime(session.endedAt) : "計測中"}</strong>
              </span>
              <span class={`status-badge ${session.endedAt ? "complete" : "measuring"}`}>
                {session.endedAt ? "終了済み" : "計測中"}
              </span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

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
  h2 {
    margin: 0;
  }

  h2 {
    margin-bottom: 0.8rem;
    font-size: 1.1rem;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: 0.8rem;
    margin-bottom: 1rem;
  }

  .summary-grid div,
  .panel {
    background: white;
    border: 1px solid #d8ded7;
    border-radius: 8px;
    padding: 1rem;
  }

  .summary-grid span,
  .muted {
    color: #66736d;
  }

  .summary-grid strong {
    display: block;
    margin-top: 0.3rem;
    font-size: 1.25rem;
  }

  .panel {
    margin-bottom: 1rem;
    overflow-x: auto;
  }

  .alert {
    background: #fff7ed;
    color: #9a3412;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    border-bottom: 1px solid #e5e7eb;
    padding: 0.75rem;
    text-align: left;
    vertical-align: top;
  }

  .pending-list {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pending-session {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    padding: 0.85rem 0;
    border-top: 1px solid #e5e7eb;
  }

  .pending-session:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .pending-session:last-child {
    padding-bottom: 0;
  }

  .pending-issue {
    display: grid;
    min-width: 0;
    gap: 0.2rem;
  }

  .project-name {
    color: #66736d;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .pending-issue a {
    width: fit-content;
    font-weight: 700;
  }

  .pending-issue span {
    color: #52605a;
  }

  .pending-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.65rem;
    text-align: right;
  }

  .pending-meta span:not(.status-badge) {
    display: grid;
    gap: 0.1rem;
  }

  .pending-meta small {
    color: #66736d;
    font-size: 0.75rem;
  }

  .pending-meta strong {
    font-size: 0.92rem;
    white-space: nowrap;
  }

  .status-badge {
    border-radius: 999px;
    padding: 0.25rem 0.55rem;
    font-size: 0.78rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .status-badge.complete {
    background: #ecfdf5;
    color: #047857;
  }

  .status-badge.measuring {
    background: #fff7ed;
    color: #9a3412;
  }

  @media (max-width: 640px) {
    .pending-session {
      grid-template-columns: 1fr;
    }

    .pending-meta {
      justify-content: flex-start;
      text-align: left;
    }
  }
</style>
