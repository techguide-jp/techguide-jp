<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import StatusSyncPanel from "$lib/components/StatusSyncPanel.svelte";
  import {
    formatDateTime,
    formatIssueName,
    formatProjectName,
  } from "$lib/format";

  let { data, form }: PageProps = $props();
  let pendingAction = $state<string | null>(null);

  const enhanceAction =
    (name: string): SubmitFunction =>
    () => {
      pendingAction = name;
      return async ({ update }) => {
        await update();
        pendingAction = null;
      };
    };

  const actionMessage = $derived((form as ActionData | undefined)?.message);
  const mark = (value: boolean): string => (value ? "OK" : "NG");
  const auditDetails = (details: unknown): string => {
    if (!details || typeof details !== "object") return "-";
    return JSON.stringify(details);
  };
</script>

<section class="page-heading">
  <p class="eyebrow">project health</p>
  <h1>{data.health.title}</h1>
</section>

{#if actionMessage}
  <p class="notice" role="status">{actionMessage}</p>
{/if}

{#if data.projectFetchError}
  <section class="panel alert">
    <h2>Project取得エラー</h2>
    <p>{data.projectFetchError}</p>
  </section>
{/if}

<section class="panel">
  <h2>運用ヘルス</h2>
  <div class="health-grid">
    <div class="health-card">
      <span>DB接続</span>
      <strong class={data.operationalHealth.database.reachable ? "ok" : "bad"}>
        {mark(data.operationalHealth.database.reachable)}
      </strong>
      {#if data.operationalHealth.database.error}
        <small>{data.operationalHealth.database.error}</small>
      {/if}
    </div>
    <div class="health-card">
      <span>期限切れセッション</span>
      <strong
        >{data.operationalHealth.database.expiredSessionCount ?? "-"}</strong
      >
      <form
        method="POST"
        action="?/cleanupExpiredSessions"
        use:enhance={enhanceAction("cleanup-expired-sessions")}
      >
        <ActionSubmit
          actionName="cleanup-expired-sessions"
          {pendingAction}
          label="削除"
          pendingLabel="削除中..."
          variant="secondary"
          disabled={!data.operationalHealth.database.reachable}
        />
      </form>
    </div>
    <div class="health-card">
      <span>GitHub OAuth</span>
      <strong
        class={data.operationalHealth.environment.githubClientId &&
        data.operationalHealth.environment.githubClientSecret
          ? "ok"
          : "bad"}
      >
        {mark(
          data.operationalHealth.environment.githubClientId &&
            data.operationalHealth.environment.githubClientSecret,
        )}
      </strong>
      <small>Client ID / Secret</small>
    </div>
    <div class="health-card">
      <span>Project Token</span>
      <strong
        class={data.operationalHealth.environment.githubProjectToken
          ? "ok"
          : "bad"}
      >
        {mark(data.operationalHealth.environment.githubProjectToken)}
      </strong>
      <small>GITHUB_PROJECT_TOKEN</small>
    </div>
    <div class="health-card">
      <span>管理者数</span>
      <strong
        class={data.operationalHealth.environment.adminGithubLogins > 0
          ? "ok"
          : "bad"}
      >
        {data.operationalHealth.environment.adminGithubLogins}
      </strong>
      <small>ADMIN_GITHUB_LOGINS</small>
    </div>
    <div class="health-card">
      <span>Project取得</span>
      <strong
        class={data.operationalHealth.projectClient.lastFetchError
          ? "bad"
          : "ok"}
      >
        {data.operationalHealth.projectClient.lastFetchError ? "NG" : "OK"}
      </strong>
      <small>
        成功: {data.operationalHealth.projectClient.lastFetchSucceededAt
          ? formatDateTime(
              data.operationalHealth.projectClient.lastFetchSucceededAt,
            )
          : "-"}
      </small>
      {#if data.operationalHealth.projectClient.lastFetchError}
        <small>{data.operationalHealth.projectClient.lastFetchError}</small>
      {/if}
    </div>
  </div>
</section>

<section class="panel">
  <h2>必須フィールド</h2>
  {#if data.health.missingFields.length === 0 && data.health.invalidFields.length === 0}
    <p class="ok">Projectフィールドは揃っています。</p>
  {:else}
    {#if data.health.missingFields.length}
      <h3>不足</h3>
      <ul>
        {#each data.health.missingFields as field (field)}
          <li>{field}</li>
        {/each}
      </ul>
    {/if}
    {#if data.health.invalidFields.length}
      <h3>型不一致</h3>
      <ul>
        {#each data.health.invalidFields as field (field)}
          <li>{field}</li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<section class="panel">
  <h2>監査ログ</h2>
  {#if data.auditLogs.length === 0}
    <p class="muted">監査ログはまだありません。</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>日時</th>
          <th>操作者</th>
          <th>操作</th>
          <th>対象</th>
          <th>詳細</th>
        </tr>
      </thead>
      <tbody>
        {#each data.auditLogs as log (log.id)}
          <tr>
            <td>{formatDateTime(log.createdAt)}</td>
            <td>{log.actorLogin}</td>
            <td>{log.action}</td>
            <td>{log.targetType}: {log.targetId}</td>
            <td><code>{auditDetails(log.details)}</code></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<StatusSyncPanel
  statusSyncs={data.statusSyncs}
  {pendingAction}
  {enhanceAction}
  showAssignee
/>

<section class="panel">
  <h2>Issue不備</h2>
  {#if data.issueWarnings.length === 0}
    <p class="ok">精算に影響するIssue不備はありません。</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Project</th>
          <th>Issue</th>
          <th>不備</th>
        </tr>
      </thead>
      <tbody>
        {#each data.issueWarnings as entry (`${entry.issue.repository}#${entry.issue.number}`)}
          <tr>
            <td>{formatProjectName(entry.issue.repository)}</td>
            <td>
              <a href={entry.issue.url} target="_blank" rel="noreferrer">
                {formatIssueName(entry.issue.number, entry.issue.title)}
              </a>
            </td>
            <td>{entry.warnings.join(" / ")}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>
