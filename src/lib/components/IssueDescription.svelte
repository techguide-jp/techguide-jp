<script lang="ts">
  import {
    issueMarkdownBlocks,
    issueMarkdownInline,
    issueMarkdownTask,
  } from "$lib/issueMarkdown";
  let { body, issueUrl }: { body: string; issueUrl: string } = $props();
  const blocks = $derived(issueMarkdownBlocks(body));
</script>

{#snippet inline(text: string)}
  {#each issueMarkdownInline(text, issueUrl) as part, index (index)}
    {#if part.kind === "strong"}<strong>{part.text}</strong>
    {:else if part.kind === "code"}<code>{part.text}</code>
    {:else if part.kind === "link"}<a
        href={part.href}
        target="_blank"
        rel="noreferrer">{part.text}</a
      >
    {:else}{part.text}{/if}
  {/each}
{/snippet}

<div class="issue-description">
  {#each blocks as block, index (index)}
    {#if block.kind === "heading"}<h3>{@render inline(block.lines[0])}</h3>
    {:else if block.kind === "list"}<ul>
        {#each block.lines as line, index (index)}
          {@const task = issueMarkdownTask(line)}
          <li class:task-list-item={task !== null}>
            {#if task}
              <input
                type="checkbox"
                checked={task.checked}
                disabled
                aria-label={task.text || "確認項目"}
              />
              <span>{@render inline(task.text)}</span>
            {:else}
              {@render inline(line)}
            {/if}
          </li>
        {/each}
      </ul>
    {:else if block.kind === "code"}<pre><code>{block.lines.join("\n")}</code
        ></pre>
    {:else}<p>{@render inline(block.lines.join("\n"))}</p>{/if}
  {/each}
</div>

<style>
  .issue-description {
    line-height: 1.85;
    overflow-wrap: anywhere;
  }
  h3 {
    font-size: 1.05rem;
    margin: 1.6rem 0 0.6rem;
    padding-left: 0.65rem;
    border-left: 3px solid #0f766e;
  }
  h3:first-child {
    margin-top: 0;
  }
  p {
    white-space: pre-wrap;
    margin: 0.6rem 0;
  }
  ul {
    list-style: disc;
    padding-left: 1.4rem;
    margin: 0.6rem 0;
  }
  li + li {
    margin-top: 0.3rem;
  }
  .task-list-item {
    display: flex;
    gap: 0.65rem;
    margin-left: -1.4rem;
    list-style: none;
  }
  .task-list-item input {
    flex: 0 0 1rem;
    width: 1rem;
    height: 1rem;
    margin-top: 0.425em;
    opacity: 1;
    cursor: default;
  }
  .task-list-item span {
    min-width: 0;
  }
  pre {
    overflow-x: auto;
    padding: 1rem;
    border-radius: 0.5rem;
    background: #f1f5f9;
    white-space: pre;
  }
  code {
    font-size: 0.9em;
    background: #f1f5f9;
    padding: 0.1em 0.25em;
    border-radius: 0.2rem;
  }
</style>
