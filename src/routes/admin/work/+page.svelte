<script lang="ts">
  import type { PageProps } from "./$types";
  import CopyLoginButton from "$lib/components/CopyLoginButton.svelte";
  import {
    formatDateTime,
    formatIssueName,
    formatProjectName,
  } from "$lib/format";

  type Issue = PageProps["data"]["notStartedIssues"][number];
  type Request = PageProps["data"]["pendingRequests"][number];

  let { data }: PageProps = $props();

  const issueHref = (issue: Issue): string =>
    `https://github.com/${issue.repository}/issues/${issue.number}`;
  const requestHref = (request: Request): string =>
    `https://github.com/${request.repository}/issues/${request.issueNumber}`;
  const requestTypeLabel = (type: Request["requestType"]): string =>
    ({ add: "追加", edit: "修正", exclude: "除外" })[type];
</script>

<section class="page-heading">
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

<section class="panel">
  <h2>稼働中</h2>
  {#if data.activeWorkers.length === 0}
    <p class="muted">現在稼働中の作業者はいません。</p>
  {:else}
    <div class="worker-card-grid">
      {#each data.activeWorkers as worker (worker.login)}
        <article class="worker-card">
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

<section class="panel">
  <h2>作業者別Issue</h2>
  {#if data.workers.length === 0}
    <p class="muted">表示できる作業者はいません。</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>作業者</th>
            <th>ID</th>
            <th>スキル</th>
            <th>稼働中</th>
            <th>Todo</th>
            <th>Issue</th>
          </tr>
        </thead>
        <tbody>
          {#each data.workers as worker (worker.login)}
            <tr>
              <td>
                <a href={`/workers/${worker.login}`}>{worker.displayName}</a>
              </td>
              <td>
                <div class="id-copy-cell">
                  <code>{worker.login}</code>
                  <CopyLoginButton login={worker.login} />
                </div>
              </td>
              <td>
                {#if worker.skills.length}
                  <div class="chip-list">
                    {#each worker.skills as skill (skill)}
                      <span class="chip">{skill}</span>
                    {/each}
                  </div>
                {:else}
                  <span class="muted">未登録</span>
                {/if}
              </td>
              <td>{worker.openSessions.length}</td>
              <td>{worker.todoIssueCount}</td>
              <td>
                {#if worker.issues.length === 0}
                  <span class="muted">-</span>
                {:else}
                  <ul class="plain-list">
                    {#each worker.issues as issue (`${worker.login}-${issue.repository}#${issue.number}`)}
                      <li>
                        <a href={issue.url} target="_blank" rel="noreferrer">
                          {formatProjectName(issue.repository)} / {formatIssueName(
                            issue.number,
                            issue.title,
                          )}
                        </a>
                        <span class="muted"> {issue.status ?? "-"}</span>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<section class="panel">
  <h2>未着手Issue</h2>
  {#if data.notStartedIssues.length === 0}
    <p class="muted">未着手のTodo Issueはありません。</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th>Issue</th>
            <th>Assignee</th>
            <th>報酬方式</th>
          </tr>
        </thead>
        <tbody>
          {#each data.notStartedIssues as issue (`${issue.repository}#${issue.number}`)}
            <tr>
              <td>{formatProjectName(issue.repository)}</td>
              <td>
                <a href={issueHref(issue)} target="_blank" rel="noreferrer">
                  {formatIssueName(issue.number, issue.title)}
                </a>
              </td>
              <td>
                {#if issue.assignees.length}
                  {issue.assignees.join(", ")}
                {:else}
                  <span class="bad">未担当</span>
                {/if}
              </td>
              <td>{issue.rewardMode ?? "-"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<section class="panel">
  <h2>未担当Issue</h2>
  {#if data.unassignedIssues.length === 0}
    <p class="muted">未担当のIssueはありません。</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th>Issue</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {#each data.unassignedIssues as issue (`${issue.repository}#${issue.number}`)}
            <tr>
              <td>{formatProjectName(issue.repository)}</td>
              <td>
                <a href={issueHref(issue)} target="_blank" rel="noreferrer">
                  {formatIssueName(issue.number, issue.title)}
                </a>
              </td>
              <td>{issue.status ?? "-"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<section class="panel">
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
              <td>{requestTypeLabel(request.requestType)}</td>
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
