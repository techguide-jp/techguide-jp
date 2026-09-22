<script lang="ts">
  import {
    formatDateTime,
    formatIssueName,
    formatProjectName,
  } from "$lib/format";
  import {
    byUpdatedAtDescending,
    RECENT_WORK_LOG_COUNT,
  } from "$lib/workListDisplay";
  import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";

  type Props = {
    summary: SettlementSummary;
  };

  let { summary }: Props = $props();

  const sessionMinutes = (
    startedAt: Date | string,
    endedAt: Date | string | null,
  ): number => {
    if (!endedAt) return 0;
    return Math.max(
      0,
      Math.round(
        (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000,
      ),
    );
  };

  const settledWorkLogs = $derived(
    summary.lines
      .flatMap((line) =>
        line.sessions.map((session) => ({
          line,
          session,
          workMinutes:
            line.sessionMinutesById?.[session.id] ??
            sessionMinutes(session.startedAt, session.endedAt),
          source: session.id.startsWith("request-") ? "追加申請" : "記録",
        })),
      )
      .sort((a, b) => byUpdatedAtDescending(a.session, b.session)),
  );
</script>

{#snippet logTable(logs: typeof settledWorkLogs)}
  <div class="table-wrap">
    <table class="log-table">
      <thead>
        <tr>
          <th>Project</th>
          <th>Issue</th>
          <th>更新日時</th>
          <th>開始</th>
          <th>終了</th>
          <th>稼働</th>
          <th>扱い</th>
          <th>由来</th>
        </tr>
      </thead>
      <tbody>
        {#each logs as log (`${log.session.id}-${log.line.issue.repository}#${log.line.issue.number}`)}
          <tr>
            <td>{formatProjectName(log.line.issue.repository)}</td>
            <td>
              <a href={log.line.issue.url} target="_blank" rel="noreferrer">
                {formatIssueName(log.line.issue.number, log.line.issue.title)}
              </a>
            </td>
            <td>{formatDateTime(log.session.updatedAt)}</td>
            <td>{formatDateTime(log.session.startedAt)}</td>
            <td
              >{log.session.endedAt
                ? formatDateTime(log.session.endedAt)
                : "計測中"}</td
            >
            <td>{log.session.endedAt ? `${log.workMinutes}分` : "-"}</td>
            <td>
              <span
                class={`status-badge ${log.line.issue.rewardMode === "ハイブリッド" ? "complete" : "reference"}`}
              >
                {log.line.issue.rewardMode === "ハイブリッド"
                  ? "時間精算"
                  : "参考"}
              </span>
            </td>
            <td>{log.source}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/snippet}

<section class="panel">
  <h2>稼働ログ</h2>
  {#if settledWorkLogs.length === 0}
    <p class="muted">精算対象Issueに紐づく稼働ログはありません。</p>
  {:else}
    <p class="muted">
      更新日時が新しい順に最新{RECENT_WORK_LOG_COUNT}件を表示します。
    </p>
    {@render logTable(settledWorkLogs.slice(0, RECENT_WORK_LOG_COUNT))}
    {#if settledWorkLogs.length > RECENT_WORK_LOG_COUNT}
      <details>
        <summary
          >過去の稼働ログを表示（{settledWorkLogs.length -
            RECENT_WORK_LOG_COUNT}件）</summary
        >
        {@render logTable(settledWorkLogs.slice(RECENT_WORK_LOG_COUNT))}
      </details>
    {/if}
  {/if}
</section>

<style>
  details {
    margin-top: 1rem;
  }
  summary {
    cursor: pointer;
    padding: 0.75rem 0;
    font-weight: 600;
  }
</style>
