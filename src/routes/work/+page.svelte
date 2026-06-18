<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import { formatDateTime, formatIssueName, formatProjectName } from "$lib/format";

  type Issue = PageProps["data"]["issues"][number];
  type WorkSession = PageProps["data"]["sessions"][number];
  type ChangeDialog =
    | {
        requestType: "add";
        issueKey: string;
        issueLabel: string;
        startedAt: string;
        endedAt: string;
      }
    | {
        requestType: "edit";
        issueKey: string;
        issueLabel: string;
        targetSessionId: string;
        startedAt: string;
        endedAt: string;
      }
    | {
        requestType: "exclude";
        issueKey: string;
        issueLabel: string;
        targetSessionId: string;
      };

  let { data, form }: PageProps = $props();
  let pendingAction = $state<string | null>(null);
  let changeDialog = $state<ChangeDialog | null>(null);

  const openKeySet = $derived(
    new Set(data.openSessions.map((session) => `${session.repository}#${session.issueNumber}`))
  );

  const enhanceAction = (name: string, closeDialogOnSuccess = false): SubmitFunction =>
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
  const dialogTitle = $derived(
    changeDialog
      ? {
          add: "稼働ログ追加申請",
          edit: "稼働ログ修正申請",
          exclude: "稼働ログ除外申請"
        }[changeDialog.requestType]
      : ""
  );

  const issueKey = (issue: Issue): string => `${issue.repository}#${issue.number}`;
  const issueLabel = (issue: Issue): string =>
    `${formatProjectName(issue.repository)} / ${formatIssueName(issue.number, issue.title)}`;
  const sessionIssueKey = (session: WorkSession): string => `${session.repository}#${session.issueNumber}`;
  const sessionIssueLabel = (session: WorkSession): string =>
    `${formatProjectName(session.repository)} / ${formatIssueName(session.issueNumber, session.issueTitle)}`;
  const toDatetimeLocal = (date: Date | string | null): string => {
    if (!date) return "";
    const value = typeof date === "string" ? new Date(date) : date;
    if (Number.isNaN(value.getTime())) return "";
    const offset = value.getTimezoneOffset() * 60_000;
    return new Date(value.getTime() - offset).toISOString().slice(0, 16);
  };

  const openAddDialog = (issue: Issue) => {
    changeDialog = {
      requestType: "add",
      issueKey: issueKey(issue),
      issueLabel: issueLabel(issue),
      startedAt: "",
      endedAt: ""
    };
  };

  const openEditDialog = (session: WorkSession) => {
    changeDialog = {
      requestType: "edit",
      issueKey: sessionIssueKey(session),
      issueLabel: sessionIssueLabel(session),
      targetSessionId: session.id,
      startedAt: toDatetimeLocal(session.startedAt),
      endedAt: toDatetimeLocal(session.endedAt)
    };
  };

  const openExcludeDialog = (session: WorkSession) => {
    changeDialog = {
      requestType: "exclude",
      issueKey: sessionIssueKey(session),
      issueLabel: sessionIssueLabel(session),
      targetSessionId: session.id
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

{#if data.health.missingFields.length || data.health.invalidFields.length}
  <section class="alert">
    Projectフィールドに不足があります。管理者に確認してください。
  </section>
{/if}

<section class="panel">
  <h2>稼働中</h2>
  {#if data.openSessions.length === 0}
    <p class="muted">稼働中のIssueはありません。</p>
  {:else}
    <div class="session-list">
      {#each data.openSessions as session (session.id)}
        <form method="POST" action="?/stop" use:enhance={enhanceAction(`stop-${session.id}`)} class="session-row">
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
          <tr>
            <td>{formatProjectName(issue.repository)}</td>
            <td>
              <a href={issue.url} target="_blank" rel="noreferrer">
                {formatIssueName(issue.number, issue.title)}
              </a>
            </td>
            <td>{issue.status ?? "-"}</td>
            <td>{issue.rewardMode ?? "-"}</td>
            <td>{issue.hourlyRateYen ? `${issue.hourlyRateYen.toLocaleString()}円` : "-"}</td>
            <td>{openKeySet.has(key) ? "稼働中" : "待機"}</td>
            <td>
              <div class="row-actions">
                <form method="POST" action="?/start" use:enhance={enhanceAction(`start-${key}`)}>
                  <input type="hidden" name="repository" value={issue.repository} />
                  <input type="hidden" name="issueNumber" value={issue.number} />
                  <ActionSubmit
                    actionName={`start-${key}`}
                    {pendingAction}
                    label="開始"
                    pendingLabel="開始中..."
                    disabled={openKeySet.has(key)}
                  />
                </form>
                <button class="button secondary" type="button" onclick={() => openAddDialog(issue)}>
                  追加申請
                </button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
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
              <td>{isMeasuring ? "計測中" : formatDateTime(session.endedAt)}</td>
              <td>
                {#if isMeasuring}
                  <span class="muted">終了後に申請可</span>
                {:else}
                  <div class="row-actions compact">
                    <button class="button secondary" type="button" onclick={() => openEditDialog(session)}>
                      修正
                    </button>
                    <button class="button danger ghost" type="button" onclick={() => openExcludeDialog(session)}>
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
  <div class="modal-backdrop">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="change-dialog-title">
      <div class="modal-header">
        <div>
          <p class="eyebrow">{changeDialog.issueLabel}</p>
          <h2 id="change-dialog-title">{dialogTitle}</h2>
        </div>
        <button class="icon-button" type="button" aria-label="閉じる" onclick={() => (changeDialog = null)}>
          ×
        </button>
      </div>
      <form
        method="POST"
        action="?/requestChange"
        use:enhance={enhanceAction("request-change", true)}
        class="request-form"
      >
        <input type="hidden" name="requestType" value={changeDialog.requestType} />
        <input type="hidden" name="issueKey" value={changeDialog.issueKey} />
        {#if changeDialog.requestType !== "add"}
          <input type="hidden" name="targetSessionId" value={changeDialog.targetSessionId} />
        {/if}
        {#if changeDialog.requestType !== "exclude"}
          <label>
            開始
            <input name="requestedStartedAt" type="datetime-local" value={changeDialog.startedAt ?? ""} required />
          </label>
          <label>
            終了
            <input name="requestedEndedAt" type="datetime-local" value={changeDialog.endedAt ?? ""} required />
          </label>
        {/if}
        <label class="wide">
          理由
          <textarea name="reason" rows="4" required></textarea>
        </label>
        <div class="form-actions">
          <button class="button secondary ghost" type="button" onclick={() => (changeDialog = null)}>
            キャンセル
          </button>
          <ActionSubmit
            actionName="request-change"
            {pendingAction}
            label="申請"
            pendingLabel="申請中..."
            variant="secondary"
          />
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .page-heading,
  .panel {
    margin-bottom: 1rem;
  }

  .page-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
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

  .panel {
    background: white;
    border: 1px solid #d8ded7;
    border-radius: 8px;
    padding: 1rem;
  }

  .alert,
  .notice {
    border-radius: 6px;
    padding: 0.7rem 0.85rem;
  }

  .alert {
    margin-bottom: 1rem;
    background: #fff7ed;
    color: #9a3412;
  }

  .notice {
    background: #ecfdf5;
    color: #047857;
  }

  .muted,
  small {
    color: #66736d;
  }

  .session-list {
    display: grid;
    gap: 0.7rem;
  }

  .session-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.8rem;
  }

  .session-issue,
  .session-issue span {
    display: grid;
    gap: 0.2rem;
  }

  .session-issue a,
  td a {
    width: fit-content;
    font-weight: 700;
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .row-actions.compact .button {
    min-width: 4.5rem;
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  th,
  td {
    border-bottom: 1px solid #e5e7eb;
    padding: 0.7rem;
    text-align: left;
    vertical-align: top;
  }

  .request-form {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.8rem;
  }

  label {
    display: grid;
    gap: 0.35rem;
    font-weight: 700;
  }

  input,
  textarea {
    border: 1px solid #cfd8d3;
    border-radius: 6px;
    padding: 0.55rem;
    font: inherit;
  }

  .wide,
  .form-actions {
    grid-column: 1 / -1;
  }

  .form-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    justify-content: flex-end;
  }

  .button {
    min-width: 8rem;
    border: 0;
    border-radius: 6px;
    padding: 0.55rem 0.9rem;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .button.secondary {
    background: #e5e7eb;
    color: #111827;
  }

  .button.danger {
    background: #b91c1c;
    color: white;
  }

  .button.ghost {
    border: 1px solid #cfd8d3;
    background: white;
    color: #111827;
  }

  .button.danger.ghost {
    border-color: #fecaca;
    color: #991b1b;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: rgb(15 23 42 / 0.35);
  }

  .modal {
    width: min(38rem, 100%);
    max-height: min(44rem, calc(100vh - 2rem));
    overflow: auto;
    border-radius: 8px;
    background: white;
    box-shadow: 0 18px 60px rgb(15 23 42 / 0.22);
    padding: 1rem;
  }

  .modal-header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
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
    cursor: pointer;
  }

  @media (max-width: 640px) {
    .page-heading,
    .session-row {
      align-items: stretch;
      flex-direction: column;
    }

    .row-actions,
    .form-actions {
      justify-content: stretch;
    }

    .button,
    .row-actions.compact .button {
      width: 100%;
    }
  }
</style>
