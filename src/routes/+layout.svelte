<script lang="ts">
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import type { LayoutProps } from "./$types";
  import { currentJstMonth, formatMonthLabel } from "$lib/month";
  import LocalImpersonationBanner from "$lib/components/LocalImpersonationBanner.svelte";
  import { watchDeploymentAfterReload } from "$lib/refreshDeployment";
  import "../app.css";

  type BreadcrumbItem = {
    label: string;
    href?: string;
  };

  let { data, children }: LayoutProps = $props();
  onMount(watchDeploymentAfterReload);
  const currentMonth = $derived(currentJstMonth());
  const pathname = $derived(page.url.pathname);
  const homeHref = $derived(
    data.isAdminView ? "/admin/work" : data.user ? "/work" : "/login",
  );
  const isWorkActive = $derived(
    pathname === "/work" || pathname.startsWith("/work/"),
  );
  const isLoginActive = $derived(pathname === "/login");
  const isHelpActive = $derived(pathname === "/help");
  const isProfileActive = $derived(
    Boolean(data.user && pathname === `/workers/${data.user.login}`),
  );
  const isSelfSettlementActive = $derived(
    Boolean(data.user && page.params.assignee === data.user.login),
  );
  const isMonthlySettlementActive = $derived(
    pathname.startsWith("/settlements/"),
  );
  const isAdminWorkActive = $derived(
    pathname === "/admin/work" || pathname.startsWith("/work/"),
  );
  const isAdminWorkersActive = $derived(
    pathname === "/admin/workers" || pathname.startsWith("/workers/"),
  );
  const isProjectHealthActive = $derived(pathname === "/admin/project-health");
  const isEmailPreviewActive = $derived(
    pathname.startsWith("/admin/email-previews"),
  );
  const breadcrumbs = $derived(
    page.route.id === "/settlements/[month]/[assignee]"
      ? buildBreadcrumbs(
          page.params.month,
          page.params.assignee,
          data.isAdminView,
        )
      : [],
  );

  function buildBreadcrumbs(
    month: string | undefined,
    assignee: string | undefined,
    isAdminView: boolean,
  ): BreadcrumbItem[] {
    if (!month || !assignee) return [];

    if (isAdminView) {
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
  <header class="topbar" class:has-mode-switch={data.user?.isAdmin}>
    <a class="brand" href={homeHref}>TechGuideの稼働精算</a>
    {#if data.user?.isAdmin}
      <nav class="mode-switch" aria-label="表示モード">
        <a href="/work" aria-current={data.isAdminView ? undefined : "true"}>
          作業モード
        </a>
        <a
          href="/admin/work"
          aria-current={data.isAdminView ? "true" : undefined}
        >
          管理モード
        </a>
      </nav>
    {/if}
    <nav class="topnav" aria-label="主要ナビゲーション">
      {#if data.user}
        {#if data.isAdminView}
          <a
            href="/admin/work"
            class:active={isAdminWorkActive}
            aria-current={isAdminWorkActive ? "page" : undefined}
          >
            稼働確認
          </a>
          <a
            href="/admin/workers"
            class:active={isAdminWorkersActive}
            aria-current={isAdminWorkersActive ? "page" : undefined}
          >
            登録者一覧
          </a>
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
          <a
            href="/admin/email-previews"
            class:active={isEmailPreviewActive}
            aria-current={isEmailPreviewActive ? "page" : undefined}
          >
            メール通知
          </a>
          {#if data.localImpersonationAvailable && !data.localImpersonation}
            <a
              href="/dev/impersonation"
              class:active={pathname === "/dev/impersonation"}
              aria-current={pathname === "/dev/impersonation"
                ? "page"
                : undefined}>ユーザー切替</a
            >
          {/if}
        {:else}
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
          <a
            href={`/workers/${data.user.login}`}
            class:active={isProfileActive}
            aria-current={isProfileActive ? "page" : undefined}
          >
            プロフィール
          </a>
          <a
            href="/help"
            class:active={isHelpActive}
            aria-current={isHelpActive ? "page" : undefined}
          >
            ヘルプ
          </a>
        {/if}
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
  {#if data.localImpersonation}
    <LocalImpersonationBanner {...data.localImpersonation} />
  {/if}
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
