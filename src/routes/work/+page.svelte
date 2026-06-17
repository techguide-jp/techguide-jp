<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import { formatDateTime } from "$lib/format";

  let { data, form }: PageProps = $props();
  let pendingAction = $state<string | null>(null);

  const openKeySet = $derived(
    new Set(data.openSessions.map((session) => `${session.repository}#${session.issueNumber}`))
  );

  const enhanceAction = (name: string): SubmitFunction =>
    () => {
      pendingAction = name;
      return async ({ update }) => {
        await update();
        pendingAction = null;
      };
    };

  const actionMessage = $derived((form as ActionData | undefined)?.message);
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
          <div>
            <strong>{session.repository}#{session.issueNumber}</strong>
            <span>{session.issueTitle}</span>
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
            <td>
              <a href={issue.url} target="_blank" rel="noreferrer">{key}</a>
              <span>{issue.title}</span>
            </td>
            <td>{issue.status ?? "-"}</td>
            <td>{issue.rewardMode ?? "-"}</td>
            <td>{issue.hourlyRateYen ? `${issue.hourlyRateYen.toLocaleString()}円` : "-"}</td>
            <td>{openKeySet.has(key) ? "稼働中" : "待機"}</td>
            <td>
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
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<section class="panel">
  <h2>修正・追加・除外申請</h2>
  <form method="POST" action="?/requestChange" use:enhance={enhanceAction("request-change")} class="request-form">
    <label>
      種別
      <select name="requestType">
        <option value="add">後追い追加</option>
        <option value="edit">時刻修正</option>
        <option value="exclude">除外</option>
      </select>
    </label>
    <label>
      Issue
      <select name="issueKey">
        {#each data.issues as issue (`${issue.repository}#${issue.number}`)}
          <option value={`${issue.repository}#${issue.number}`}>{issue.repository}#{issue.number} {issue.title}</option>
        {/each}
      </select>
    </label>
    <label>
      対象ログID
      <select name="targetSessionId">
        <option value="">なし</option>
        {#each data.sessions as session (session.id)}
          <option value={session.id}>{session.repository}#{session.issueNumber} {formatDateTime(session.startedAt)}</option>
        {/each}
      </select>
    </label>
    <label>
      開始
      <input name="requestedStartedAt" type="datetime-local" />
    </label>
    <label>
      終了
      <input name="requestedEndedAt" type="datetime-local" />
    </label>
    <label class="wide">
      理由
      <textarea name="reason" rows="3" required></textarea>
    </label>
    <div class="form-actions">
      <ActionSubmit
        actionName="request-change"
        {pendingAction}
        label="申請"
        pendingLabel="申請中..."
        variant="secondary"
      />
    </div>
  </form>
</section>

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

  .session-row div,
  td span {
    display: grid;
    gap: 0.2rem;
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
  select,
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
</style>
