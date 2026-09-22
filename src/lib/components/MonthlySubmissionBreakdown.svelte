<script lang="ts">
  import {
    formatIssueName,
    formatProjectName,
    formatWorkMinutes,
    formatYen,
  } from "$lib/format";
  import TimedRewardDetail from "$lib/components/TimedRewardDetail.svelte";
  import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";

  let { summary }: { summary: SettlementSummary } = $props();
</script>

<section aria-label="申請金額の内訳" class="breakdown">
  <p class="amount">
    申請額（税込） <strong>{formatYen(summary.taxIncludedYen)}</strong>
  </p>
  <h3>申請内訳</h3>
  <dl class="totals">
    <div>
      <dt>固定報酬（税抜）</dt>
      <dd>{formatYen(summary.fixedRewardYen)}</dd>
    </div>
    <div>
      <dt>時間報酬（税抜）</dt>
      <dd>{formatYen(summary.timedRewardYen)}</dd>
    </div>
    <div class="subtotal">
      <dt>税抜合計</dt>
      <dd>{formatYen(summary.taxExcludedYen)}</dd>
    </div>
    <div>
      <dt>消費税</dt>
      <dd>{formatYen(summary.taxYen)}</dd>
    </div>
  </dl>
  {#each summary.lines as line (`${line.issue.repository}#${line.issue.number}`)}
    {@const hourlyRate =
      line.hourlyRateYenSnapshot === undefined
        ? line.issue.hourlyRateYen
        : line.hourlyRateYenSnapshot}
    <article
      aria-label={`${formatProjectName(line.issue.repository)} #${line.issue.number}`}
    >
      <p class="project">
        {formatProjectName(line.issue.repository)} · {line.issue.rewardMode ??
          "報酬方式未設定"}
      </p>
      <h4>
        <a href={line.issue.url} target="_blank" rel="noreferrer"
          >{formatIssueName(line.issue.number, line.issue.title)}</a
        >
      </h4>
      <dl class="issue-amounts">
        <div>
          <dt>稼働時間</dt>
          <dd>{formatWorkMinutes(line.workMinutes)}</dd>
        </div>
        {#if line.issue.rewardMode === "ハイブリッド"}
          <div>
            <dt>時給（税抜）</dt>
            <dd>{hourlyRate === null ? "未設定" : formatYen(hourlyRate)}</dd>
          </div>
        {/if}
        <div>
          <dt>固定報酬（税抜）</dt>
          <dd>{formatYen(line.fixedRewardYen)}</dd>
        </div>
        <div>
          <dt>時間報酬（税抜）</dt>
          <dd>{formatYen(line.timedRewardYen)}</dd>
        </div>
        <div class="subtotal">
          <dt>小計（税抜）</dt>
          <dd>{formatYen(line.taxExcludedYen)}</dd>
        </div>
      </dl>
      <TimedRewardDetail
        calculation={line.timedRewardCalculation}
        payableYen={line.timedRewardYen}
      />
    </article>
  {/each}
</section>

<style>
  .breakdown {
    margin: 1rem 0;
  }
  .amount {
    padding: 1rem;
    background: #f0fdfa;
    border-radius: 0.5rem;
  }
  h3 {
    margin: 1rem 0 0.5rem;
    font-size: 1rem;
    font-weight: 700;
  }
  dl {
    margin: 0;
  }
  dl > div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.35rem 0;
  }
  dd {
    margin: 0;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .subtotal {
    border-top: 1px solid #cbd5e1;
    font-weight: 700;
  }
  article {
    min-width: 0;
    margin-top: 1rem;
    padding: 1rem;
    border: 1px solid #cbd5e1;
    border-radius: 0.5rem;
  }
  .project {
    color: #64748b;
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }
  h4 {
    margin: 0.25rem 0 0.75rem;
    font-size: 1rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .issue-amounts {
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
  }
</style>
