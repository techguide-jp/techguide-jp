<script lang="ts">
  import { page } from "$app/state";
  import type { LayoutProps } from "./$types";
  import { currentJstMonth, formatMonthLabel } from "$lib/month";
  import "../app.css";

  type BreadcrumbItem = {
    label: string;
    href?: string;
  };

  let { data, children }: LayoutProps = $props();
  const currentMonth = $derived(currentJstMonth());
  const pathname = $derived(page.url.pathname);
  const settlementDetailMatch = $derived(
    pathname.match(/^\/settlements\/(\d{4}-\d{2})\/([^/]+)$/),
  );
  const detailAssignee = $derived(
    settlementDetailMatch ? decodeURIComponent(settlementDetailMatch[2]) : null,
  );
  const isWorkActive = $derived(pathname === "/work");
  const isLoginActive = $derived(pathname === "/login");
  const isHelpActive = $derived(pathname === "/help");
  const isSelfSettlementActive = $derived(
    Boolean(data.user && detailAssignee === data.user.login),
  );
  const isMonthlySettlementActive = $derived(
    Boolean(
      data.user?.isAdmin &&
      (/^\/settlements\/\d{4}-\d{2}$/.test(pathname) ||
        (settlementDetailMatch && detailAssignee !== data.user.login)),
    ),
  );
  const isProjectHealthActive = $derived(pathname === "/admin/project-health");
  const breadcrumbs = $derived(buildBreadcrumbs(pathname, data.user));

  function buildBreadcrumbs(
    currentPath: string,
    user: LayoutProps["data"]["user"],
  ): BreadcrumbItem[] {
    const match = currentPath.match(/^\/settlements\/(\d{4}-\d{2})\/([^/]+)$/);
    if (!match) return [];

    const [, month, encodedAssignee] = match;
    const assignee = decodeURIComponent(encodedAssignee);

    if (user?.isAdmin) {
      return [
        {
          label: `${formatMonthLabel(month)} 月次一覧`,
          href: `/settlements/${month}`,
        },
        { label: `${assignee} の明細` },
      ];
    }

    return [
      { label: "稼働", href: "/work" },
      { label: `${formatMonthLabel(month)} 自分の精算` },
    ];
  }
</script>

<svelte:head>
  <title>TechGuideの稼働精算</title>
</svelte:head>

<div class="shell">
  <header class="topbar">
    <a class="brand" href={data.user ? "/work" : "/login"}>
      TechGuideの稼働精算
    </a>
    <nav class="topnav" aria-label="主要ナビゲーション">
      {#if data.user}
        <a
          href="/work"
          class:active={isWorkActive}
          aria-current={isWorkActive ? "page" : undefined}>稼働</a
        >
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
        <a
          href="/help"
          class:active={isHelpActive}
          aria-current={isHelpActive ? "page" : undefined}
        >
          ヘルプ
        </a>
        <a href="/logout">ログアウト</a>
      {:else}
        <a
          href="/login"
          class:active={isLoginActive}
          aria-current={isLoginActive ? "page" : undefined}
        >
          ログイン
        </a>
        <a
          href="/help"
          class:active={isHelpActive}
          aria-current={isHelpActive ? "page" : undefined}
        >
          ヘルプ
        </a>
      {/if}
    </nav>
  </header>
  <main class="page-main">
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
