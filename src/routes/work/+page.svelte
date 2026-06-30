<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import StatusSyncPanel from "$lib/components/StatusSyncPanel.svelte";
  import WorkChangeDialog, {
    type WorkChangeDialogState,
  } from "$lib/components/WorkChangeDialog.svelte";
  import {
    formatDateTime,
    formatIssueName,
    formatProjectName,
  } from "$lib/format";

  type Issue = PageProps["data"]["issues"][number];
  type WorkSession = PageProps["data"]["sessions"][number];

  let { data, form }: PageProps = $props();
  let pendingAction = $state<string | null>(null);
  let changeDialog = $state<WorkChangeDialogState | null>(null);

  const openKeySet = $derived(
    new Set(
      data.openSessions.map(
        (session) => `${session.repository}#${session.issueNumber}`,
      ),
    ),
  );

  const enhanceAction =
    (name: string, closeDialogOnSuccess = false): SubmitFunction =>
    () => {
      pendingAction = name;
      return async ({ result, update }) => {
        await update();
        pendingAction = null;
        if (closeDialogOnSuccess && result.type === "success") {
          changeDialog = null;
        }
      };
    };

  const actionMessage = $derived((form as ActionData | undefined)?.message);

  const issueKey = (issue: Issue): string =>
    `${issue.repository}#${issue.number}`;
  const canStartIssue = (issue: Issue): boolean =>
    issue.state !== "CLOSED" && issue.status !== "Done";
  const issueWorkState = (issue: Issue, key: string): string => {
    if (openKeySet.has(key)) return "稼働中";
    return canStartIssue(issue) ? "待機" : "完了済み";
  };
  const issueLabel = (issue: Issue): string =>
    `${formatProjectName(issue.repository)} / ${formatIssueName(issue.number, issue.title)}`;
  const sessionIssueKey = (session: WorkSession): string =>
    `${session.repository}#${session.issueNumber}`;
  const sessionIssueLabel = (session: WorkSession): string =>
    `${formatProjectName(session.repository)} / ${formatIssueName(session.issueNumber, session.issueTitle)}`;
  const toDatetimeLocal = (date: Date | string | null): string => {
    if (!date) return "";
    const value = typeof date === "string" ? new Date(date) : date;
    if (Number.isNaN(value.getTime())) return "";
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(value)
        .map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  };

  const openAddDialog = (issue: Issue) => {
    changeDialog = {
      requestType: "add",
      issueKey: issueKey(issue),
      issueLabel: issueLabel(issue),
      startedAt: "",
      endedAt: "",
    };
  };

  const openEditDialog = (session: WorkSession) => {
    changeDialog = {
      requestType: "edit",
      issueKey: sessionIssueKey(session),
      issueLabel: sessionIssueLabel(session),
      targetSessionId: session.id,
      startedAt: toDatetimeLocal(session.startedAt),
      endedAt: toDatetimeLocal(session.endedAt),
    };
  };

  const openExcludeDialog = (session: WorkSession) => {
    changeDialog = {
      requestType: "exclude",
      issueKey: sessionIssueKey(session),
      issueLabel: sessionIssueLabel(session),
      targetSessionId: session.id,
    };
  };
</script>

<section class="page-heading">
  <div>
    <p class="eyebrow">work log</p>
    <h1>稼働</h1>
  </div>
  {#if actionMessage}
    <p class="notice">{actionMessage}</p>
  {/if}
</section>

{#if data.projectFetchError}
  <section class="panel alert">
    <h2>GitHub Projectを取得できません</h2>
    <p>{data.projectFetchError}</p>
  </section>
{:else if data.health.missingFields.length || data.health.invalidFields.length}
  <section class="alert">
    Projectフィールドに不足があります。管理者に確認してください。
  </section>
{/if}

{#if data.statusSyncs.length}
  <StatusSyncPanel
    statusSyncs={data.statusSyncs}
    {pendingAction}
    {enhanceAction}
    alert
  />
{/if}

<section class="panel">
  <h2>稼働中</h2>
  {#if data.openSessions.length === 0}
    <p class="muted">稼働中のIssueはありません。</p>
  {:else}
    <div class="session-list">
      {#each data.openSessions as session (session.id)}
        <form
          method="POST"
          action="?/stop"
          use:enhance={enhanceAction(`stop-${session.id}`)}
          class="session-row"
        >
          <input type="hidden" name="sessionId" value={session.id} />
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
          <ActionSubmit
            actionName={`stop-${session.id}`}
            {pendingAction}
            label="終了"
            pendingLabel="終了中..."
            variant="danger"
          />
        </form>
      {/each}
    </div>
  {/if}
</section>

<section class="panel">
  <h2>Project内Issue</h2>
  {#if data.projectFetchError}
    <p class="muted">Issue一覧を表示できません。</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th>Issue</th>
            <th>Status</th>
            <th>報酬方式</th>
            <th>単価</th>
            <th>状態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {#each data.issues as issue (`${issue.repository}#${issue.number}`)}
            {@const key = `${issue.repository}#${issue.number}`}
            {@const canStart = canStartIssue(issue)}
            <tr>
              <td>{formatProjectName(issue.repository)}</td>
              <td>
                <a href={issue.url} target="_blank" rel="noreferrer">
                  {formatIssueName(issue.number, issue.title)}
                </a>
              </td>
              <td>{issue.status ?? "-"}</td>
              <td>{issue.rewardMode ?? "-"}</td>
              <td
                >{issue.hourlyRateYen
                  ? `${issue.hourlyRateYen.toLocaleString()}円`
                  : "-"}</td
              >
              <td>{issueWorkState(issue, key)}</td>
              <td>
                <div class="row-actions">
                  <form
                    method="POST"
                    action="?/start"
                    use:enhance={enhanceAction(`start-${key}`)}
                  >
                    <input
                      type="hidden"
                      name="repository"
                      value={issue.repository}
                    />
                    <input
                      type="hidden"
                      name="issueNumber"
                      value={issue.number}
                    />
                    <ActionSubmit
                      actionName={`start-${key}`}
                      {pendingAction}
                      label="開始"
                      pendingLabel="開始中..."
                      disabled={openKeySet.has(key) || !canStart}
                    />
                  </form>
                  <button
                    class="button secondary"
                    type="button"
                    onclick={() => openAddDialog(issue)}
                  >
                    追加申請
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<section class="panel">
  <h2>稼働ログ</h2>
  {#if data.sessions.length === 0}
    <p class="muted">修正・除外できる稼働ログはありません。</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th>Issue</th>
            <th>開始</th>
            <th>終了</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {#each data.sessions as session (session.id)}
            {@const isMeasuring = !session.endedAt}
            <tr>
              <td>{formatProjectName(session.repository)}</td>
              <td>
                <a
                  href={`https://github.com/${session.repository}/issues/${session.issueNumber}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {formatIssueName(session.issueNumber, session.issueTitle)}
                </a>
              </td>
              <td>{formatDateTime(session.startedAt)}</td>
              <td>{isMeasuring ? "計測中" : formatDateTime(session.endedAt)}</td
              >
              <td>
                {#if isMeasuring}
                  <span class="muted">終了後に申請可</span>
                {:else}
                  <div class="row-actions compact">
                    <button
                      class="button secondary"
                      type="button"
                      disabled={Boolean(data.projectFetchError)}
                      onclick={() => openEditDialog(session)}
                    >
                      修正
                    </button>
                    <button
                      class="button danger ghost"
                      type="button"
                      disabled={Boolean(data.projectFetchError)}
                      onclick={() => openExcludeDialog(session)}
                    >
                      除外
                    </button>
                  </div>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

{#if changeDialog}
  <WorkChangeDialog
    dialog={changeDialog}
    {pendingAction}
    {enhanceAction}
    close={() => (changeDialog = null)}
  />
{/if}
