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
    <strong>上限適用後の金額で精算</strong>
    <span
      >実績計算 {formatYen(calculation.uncappedYen)} → 時間報酬 {formatYen(
        payableYen,
      )}</span
    >
    <span>Issue全期間の上限 {formatYen(calculation.capYen ?? 0)}（税抜）</span>
    <span
      >他月・他の作業者への計上分を含む残額を適用しています。稼働時間と固定報酬は減りません。</span
    >
  </div>
{/if}

<style>
  .cap-detail {
    display: grid;
    gap: 0.25rem;
    font-size: 0.85rem;
    white-space: normal;
  }
</style>
