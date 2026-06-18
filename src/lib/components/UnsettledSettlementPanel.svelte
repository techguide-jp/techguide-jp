<script lang="ts">
  import {
    formatDateTime,
    formatIssueName,
    formatProjectName,
  } from "$lib/format";
  import type {
    SettlementSummary,
    UnsettledProjectIssueReason,
  } from "$lib/server/settlements/settlementTypes";

  type Props = {
    summary: SettlementSummary;
  };

  let { summary }: Props = $props();

  const formatProjectStatus = (status: string | null): string =>
    status === "In Progress" ? "作業中" : (status ?? "-");
  const formatUnsettledReason = (
    reason: UnsettledProjectIssueReason,
  ): string => (reason === "closed_not_done" ? "Status未完了" : "未close");
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

  const unsettledWorkLogs = $derived(
    [
      ...summary.unsettledProjectIssues.flatMap((line) =>
        line.sessions.map((session) => ({
          issue: line.issue,
          session,
          workMinutes: sessionMinutes(session.startedAt, session.endedAt),
        })),
      ),
      ...summary.unsettledIssueSessions.map((session) => ({
        issue: null,
        session,
        workMinutes: sessionMinutes(session.startedAt, session.endedAt),
      })),
    ].sort(
      (a, b) =>
        new Date(a.session.startedAt).getTime() -
        new Date(b.session.startedAt).getTime(),
    ),
  );
</script>

<section class="panel">
  <h2>未精算予定</h2>
  {#if summary.unsettledProjectIssues.length === 0 && summary.unsettledIssueSessions.length === 0}
    <p class="muted">未精算予定のProject Issueや稼働ログはありません。</p>
  {:else}
    <ul class="pending-list">
      {#each summary.unsettledProjectIssues as line (`${line.issue.repository}#${line.issue.number}`)}
        <li class="pending-session">
          <div class="pending-issue">
            <span class="project-name"
              >{formatProjectName(line.issue.repository)}</span
            >
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
              <small>理由</small>
              <strong>{formatUnsettledReason(line.reason)}</strong>
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
      {#each summary.unsettledIssueSessions as session (session.id)}
        <li class="pending-session">
          <div class="pending-issue">
            <span class="project-name"
              >{formatProjectName(session.repository)}</span
            >
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
              <strong
                >{session.endedAt
                  ? formatDateTime(session.endedAt)
                  : "計測中"}</strong
              >
            </span>
            <span
              class={`status-badge ${session.endedAt ? "complete" : "measuring"}`}
            >
              {session.endedAt ? "終了済み" : "計測中"}
            </span>
          </div>
        </li>
      {/each}
    </ul>
    {#if unsettledWorkLogs.length}
      <div class="log-detail-block">
        <h3>未精算予定の稼働ログ</h3>
        <table class="log-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Issue</th>
              <th>開始</th>
              <th>終了</th>
              <th>稼働</th>
            </tr>
          </thead>
          <tbody>
            {#each unsettledWorkLogs as log (log.session.id)}
              <tr>
                <td>{formatProjectName(log.session.repository)}</td>
                <td>
                  <a
                    href={`https://github.com/${log.session.repository}/issues/${log.session.issueNumber}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {formatIssueName(
                      log.session.issueNumber,
                      log.issue?.title ?? log.session.issueTitle,
                    )}
                  </a>
                </td>
                <td>{formatDateTime(log.session.startedAt)}</td>
                <td
                  >{log.session.endedAt
                    ? formatDateTime(log.session.endedAt)
                    : "計測中"}</td
                >
                <td>{log.session.endedAt ? `${log.workMinutes}分` : "-"}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</section>
