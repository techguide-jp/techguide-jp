<script lang="ts">
  import type { PageProps } from "./$types";
  import { formatDateTime, formatYen } from "$lib/format";

  let { data }: PageProps = $props();
  const summary = $derived(data.summary);
  const snapshot = $derived(data.snapshot?.snapshot as { taxExcludedYen?: number } | undefined);
  const diff = $derived(
    snapshot?.taxExcludedYen === undefined || !summary
      ? null
      : summary.taxExcludedYen - snapshot.taxExcludedYen
  );
</script>

<section class="page-heading">
  <p class="eyebrow">settlement detail</p>
  <h1>{data.assignee} / {data.month}</h1>
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
            <td>
              <a href={line.issue.url} target="_blank" rel="noreferrer">
                {line.issue.repository}#{line.issue.number}
              </a>
              <span>{line.issue.title}</span>
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
    {#if summary.unclosedIssueSessions.length === 0}
      <p class="muted">未close Issueの稼働ログはありません。</p>
    {:else}
      <ul>
        {#each summary.unclosedIssueSessions as session (session.id)}
          <li>
            {session.repository}#{session.issueNumber}
            {formatDateTime(session.startedAt)} - {formatDateTime(session.endedAt)}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .page-heading {
    margin-bottom: 1rem;
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

  td span {
    display: block;
    color: #52605a;
  }
</style>
