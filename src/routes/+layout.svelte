<script lang="ts">
  import { page } from "$app/state";
  import type { LayoutProps } from "./$types";
  import { currentJstMonth, formatMonthLabel } from "$lib/month";

  type BreadcrumbItem = {
    label: string;
    href?: string;
  };

  let { data, children }: LayoutProps = $props();
  const currentMonth = $derived(currentJstMonth());
  const pathname = $derived(page.url.pathname);
  const settlementDetailMatch = $derived(pathname.match(/^\/settlements\/(\d{4}-\d{2})\/([^/]+)$/));
  const detailAssignee = $derived(settlementDetailMatch ? decodeURIComponent(settlementDetailMatch[2]) : null);
  const isWorkActive = $derived(pathname === "/work");
  const isLoginActive = $derived(pathname === "/login");
  const isSelfSettlementActive = $derived(Boolean(data.user && detailAssignee === data.user.login));
  const isMonthlySettlementActive = $derived(
    Boolean(
      data.user?.isAdmin &&
        (/^\/settlements\/\d{4}-\d{2}$/.test(pathname) ||
          (settlementDetailMatch && detailAssignee !== data.user.login))
    )
  );
  const isProjectHealthActive = $derived(pathname === "/admin/project-health");
  const breadcrumbs = $derived(buildBreadcrumbs(pathname, data.user));

  function buildBreadcrumbs(
    currentPath: string,
    user: LayoutProps["data"]["user"]
  ): BreadcrumbItem[] {
    const match = currentPath.match(/^\/settlements\/(\d{4}-\d{2})\/([^/]+)$/);
    if (!match) return [];

    const [, month, encodedAssignee] = match;
    const assignee = decodeURIComponent(encodedAssignee);

    if (user?.isAdmin) {
      return [
        { label: `${formatMonthLabel(month)} 月次一覧`, href: `/settlements/${month}` },
        { label: `${assignee} の明細` }
      ];
    }

    return [
      { label: "稼働", href: "/work" },
      { label: `${formatMonthLabel(month)} 自分の精算` }
    ];
  }
</script>

<svelte:head>
  <title>稼働精算 | techguide-jp</title>
</svelte:head>

<div class="shell">
  <header class="topbar">
    <a class="brand" href={data.user ? "/work" : "/login"}>稼働精算</a>
    <nav class="topnav" aria-label="主要ナビゲーション">
      {#if data.user}
        <a href="/work" class:active={isWorkActive} aria-current={isWorkActive ? "page" : undefined}>稼働</a>
        <a
          href={`/settlements/${currentMonth}/${data.user.login}`}
          class:active={isSelfSettlementActive}
          aria-current={isSelfSettlementActive ? "page" : undefined}
        >
          自分の精算
        </a>
        {#if data.user.isAdmin}
          <a
            href={`/settlements/${currentMonth}`}
            class:active={isMonthlySettlementActive}
            aria-current={isMonthlySettlementActive ? "page" : undefined}
          >
            月次一覧
          </a>
          <a
            href="/admin/project-health"
            class:active={isProjectHealthActive}
            aria-current={isProjectHealthActive ? "page" : undefined}
          >
            Project確認
          </a>
        {/if}
        <a href="/logout">ログアウト</a>
      {:else}
        <a href="/login" class:active={isLoginActive} aria-current={isLoginActive ? "page" : undefined}>
          ログイン
        </a>
      {/if}
    </nav>
  </header>
  <main>
    {#if breadcrumbs.length}
      <nav class="breadcrumb" aria-label="パンくず">
        <ol>
          {#each breadcrumbs as item, index (item.label)}
            <li>
              {#if item.href && index < breadcrumbs.length - 1}
                <a href={item.href}>{item.label}</a>
              {:else}
                <span aria-current="page">{item.label}</span>
              {/if}
            </li>
          {/each}
        </ol>
      </nav>
    {/if}
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

  .topnav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    font-size: 0.92rem;
  }

  .topnav a {
    border-bottom: 2px solid transparent;
    padding: 0.15rem 0;
    text-decoration: none;
    color: #38514a;
  }

  .topnav a.active {
    border-color: #0f766e;
    color: #0f766e;
    font-weight: 800;
  }

  main {
    width: min(1180px, calc(100% - 2rem));
    margin: 0 auto;
    padding: 1.5rem 0 3rem;
  }

  .breadcrumb {
    margin-bottom: 1rem;
    color: #66736d;
    font-size: 0.9rem;
  }

  .breadcrumb ol {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .breadcrumb li {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .breadcrumb li:not(:last-child)::after {
    content: "/";
    color: #9aa59f;
  }

  .breadcrumb a {
    color: #38514a;
    font-weight: 700;
    text-decoration: none;
  }

  .breadcrumb span {
    color: #172026;
    font-weight: 700;
  }
</style>
