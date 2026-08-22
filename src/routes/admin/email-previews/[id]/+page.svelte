<script lang="ts">
  import type { PageProps } from "./$types";
  let { data }: PageProps = $props();
  let format = $state<"text" | "html">("text");
  const textParts = $derived(
    data.text.split(/(https?:\/\/[^\s]+)/g).filter(Boolean),
  );
</script>

<section class="page-heading"><h1>{data.metadata.subject}</h1></section>
<section class="panel">
  <p>
    宛先: {data.metadata.recipientEmail ??
      `${data.metadata.recipientLogin}（未同期）`}
  </p>
  <div class="button-row">
    <button
      type="button"
      class:secondary={format !== "text"}
      onclick={() => (format = "text")}>テキスト</button
    >
    <button
      type="button"
      class:secondary={format !== "html"}
      onclick={() => (format = "html")}>HTML</button
    >
  </div>
  {#if format === "text"}
    <pre
      class="email-text">{#each textParts as part, index (`${index}:${part}`)}{#if /^https?:\/\//.test(part)}<a
            href={part}
            target="_blank"
            rel="noopener noreferrer">{part}</a
          >{:else}{part}{/if}{/each}</pre>
  {:else}
    <iframe
      title="HTMLメールプレビュー"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcdoc={data.safeHtml}
      style="width: 100%; min-height: 32rem; border: 1px solid var(--border);"
    ></iframe>
  {/if}
</section>
