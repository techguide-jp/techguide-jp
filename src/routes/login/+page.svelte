<script lang="ts">
  import type { PageProps } from "./$types";
  let { data }: PageProps = $props();
</script>

<section class="login">
  <h1>TechGuideの稼働精算</h1>
  <p>GitHubアカウントでログインしてください。</p>
  {#if data.returnTo !== "/work"}<p>
      ログイン後に、依頼された案件を表示します。
    </p>{/if}
  <a
    class="button"
    href={`/auth/github?returnTo=${encodeURIComponent(data.returnTo)}`}
    >GitHubでログイン</a
  >
</section>
