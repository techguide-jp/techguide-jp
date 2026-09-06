<script lang="ts">
  import { formatProjectName } from "$lib/format";
  import type { ProjectIssue } from "$lib/server/github/projectTypes";
  let {
    candidates,
    selectedRef = $bindable(""),
  }: { candidates: ProjectIssue[]; selectedRef: string } = $props();
  let search = $state("");
  let repository = $state("");
  let assignee = $state("");
  const key = (issue: ProjectIssue) => `${issue.repository}#${issue.number}`;
  const repositories = $derived(
    [...new Set(candidates.map((issue) => issue.repository))].sort(),
  );
  const assignees = $derived(
    [...new Set(candidates.flatMap((issue) => issue.assignees))].sort(),
  );
  const filtered = $derived(
    candidates.filter((issue) => {
      const text =
        `${formatProjectName(issue.repository)} ${issue.repository} #${issue.number} ${issue.title} ${issue.assignees.join(" ")}`.toLowerCase();
      return (
        (!repository || issue.repository === repository) &&
        (!assignee || issue.assignees.includes(assignee)) &&
        search
          .trim()
          .toLowerCase()
          .split(/\s+/)
          .every((word) => text.includes(word))
      );
    }),
  );
</script>

<section class="min-w-0" aria-labelledby="backfill-candidates-title">
  <h3 id="backfill-candidates-title">対象Issueを選択</h3>
  <p class="my-2 text-sm text-slate-600">
    精算済み・完了報告済みのIssueは除外しています。
  </p>
  <label class="grid gap-1.5 text-sm font-semibold">
    キーワード検索
    <input
      class="w-full min-w-0 rounded-md border border-slate-300 bg-white p-2.5 font-normal"
      type="search"
      bind:value={search}
      placeholder="Issue番号・件名・プロジェクト・担当者"
    />
  </label>
  <div class="my-3 grid grid-cols-2 gap-2">
    <label class="grid gap-1.5 text-sm font-semibold">
      プロジェクト
      <select
        class="w-full min-w-0 rounded-md border border-slate-300 bg-white p-2.5 font-normal"
        bind:value={repository}
      >
        <option value="">すべて</option>
        {#each repositories as value (value)}
          <option {value}>{formatProjectName(value)}</option>
        {/each}
      </select>
    </label>
    <label class="grid gap-1.5 text-sm font-semibold">
      担当者
      <select
        class="w-full min-w-0 rounded-md border border-slate-300 bg-white p-2.5 font-normal"
        bind:value={assignee}
      >
        <option value="">すべて</option>
        {#each assignees as value (value)}<option {value}>{value}</option
          >{/each}
      </select>
    </label>
  </div>
  <p class="mb-2 text-sm text-slate-600" role="status">
    候補 {filtered.length}件 / 全{candidates.length}件
  </p>
  <div class="candidate-list" role="group" aria-label="対象Issue">
    {#each filtered as issue (key(issue))}
      <label class="candidate" class:selected={selectedRef === key(issue)}>
        <input
          type="radio"
          name="issueRef"
          value={key(issue)}
          bind:group={selectedRef}
        />
        <span class="min-w-0">
          <span class="block text-xs text-slate-600"
            >{formatProjectName(issue.repository)} / {issue.assignees[0]}</span
          >
          <strong class="my-1 block">#{issue.number} {issue.title}</strong>
          <span class="text-xs text-slate-600"
            >{issue.state === "CLOSED" ? "closed" : "open"} · {issue.status ??
              "Status未設定"}</span
          >
        </span>
      </label>
    {:else}
      <p class="p-3 text-sm text-slate-600">
        条件に一致するIssueはありません。検索や絞り込みを変更してください。
      </p>
    {/each}
  </div>
</section>

<style>
  .candidate-list {
    max-height: 24rem;
    overflow-y: auto;
    padding: 3px;
  }
  .candidate {
    display: flex;
    align-items: start;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    padding: 0.75rem;
    border: 1px solid #cbd5e1;
    border-radius: 0.5rem;
    cursor: pointer;
    font-size: 0.875rem;
    overflow-wrap: anywhere;
  }
  .candidate input {
    margin-top: 0.25rem;
    accent-color: #0f766e;
  }
  .candidate.selected {
    border-color: #0f766e;
    background: #f0fdfa;
  }
  @media (max-width: 640px) {
    .candidate-list {
      max-height: 14rem;
    }
  }
</style>
