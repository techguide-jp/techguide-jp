<script lang="ts">
  import type { ChangeRequestPreview } from "$lib/changeRequestPreview";
  import { formatMonthLabel } from "$lib/month";
  import { formatWorkMinutes, formatYen } from "$lib/format";
  import TimedRewardDetail from "$lib/components/TimedRewardDetail.svelte";
  let { preview }: { preview: ChangeRequestPreview } = $props();
</script>

{#if preview.error}
  <p class="bad">見込み額を確認できません。{preview.error}</p>
{:else}
  <div class="months">
    {#each preview.months as month (month.month)}
      <section
        class="month"
        aria-label={`${formatMonthLabel(month.month)}の精算見込み`}
      >
        <h4>{formatMonthLabel(month.month)} · 対象者の通常支払い</h4>
        {#if month.approved}
          <p class="muted">
            月次承認済みのため、この申請では金額は変わりません。
          </p>
        {/if}
        <p class="total">
          現在 {formatYen(month.before.taxIncludedYen)}
          <span
            >→ 承認後の見込み <strong
              >{formatYen(month.after.taxIncludedYen)}</strong
            >（税込）</span
          >
        </p>
        <dl>
          <div>
            <dt>固定報酬</dt>
            <dd>{formatYen(month.after.fixedRewardYen)}</dd>
          </div>
          <div>
            <dt>時間報酬</dt>
            <dd>{formatYen(month.after.timedRewardYen)}</dd>
          </div>
          <div>
            <dt>税抜合計</dt>
            <dd>{formatYen(month.after.taxExcludedYen)}</dd>
          </div>
          <div>
            <dt>税込合計</dt>
            <dd>{formatYen(month.after.taxIncludedYen)}</dd>
          </div>
        </dl>
        {#if month.issueDetail}
          {@const detail = month.issueDetail}
          <p class="calculation">
            このIssueの計算対象時間：<strong
              >{formatWorkMinutes(detail.workMinutes)}</strong
            >
            {#if detail.hourlyRateYen !== null}
              <span>時間単価 {formatYen(detail.hourlyRateYen)}</span>
            {/if}
            {#if detail.calculation}
              <span
                >上限適用前の時間報酬 {formatYen(
                  detail.calculation.uncappedYen,
                )}</span
              >
            {/if}
          </p>
          <TimedRewardDetail
            calculation={detail.calculation}
            payableYen={detail.timedRewardYen}
          />
        {:else if !month.approved}
          <p class="muted">このIssueは、この月の精算額に計上されません。</p>
        {/if}
      </section>
    {/each}
  </div>
  {#each preview.notes as note (note)}<p class="muted">{note}</p>{/each}
{/if}

<style>
  .months {
    display: grid;
    gap: 1rem;
  }
  .month {
    border-top: 1px solid var(--border, #dce3ed);
    padding-top: 0.75rem;
  }
  h4 {
    margin: 0;
    font-size: 1rem;
  }
  .total {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .total strong {
    font-size: 1.15rem;
    white-space: nowrap;
  }
  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    margin: 1rem 0;
  }
  dl div {
    padding: 0.65rem;
    background: #f5f8fc;
    border-radius: 0.5rem;
  }
  dt {
    font-size: 0.85rem;
  }
  dd {
    margin: 0.2rem 0 0;
    font-weight: 700;
    white-space: nowrap;
  }
  .calculation {
    display: grid;
    gap: 0.25rem;
    font-size: 0.9rem;
  }
</style>
