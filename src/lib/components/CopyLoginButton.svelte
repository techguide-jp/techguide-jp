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
</script>

<button
  class="button secondary compact-button"
  type="button"
  onclick={copyLogin}
  aria-label={`${login} をコピー`}
>
  {#if state === "copied"}
    コピー済み
  {:else if state === "failed"}
    失敗
  {:else}
    IDコピー
  {/if}
</button>
