<script lang="ts">
  import {
    formatDateTime,
    formatIssueName,
    formatProjectName,
  } from "$lib/format";
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
          workMinutes: sessionMinutes(session.startedAt, session.endedAt),
          source: session.id.startsWith("request-") ? "追加申請" : "記録",
        })),
      )
      .sort(
        (a, b) =>
          new Date(a.session.startedAt).getTime() -
          new Date(b.session.startedAt).getTime(),
      ),
  );
</script>

<section class="panel">
  <h2>稼働ログ</h2>
  {#if settledWorkLogs.length === 0}
    <p class="muted">精算対象Issueに紐づく稼働ログはありません。</p>
  {:else}
    <table class="log-table">
      <thead>
        <tr>
          <th>Project</th>
          <th>Issue</th>
          <th>開始</th>
          <th>終了</th>
          <th>稼働</th>
          <th>扱い</th>
          <th>由来</th>
        </tr>
      </thead>
      <tbody>
        {#each settledWorkLogs as log (`${log.session.id}-${log.line.issue.repository}#${log.line.issue.number}`)}
          <tr>
            <td>{formatProjectName(log.line.issue.repository)}</td>
            <td>
              <a href={log.line.issue.url} target="_blank" rel="noreferrer">
                {formatIssueName(log.line.issue.number, log.line.issue.title)}
              </a>
            </td>
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
  {/if}
</section>
