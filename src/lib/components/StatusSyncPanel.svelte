<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import { formatDateTime, formatIssueName, formatProjectName } from "$lib/format";

  type StatusSync = {
    id: string;
    repository: string;
    issueNumber: number;
    issueTitle: string;
    assigneeLogin: string;
    targetStatus: string;
    errorMessage: string | null;
    attemptedAt: Date | string;
  };

  type Props = {
    statusSyncs: StatusSync[];
    pendingAction: string | null;
    enhanceAction: (name: string) => SubmitFunction;
    showAssignee?: boolean;
    emptyMessage?: string;
    alert?: boolean;
  };

  let {
    statusSyncs,
    pendingAction,
    enhanceAction,
    showAssignee = false,
    emptyMessage = "再同期待ちのStatus更新はありません。",
    alert = false
  }: Props = $props();
</script>

<section class={`panel${alert ? " alert" : ""}`}>
  <h2>GitHub Project Status再同期</h2>
  {#if statusSyncs.length === 0}
    <p class={alert ? "muted" : "ok"}>{emptyMessage}</p>
  {:else}
    {#if alert}
      <p>稼働開始時にProject Statusの自動更新が失敗したIssueがあります。</p>
    {/if}
    <ul class="pending-list">
      {#each statusSyncs as sync (sync.id)}
        <li class="pending-session">
          <div class="pending-issue">
            <span class="project-name">{formatProjectName(sync.repository)}</span>
            <a
              href={`https://github.com/${sync.repository}/issues/${sync.issueNumber}`}
              target="_blank"
              rel="noreferrer"
            >
              {formatIssueName(sync.issueNumber, sync.issueTitle)}
            </a>
            <small>
              {#if showAssignee}
                Assignee: {sync.assigneeLogin} /
              {/if}
              更新先: {sync.targetStatus} / 最終試行 {formatDateTime(sync.attemptedAt)}
            </small>
            {#if sync.errorMessage}
              <small>{sync.errorMessage}</small>
            {/if}
          </div>
          <form
            method="POST"
            action="?/retryStatusSync"
            use:enhance={enhanceAction(`retry-status-${sync.id}`)}
          >
            <input type="hidden" name="syncId" value={sync.id} />
            <ActionSubmit
              actionName={`retry-status-${sync.id}`}
              {pendingAction}
              label="再同期"
              pendingLabel="再同期中..."
              variant="secondary"
            />
          </form>
        </li>
      {/each}
    </ul>
  {/if}
</section>
