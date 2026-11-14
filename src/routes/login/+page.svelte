<script lang="ts">
  import type { PageProps } from "./$types";
  import { workerPreferencesEntryHref } from "$lib/workerPreferences";
  let { data }: PageProps = $props();
</script>

<section class="login">
  <h1>TechGuideの稼働精算</h1>
  <p>GitHubアカウントでログインしてください。</p>
  {#if data.returnTo === workerPreferencesEntryHref}
    <p>ログイン後に、現在の希望を確認・更新できます。</p>
  {:else if data.returnTo.startsWith("/work/")}
    <p>ログイン後に、依頼された案件を表示します。</p>
  {:else if data.returnTo !== "/work"}
    <p>ログイン後に、リンク先の画面を表示します。</p>
  {/if}
  <a
    class="button"
    href={`/auth/github?returnTo=${encodeURIComponent(data.returnTo)}`}
    >GitHubでログイン</a
  >
</section>
