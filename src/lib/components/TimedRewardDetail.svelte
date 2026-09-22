<script lang="ts">
  import { formatYen } from "$lib/format";
  import type { TimedRewardCalculation } from "$lib/timedReward";
  let {
    calculation,
    payableYen,
  }: { calculation?: TimedRewardCalculation; payableYen: number } = $props();
</script>

{#if calculation && calculation.uncappedYen > payableYen}
  <div class="cap-detail">
    <strong class="cap-heading">時間報酬が上限に達しています</strong>
    <p>
      このIssueには時間報酬の上限が設定されているため、実績額の全額は精算されません。
    </p>
    <dl>
      <div>
        <dt>設定された上限</dt>
        <dd>
          {calculation.capYen === null
            ? "確認できません"
            : formatYen(calculation.capYen)}
        </dd>
      </div>
      <div>
        <dt>実績から計算した時間報酬</dt>
        <dd>{formatYen(calculation.uncappedYen)}</dd>
      </div>
      <div class="payable">
        <dt>今回精算する時間報酬</dt>
        <dd>{formatYen(payableYen)}</dd>
      </div>
      <div>
        <dt>上限により精算対象外</dt>
        <dd>{formatYen(calculation.uncappedYen - payableYen)}</dd>
      </div>
    </dl>
    <p class="cap-note">
      金額はすべて税抜です。上限はIssueの全期間・全作業者で共有し、他月・他の作業者に計上済みの分を差し引いた残額まで精算します。固定報酬と稼働時間は変わりません。
    </p>
  </div>
{/if}

<style>
  .cap-detail {
    display: grid;
    gap: 0.65rem;
    padding: 1rem;
    border: 1px solid #fbbf24;
    border-left: 4px solid #d97706;
    border-radius: 0.5rem;
    background: #fffbeb;
    color: #78350f;
    font-size: 0.9rem;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .cap-heading {
    font-size: 1rem;
  }
  p,
  dl {
    margin: 0;
  }
  dl > div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.4rem 0;
  }
  dd {
    margin: 0;
    white-space: nowrap;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .payable {
    border-top: 1px solid #fcd34d;
    border-bottom: 1px solid #fcd34d;
    font-weight: 700;
  }
  .payable dd {
    font-size: 1.15rem;
  }
  .cap-note {
    font-size: 0.8rem;
  }
</style>
