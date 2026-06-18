<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import { formatDateTime, formatIssueName, formatProjectName, formatYen } from "$lib/format";
  import { addMonths, currentJstMonth, formatMonthLabel } from "$lib/month";

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

  const summary = $derived(data.summary);
  const snapshot = $derived(data.snapshot?.snapshot as { taxExcludedYen?: number } | undefined);
  const actionMessage = $derived((form as ActionData | undefined)?.message);
  const submission = $derived(data.submission);
  const canSubmitWork = $derived(data.user?.login === data.assignee);
  const diff = $derived(
    snapshot?.taxExcludedYen === undefined || !summary
      ? null
      : summary.taxExcludedYen - snapshot.taxExcludedYen
  );
  const formatProjectStatus = (status: string | null): string =>
    status === "In Progress" ? "作業中" : status ?? "-";
  const formatUnsettledReason = (reason: "open_in_progress" | "closed_not_done"): string =>
    reason === "closed_not_done" ? "Status未完了" : "未close";
  const sessionMinutes = (startedAt: Date | string, endedAt: Date | string | null): number => {
    if (!endedAt) return 0;
    return Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000));
  };
  const settledWorkLogs = $derived(
    summary
      ? summary.lines
          .flatMap((line) =>
            line.sessions.map((session) => ({
              line,
              session,
              workMinutes: sessionMinutes(session.startedAt, session.endedAt),
              source: session.id.startsWith("request-") ? "追加申請" : "記録"
            }))
          )
          .sort((a, b) => new Date(a.session.startedAt).getTime() - new Date(b.session.startedAt).getTime())
      : []
  );
  const unsettledWorkLogs = $derived(
    summary
      ? [
          ...summary.unsettledProjectIssues.flatMap((line) =>
            line.sessions.map((session) => ({
              issue: line.issue,
              session,
              workMinutes: sessionMinutes(session.startedAt, session.endedAt)
            }))
          ),
          ...summary.unsettledIssueSessions.map((session) => ({
            issue: null,
            session,
            workMinutes: sessionMinutes(session.startedAt, session.endedAt)
          }))
        ].sort((a, b) => new Date(a.session.startedAt).getTime() - new Date(b.session.startedAt).getTime())
      : []
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
        <p class="ok">この月の稼働は確定申請済みです。申請後に内容が変わった場合は再申請が必要です。</p>
      {:else}
        <form method="POST" action="?/submitWork" use:enhance={enhanceAction("submit-work")}>
          <ActionSubmit
            actionName="submit-work"
            {pendingAction}
            label={submission ? "変更内容で再申請" : "この月の稼働を確定して申請"}
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
              <td>{log.session.endedAt ? formatDateTime(log.session.endedAt) : "計測中"}</td>
              <td>{log.session.endedAt ? `${log.workMinutes}分` : "-"}</td>
              <td>
                <span class={`status-badge ${log.line.issue.rewardMode === "ハイブリッド" ? "complete" : "reference"}`}>
                  {log.line.issue.rewardMode === "ハイブリッド" ? "時間精算" : "参考"}
                </span>
              </td>
              <td>{log.source}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <section class="panel">
    <h2>未精算予定</h2>
    {#if summary.unsettledProjectIssues.length === 0 && summary.unsettledIssueSessions.length === 0}
      <p class="muted">未精算予定のProject Issueや稼働ログはありません。</p>
    {:else}
      <ul class="pending-list">
        {#each summary.unsettledProjectIssues as line (`${line.issue.repository}#${line.issue.number}`)}
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
                      {formatIssueName(log.session.issueNumber, log.issue?.title ?? log.session.issueTitle)}
                    </a>
                  </td>
                  <td>{formatDateTime(log.session.startedAt)}</td>
                  <td>{log.session.endedAt ? formatDateTime(log.session.endedAt) : "計測中"}</td>
                  <td>{log.session.endedAt ? `${log.workMinutes}分` : "-"}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}
  </section>
{/if}
