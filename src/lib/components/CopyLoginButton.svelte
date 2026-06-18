<script lang="ts">
  type Props = {
    login: string;
  };

  let { login }: Props = $props();
  let state = $state<"idle" | "copied" | "failed">("idle");
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null;

  const resetLater = () => {
    if (timer) globalThis.clearTimeout(timer);
    timer = globalThis.setTimeout(() => {
      state = "idle";
      timer = null;
    }, 1600);
  };

  const copyLogin = async () => {
    try {
      await globalThis.navigator.clipboard.writeText(login);
      state = "copied";
    } catch {
      state = "failed";
    }
    resetLater();
  };

  const label = $derived(
    state === "copied"
      ? `${login} をコピーしました`
      : state === "failed"
        ? `${login} をコピーできませんでした`
        : `${login} をコピー`,
  );
</script>

<button
  class="copy-login-button"
  type="button"
  onclick={copyLogin}
  aria-label={label}
  title={label}
  data-state={state}
>
  {#if state === "copied"}
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m5 12 4 4 10-10" />
    </svg>
  {:else if state === "failed"}
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 8v5" />
      <path d="M12 17h.01" />
    </svg>
  {:else}
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="8" y="8" width="10" height="10" rx="2" />
      <path d="M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
    </svg>
  {/if}
</button>
