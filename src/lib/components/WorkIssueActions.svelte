<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { WorkIssueDetails } from "$lib/server/work/workIssueService";
  import ActionSubmit from "$lib/components/ActionSubmit.svelte";
  import { formatDateTime } from "$lib/format";
  import { currentJstMonth } from "$lib/month";
  import { isIssueCompleted } from "$lib/issueCompletion";
  let { data, message }: { data: WorkIssueDetails; message?: string } =
    $props();
  let pendingAction = $state<string | null>(null);
  const issue = $derived(data.issue);
  const complete = $derived(isIssueCompleted(issue));
  const canStart = $derived(
    issue.state !== "CLOSED" && issue.status !== "Done",
  );
  const enhanceAction =
    (name: string): SubmitFunction =>
    () => {
      pendingAction = name;
      return async ({ update }) => {
        try {
          await update();
        } finally {
          pendingAction = null;
        }
      };
    };
</script>

<section class="panel issue-action-panel">
  <h2>作業の進め方</h2>
  {#if message}<p class="notice" role="status">{message}</p>{/if}
  {#if !data.isAssignee}<p class="muted">
      管理者として閲覧中です。稼働・完了報告は担当者本人が操作します。
    </p>
  {:else}
    <p class="issue-hint">
      内容を確認できたらチャットで返信し、実際に作業を始めるときに稼働を開始してください。
    </p>
    {#if data.openSession}<p class="issue-running">
        <span class="status-badge measuring">稼働中</span><span
          >開始 {formatDateTime(data.openSession.startedAt)}</span
        >
      </p>
      <form method="POST" action="?/stop" use:enhance={enhanceAction("stop")}>
        <input
          type="hidden"
          name="sessionId"
          value={data.openSession.id}
        /><ActionSubmit
          actionName="stop"
          {pendingAction}
          label="稼働を終了"
          pendingLabel="終了中..."
          variant="danger"
        />
      </form>
    {:else if canStart}<form
        method="POST"
        action="?/start"
        use:enhance={enhanceAction("start")}
      >
        <ActionSubmit
          actionName="start"
          {pendingAction}
          label="稼働を開始"
          pendingLabel="開始中..."
          disabled={Boolean(data.descriptionError) || !data.body.trim()}
        />
      </form>
    {:else}<p class="muted">
        {complete
          ? "この案件は完了確認済みです。"
          : "IssueまたはProjectが完了状態のため、稼働開始できません。"}
      </p>{/if}
    {#if data.settlementRuleV2Enabled && !complete}
      {#if data.completionReport}<p class="issue-hint">
          {data.completionReport.settlementMonth}分として完了報告済みです。
        </p>
        {#if !data.completionReport.eligibilityConfirmedAt}<form
            method="POST"
            action="?/withdrawCompletion"
            use:enhance={enhanceAction("withdrawCompletion")}
          >
            <ActionSubmit
              actionName="withdrawCompletion"
              {pendingAction}
              label="完了報告を取り下げ"
              pendingLabel="取り下げ中..."
              variant="secondary"
            />
          </form>{/if}
      {:else}<form
          method="POST"
          action="?/reportCompletion"
          use:enhance={enhanceAction("reportCompletion")}
        >
          <ActionSubmit
            actionName="reportCompletion"
            {pendingAction}
            label="完了報告"
            pendingLabel="報告中..."
            variant="secondary"
            disabled={Boolean(data.openSession)}
          />
        </form>
        <p class="issue-hint">
          成果物を提出し、稼働を終了してから報告してください。
        </p>{/if}
    {/if}
  {/if}
  <a href={`/settlements/${currentJstMonth()}`}>今月の精算を確認 →</a>
</section>
