<script lang="ts">
  import type { LayoutProps } from "./$types";
  import { currentJstMonth } from "$lib/month";

  let { data, children }: LayoutProps = $props();
  const currentMonth = $derived(currentJstMonth());
</script>

<svelte:head>
  <title>稼働精算 | techguide-jp</title>
</svelte:head>

<div class="shell">
  <header class="topbar">
    <a class="brand" href={data.user ? "/work" : "/login"}>稼働精算</a>
    <nav>
      {#if data.user}
        <a href="/work">稼働</a>
        <a href={`/settlements/${currentMonth}/${data.user.login}`}>自分の精算</a>
        {#if data.user.isAdmin}
          <a href={`/settlements/${currentMonth}`}>月次一覧</a>
          <a href="/admin/project-health">Project確認</a>
        {/if}
        <a href="/logout">ログアウト</a>
      {:else}
        <a href="/login">ログイン</a>
      {/if}
    </nav>
  </header>
  <main>
    {@render children()}
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    color: #172026;
    background: #f7f8f5;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  :global(a) {
    color: inherit;
  }

  .shell {
    min-height: 100vh;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.5rem;
    background: #ffffff;
    border-bottom: 1px solid #d8ded7;
  }

  .brand {
    font-weight: 800;
    text-decoration: none;
  }

  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    font-size: 0.92rem;
  }

  nav a {
    text-decoration: none;
    color: #38514a;
  }

  main {
    width: min(1180px, calc(100% - 2rem));
    margin: 0 auto;
    padding: 1.5rem 0 3rem;
  }
</style>
