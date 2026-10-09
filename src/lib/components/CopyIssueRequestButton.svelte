<script lang="ts">
  import { page } from "$app/state";
  import { browser } from "$app/environment";
  import { buildIssueRequestText, workIssueHref } from "$lib/workIssueRoute";
  let {
    repository,
    number,
    title,
    includeMessage = true,
  }: {
    repository: string;
    number: number;
    title: string;
    includeMessage?: boolean;
  } = $props();
  let state = $state<"idle" | "pending" | "copied" | "failed">("idle");
  const url = $derived(
    `${page.url.origin}${workIssueHref(repository, number)}`,
  );
  const text = $derived(
    includeMessage ? buildIssueRequestText(title, url) : url,
  );
  const copy = async (): Promise<void> => {
    if (state === "pending") return;
    state = "pending";
    try {
      await globalThis.navigator.clipboard.writeText(text);
      state = "copied";
    } catch {
      state = "failed";
    }
  };
</script>

<div class="copy-request">
  <button
    class="button secondary"
    type="button"
    onclick={copy}
    disabled={!browser || state === "pending"}
    aria-busy={state === "pending"}
  >
    {state === "pending"
      ? "コピー中..."
      : state === "copied"
        ? "コピーしました"
        : includeMessage
          ? "依頼文＋URLをコピー"
          : "案件URLをコピー"}
  </button>
  {#if state === "copied"}<p class="copy-feedback" role="status">
      {includeMessage
        ? "チャットに貼り付けて送れます。"
        : "案件URLをコピーしました。"}
    </p>{/if}
  {#if state === "failed"}
    <p class="copy-feedback" role="alert">
      コピーできませんでした。下の文面を選択してコピーしてください。
    </p>
    <textarea
      readonly
      aria-label="手動コピー用の依頼文"
      rows={includeMessage ? 6 : 2}
      value={text}></textarea>
  {/if}
</div>

<style>
  .copy-request {
    min-width: 0;
  }
  .copy-feedback {
    margin: 0.4rem 0 0;
    font-size: 0.8rem;
    color: #475569;
  }
  textarea {
    width: 100%;
    margin-top: 0.5rem;
  }
</style>
