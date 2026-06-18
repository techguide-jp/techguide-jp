<script lang="ts">
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ActionData, PageProps } from "./$types";
  import StatusSyncPanel from "$lib/components/StatusSyncPanel.svelte";
  import { formatIssueName, formatProjectName } from "$lib/format";

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

<StatusSyncPanel statusSyncs={data.statusSyncs} {pendingAction} {enhanceAction} showAssignee />

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
