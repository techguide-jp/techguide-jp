<script lang="ts">
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<section class="page-heading">
  <p class="eyebrow">project health</p>
  <h1>{data.health.title}</h1>
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
  <h2>Issue不備</h2>
  {#if data.issueWarnings.length === 0}
    <p class="ok">精算に影響するIssue不備はありません。</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Issue</th>
          <th>不備</th>
        </tr>
      </thead>
      <tbody>
        {#each data.issueWarnings as entry (`${entry.issue.repository}#${entry.issue.number}`)}
          <tr>
            <td>
              <a href={entry.issue.url} target="_blank" rel="noreferrer">
                {entry.issue.repository}#{entry.issue.number}
              </a>
              <span>{entry.issue.title}</span>
            </td>
            <td>{entry.warnings.join(" / ")}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .page-heading {
    margin-bottom: 1rem;
  }

  .eyebrow {
    margin: 0 0 0.25rem;
    color: #66736d;
    font-size: 0.78rem;
    text-transform: uppercase;
  }

  h1,
  h2,
  h3 {
    margin: 0;
  }

  h2 {
    margin-bottom: 0.8rem;
  }

  h3 {
    margin-top: 0.9rem;
  }

  .panel {
    margin-bottom: 1rem;
    background: white;
    border: 1px solid #d8ded7;
    border-radius: 8px;
    padding: 1rem;
  }

  .ok {
    color: #047857;
    font-weight: 700;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    border-bottom: 1px solid #e5e7eb;
    padding: 0.75rem;
    text-align: left;
  }

  td span {
    display: block;
    color: #52605a;
  }
</style>
