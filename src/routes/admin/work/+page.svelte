<script lang="ts">
  import type { PageProps } from "./$types";
  import CopyLoginButton from "$lib/components/CopyLoginButton.svelte";
  import {
    formatDateTime,
    formatIssueName,
    formatProjectName,
  } from "$lib/format";

  type Request = PageProps["data"]["pendingRequests"][number];
  type IssueSummary = PageProps["data"]["issueSummary"];
  type CountBreakdown = IssueSummary["byStatus"][number];

  let { data }: PageProps = $props();

  const requestHref = (request: Request): string =>
    `https://github.com/${request.repository}/issues/${request.issueNumber}`;
  const requestTypeLabel = (type: Request["requestType"]): string =>
    ({ add: "追加", edit: "修正", exclude: "除外" })[type];
  const countLabel = (count: number): string => `${count.toLocaleString()}件`;
  const topBreakdowns = (
    breakdowns: CountBreakdown[],
    limit = 4,
  ): CountBreakdown[] => breakdowns.slice(0, limit);
  const remainingCount = (breakdowns: CountBreakdown[], limit = 4): number =>
    breakdowns.slice(limit).reduce((total, entry) => total + entry.count, 0);
  const statusTone = (label: string): string => {
    const normalized = label.toLowerCase();
    if (label === "未担当") return "unassigned";
    if (label.includes("未設定")) return "muted";
    if (normalized.includes("todo")) return "todo";
    if (normalized.includes("open")) return "open";
    if (normalized.includes("done") || normalized.includes("closed")) {
      return "done";
    }
    if (
      normalized.includes("progress") ||
      normalized.includes("doing") ||
      label.includes("稼働")
    ) {
      return "active";
    }
    return "neutral";
  };
  const repositoryTone = (label: string): string => {
    const tones = [
      "project-teal",
      "project-blue",
      "project-violet",
      "project-amber",
      "project-rose",
    ];
    const index = [...label].reduce(
      (total, char) => total + char.charCodeAt(0),
      0,
    );
    return tones[index % tones.length];
  };
  const assigneeTone = (label: string): string =>
    label === "未担当" ? "unassigned" : "assignee";
</script>

<section class="page-heading admin-work-heading">
  <div>
    <p class="eyebrow">admin work</p>
    <h1>稼働確認</h1>
  </div>
</section>

{#if data.projectFetchError}
  <section class="panel alert">
    <h2>GitHub Projectを取得できません</h2>
    <p>{data.projectFetchError}</p>
  </section>
{/if}

<section class="panel admin-work-section admin-overview-panel">
  <h2>Issue集計</h2>
  <div class="health-grid admin-metric-grid">
    <div class="health-card admin-metric-card" data-tone="total">
      <span>Project内Issue</span>
      <strong>{countLabel(data.issueSummary.total)}</strong>
    </div>
    <div class="health-card admin-metric-card" data-tone="open">
      <span>OPEN</span>
      <strong>{countLabel(data.issueSummary.open)}</strong>
    </div>
    <div class="health-card admin-metric-card" data-tone="todo">
      <span>未着手Todo</span>
      <strong>{countLabel(data.notStartedIssueSummary.total)}</strong>
    </div>
    <div class="health-card admin-metric-card" data-tone="unassigned">
      <span>未担当</span>
      <strong>{countLabel(data.unassignedIssueSummary.total)}</strong>
    </div>
  </div>
</section>

<section class="panel admin-work-section" data-tone="active">
  <h2>稼働中</h2>
  {#if data.activeWorkers.length === 0}
    <p class="muted">現在稼働中の作業者はいません。</p>
  {:else}
    <div class="worker-card-grid">
      {#each data.activeWorkers as worker (worker.login)}
        <article class="worker-card active-worker-card">
          <div class="worker-card-heading">
            <div>
              <h3>
                <a href={`/workers/${worker.login}`}>{worker.displayName}</a>
              </h3>
              <p class="muted">{worker.login}</p>
            </div>
            <CopyLoginButton login={worker.login} />
          </div>
          <div class="chip-list" aria-label={`${worker.displayName}のスキル`}>
            {#each worker.skills as skill (skill)}
              <span class="chip">{skill}</span>
            {/each}
          </div>
          <div class="session-list">
            {#each worker.openSessions as session (session.id)}
              <div class="session-row compact-row">
                <div class="session-issue">
                  <span>
                    <small>Project</small>
                    <strong>{formatProjectName(session.repository)}</strong>
                  </span>
                  <span>
                    <small>Issue</small>
                    <a
                      href={`https://github.com/${session.repository}/issues/${session.issueNumber}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {formatIssueName(session.issueNumber, session.issueTitle)}
                    </a>
                  </span>
                  <small>開始 {formatDateTime(session.startedAt)}</small>
                </div>
              </div>
            {/each}
          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>

<section class="panel admin-work-section" data-tone="workers">
  <h2>作業者別集計</h2>
  {#if data.workers.length === 0}
    <p class="muted">表示できる作業者はいません。</p>
  {:else}
    <div class="worker-card-grid">
      {#each data.workers as worker (worker.login)}
        <article
          class={`worker-card worker-summary-card ${worker.openSessions.length ? "worker-card-active" : ""}`}
        >
          <div class="worker-card-heading">
            <div>
              <h3>
                <a href={`/workers/${worker.login}`}>{worker.displayName}</a>
              </h3>
              <code>{worker.login}</code>
            </div>
            <CopyLoginButton login={worker.login} />
          </div>
          <div class="worker-summary-metrics">
            <div data-tone={worker.openSessions.length ? "active" : "idle"}>
              <span>稼働中</span>
              <strong>{countLabel(worker.openSessions.length)}</strong>
            </div>
            <div data-tone="total">
              <span>担当Issue</span>
              <strong>{countLabel(worker.issueSummary.total)}</strong>
            </div>
            <div data-tone="open">
              <span>OPEN</span>
              <strong>{countLabel(worker.issueSummary.open)}</strong>
            </div>
            <div data-tone="todo">
              <span>Todo</span>
              <strong>{countLabel(worker.issueSummary.todo)}</strong>
            </div>
          </div>
          <div class="summary-group">
            <span class="summary-label">Skills</span>
            {#if worker.skills.length}
              <div class="chip-list">
                {#each worker.skills as skill (skill)}
                  <span class="chip">{skill}</span>
                {/each}
              </div>
            {:else}
              <span class="muted">未登録</span>
            {/if}
          </div>
          <div class="summary-group">
            <span class="summary-label">Status</span>
            <div class="summary-chip-list">
              {#each topBreakdowns(worker.issueSummary.byStatus) as entry (entry.label)}
                <span class="summary-chip" data-tone={statusTone(entry.label)}
                  >{entry.label}: {countLabel(entry.count)}</span
                >
              {/each}
              {#if remainingCount(worker.issueSummary.byStatus)}
                <span class="summary-chip muted-chip"
                  >他 {countLabel(
                    remainingCount(worker.issueSummary.byStatus),
                  )}</span
                >
              {/if}
            </div>
          </div>
          <div class="summary-group">
            <span class="summary-label">Project</span>
            <div class="summary-chip-list">
              {#each topBreakdowns(worker.issueSummary.byRepository, 3) as entry (entry.label)}
                <span
                  class="summary-chip"
                  data-tone={repositoryTone(entry.label)}
                  >{formatProjectName(entry.label)}: {countLabel(
                    entry.count,
                  )}</span
                >
              {/each}
              {#if remainingCount(worker.issueSummary.byRepository, 3)}
                <span class="summary-chip muted-chip"
                  >他 {countLabel(
                    remainingCount(worker.issueSummary.byRepository, 3),
                  )}</span
                >
              {/if}
            </div>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>

<section class="panel admin-work-section" data-tone="todo">
  <h2>未着手Issue</h2>
  {#if data.notStartedIssueSummary.total === 0}
    <p class="muted">未着手のTodo Issueはありません。</p>
  {:else}
    <div class="issue-summary-block" data-tone="todo">
      <strong>{countLabel(data.notStartedIssueSummary.total)}</strong>
      <div class="summary-group">
        <span class="summary-label">Project</span>
        <div class="summary-chip-list">
          {#each topBreakdowns(data.notStartedIssueSummary.byRepository) as entry (entry.label)}
            <span class="summary-chip" data-tone={repositoryTone(entry.label)}
              >{formatProjectName(entry.label)}: {countLabel(entry.count)}</span
            >
          {/each}
          {#if remainingCount(data.notStartedIssueSummary.byRepository)}
            <span class="summary-chip muted-chip"
              >他 {countLabel(
                remainingCount(data.notStartedIssueSummary.byRepository),
              )}</span
            >
          {/if}
        </div>
      </div>
      <div class="summary-group">
        <span class="summary-label">Assignee</span>
        <div class="summary-chip-list">
          {#each topBreakdowns(data.notStartedIssueSummary.byAssignee) as entry (entry.label)}
            <span class="summary-chip" data-tone={assigneeTone(entry.label)}
              >{entry.label}: {countLabel(entry.count)}</span
            >
          {/each}
          {#if remainingCount(data.notStartedIssueSummary.byAssignee)}
            <span class="summary-chip muted-chip"
              >他 {countLabel(
                remainingCount(data.notStartedIssueSummary.byAssignee),
              )}</span
            >
          {/if}
        </div>
      </div>
    </div>
  {/if}
</section>

<section class="panel admin-work-section" data-tone="unassigned">
  <h2>未担当Issue</h2>
  {#if data.unassignedIssueSummary.total === 0}
    <p class="muted">未担当のIssueはありません。</p>
  {:else}
    <div class="issue-summary-block" data-tone="unassigned">
      <strong>{countLabel(data.unassignedIssueSummary.total)}</strong>
      <div class="summary-group">
        <span class="summary-label">Status</span>
        <div class="summary-chip-list">
          {#each topBreakdowns(data.unassignedIssueSummary.byStatus) as entry (entry.label)}
            <span class="summary-chip" data-tone={statusTone(entry.label)}
              >{entry.label}: {countLabel(entry.count)}</span
            >
          {/each}
          {#if remainingCount(data.unassignedIssueSummary.byStatus)}
            <span class="summary-chip muted-chip"
              >他 {countLabel(
                remainingCount(data.unassignedIssueSummary.byStatus),
              )}</span
            >
          {/if}
        </div>
      </div>
      <div class="summary-group">
        <span class="summary-label">Project</span>
        <div class="summary-chip-list">
          {#each topBreakdowns(data.unassignedIssueSummary.byRepository) as entry (entry.label)}
            <span class="summary-chip" data-tone={repositoryTone(entry.label)}
              >{formatProjectName(entry.label)}: {countLabel(entry.count)}</span
            >
          {/each}
          {#if remainingCount(data.unassignedIssueSummary.byRepository)}
            <span class="summary-chip muted-chip"
              >他 {countLabel(
                remainingCount(data.unassignedIssueSummary.byRepository),
              )}</span
            >
          {/if}
        </div>
      </div>
    </div>
  {/if}
</section>

<section class="panel admin-work-section" data-tone="requests">
  <h2>未処理の修正申請</h2>
  {#if data.pendingRequests.length === 0}
    <p class="muted">未処理の修正申請はありません。</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>作業者</th>
            <th>Issue</th>
            <th>種別</th>
            <th>希望時刻</th>
            <th>理由</th>
          </tr>
        </thead>
        <tbody>
          {#each data.pendingRequests as request (request.id)}
            <tr>
              <td>
                <a href={`/workers/${request.assigneeLogin}`}
                  >{request.assigneeLogin}</a
                >
              </td>
              <td>
                <a href={requestHref(request)} target="_blank" rel="noreferrer">
                  {formatProjectName(request.repository)} / {formatIssueName(
                    request.issueNumber,
                    request.issueTitle,
                  )}
                </a>
              </td>
              <td>
                <span
                  class="request-type-badge"
                  data-type={request.requestType}
                >
                  {requestTypeLabel(request.requestType)}
                </span>
              </td>
              <td>
                {formatDateTime(request.requestedStartedAt)} - {formatDateTime(
                  request.requestedEndedAt,
                )}
              </td>
              <td>{request.reason}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
