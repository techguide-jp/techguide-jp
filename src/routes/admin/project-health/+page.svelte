<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import { formatDateTime, formatIssueName, formatProjectName } from "$lib/format";

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

  const actionMessage = $derived((form as ActionData | undefined)?.message);
</script>

<section class="page-heading">
  <p class="eyebrow">project health</p>
  <h1>{data.health.title}</h1>
</section>

{#if actionMessage}
  <p class="notice" role="status">{actionMessage}</p>
{/if}

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
  <h2>GitHub Project Status再同期</h2>
  {#if data.statusSyncs.length === 0}
    <p class="ok">再同期待ちのStatus更新はありません。</p>
  {:else}
    <ul class="pending-list">
      {#each data.statusSyncs as sync (sync.id)}
        <li class="pending-session">
          <div class="pending-issue">
            <span class="project-name">{formatProjectName(sync.repository)}</span>
            <a
              href={`https://github.com/${sync.repository}/issues/${sync.issueNumber}`}
              target="_blank"
              rel="noreferrer"
            >
              {formatIssueName(sync.issueNumber, sync.issueTitle)}
            </a>
            <small>
              Assignee: {sync.assigneeLogin} / 更新先: {sync.targetStatus} / 最終試行 {formatDateTime(sync.attemptedAt)}
            </small>
            {#if sync.errorMessage}
              <small>{sync.errorMessage}</small>
            {/if}
          </div>
          <form
            method="POST"
            action="?/retryStatusSync"
            use:enhance={enhanceAction(`retry-status-${sync.id}`)}
          >
            <input type="hidden" name="syncId" value={sync.id} />
            <ActionSubmit
              actionName={`retry-status-${sync.id}`}
              {pendingAction}
              label="再同期"
              pendingLabel="再同期中..."
              variant="secondary"
            />
          </form>
        </li>
      {/each}
    </ul>
  {/if}
</section>

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
