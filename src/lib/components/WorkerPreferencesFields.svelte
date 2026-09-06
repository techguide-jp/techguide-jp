<script lang="ts">
  import {
    preferenceQuestions,
    partnerInterestOptions,
    type WorkerPreferencesInput,
  } from "$lib/workerPreferences";
  import { preferenceExampleGroups } from "$lib/preferenceExamples";
  let { initial }: { initial: WorkerPreferencesInput } = $props();
  const initialValue = () => initial;
  let interest = $state(initialValue().partnerInterest);
  let availability = $state(initialValue().availabilityNote);
  let conditions = $state(initialValue().partnerConditions);
  let workPreference = $state(initialValue().selfAssignmentNote);
  const appendExample = (example: string) => {
    if (workPreference.split("\n").includes(example)) return;
    const next = [workPreference.trim(), example].filter(Boolean).join("\n");
    if (next.length <= 2000) workPreference = next;
  };
</script>

<input type="hidden" name="preferencesVersion" value={initial.version} />
<label>
  <span class="form-field-label"
    >{preferenceQuestions.availabilityNote}
    <small class="form-optional">任意</small></span
  >
  <textarea
    name="availabilityNote"
    rows="3"
    maxlength="2000"
    bind:value={availability}
    placeholder="週5時間程度、平日夜中心、9月後半は休みたい、依頼を増やしたい"
  ></textarea>
</label>
<label>
  <span class="form-field-label"
    >{preferenceQuestions.selfAssignmentNote}
    <small class="form-optional">任意</small></span
  >
  <textarea
    name="selfAssignmentNote"
    rows="3"
    maxlength="2000"
    bind:value={workPreference}
    placeholder="挑戦したい技術、担当したい領域、相談したい条件、避けたい進め方"
  ></textarea>
</label>
<details>
  <summary>希望例を見る</summary>
  <p class="form-hint">
    例文を押すと、上の「取り組みたい仕事」の入力欄に追加されます。追加後に編集できます。
  </p>
  {#each preferenceExampleGroups as group (group.title)}
    <p class="example-heading">{group.title}</p>
    <div class="examples">
      {#each group.examples as example (example)}
        <button
          type="button"
          onclick={() => appendExample(example)}
          disabled={workPreference.split("\n").includes(example)}
        >
          <span aria-hidden="true"
            >{workPreference.split("\n").includes(example) ? "✓" : "＋"}</span
          >
          <span>{example}</span>
        </button>
      {/each}
    </div>
  {/each}
</details>
<fieldset>
  <legend
    ><span class="form-field-label"
      >{preferenceQuestions.partnerInterest}
      <small class="form-required">必須</small></span
    ></legend
  >
  <div class="choices">
    {#each partnerInterestOptions as option (option.value)}
      <label class="choice" class:selected={interest === option.value}
        ><input
          type="radio"
          name="partnerInterest"
          value={option.value}
          bind:group={interest}
          required
        />{option.label}</label
      >
    {/each}
  </div>
  <p class="form-hint">回答は案件紹介や参画を確約するものではありません。</p>
</fieldset>
{#if interest === "interested" || interest === "conditional"}
  <label>
    <span class="form-field-label"
      >{preferenceQuestions.partnerConditions}
      <small class="form-optional">任意</small></span
    >
    <textarea
      name="partnerConditions"
      rows="3"
      maxlength="2000"
      bind:value={conditions}
      placeholder="仕事内容、稼働時間、報酬、リモート勤務など"></textarea>
  </label>
{/if}

<style>
  label {
    display: grid;
    gap: 0.5rem;
  }
  textarea {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  fieldset {
    min-width: 0;
  }
  legend {
    max-width: 100%;
  }
  .choices {
    display: grid;
    gap: 0.5rem;
    margin: 0.75rem 0;
  }
  .choice {
    display: flex;
    align-items: center;
    min-height: 3rem;
    padding: 0.75rem;
    border: 1px solid #94a3b8;
    border-radius: 0.375rem;
    cursor: pointer;
  }
  .choice:hover {
    background: #f8fafc;
  }
  .choice.selected {
    border-color: #0f766e;
    background: #f0fdfa;
  }
  .choice input {
    width: 1rem;
  }
  details {
    padding: 0.75rem 1rem;
    border: 1px solid #cbd5e1;
    border-radius: 0.375rem;
    background: #f8fafc;
  }
  summary {
    cursor: pointer;
    color: #0f766e;
    font-size: 0.875rem;
    font-weight: 700;
  }
  details[open] summary {
    margin-bottom: 0.75rem;
  }
  .example-heading {
    margin: 1rem 0 0.5rem;
    font-size: 0.875rem;
    font-weight: 700;
  }
  .examples {
    display: grid;
    gap: 0.4rem;
  }
  .examples button {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    border: 1px solid #94a3b8;
    border-radius: 0.375rem;
    background: white;
    cursor: pointer;
    font-size: 0.875rem;
    text-align: left;
    white-space: normal;
  }
  .examples button:hover:not(:disabled) {
    border-color: #0f766e;
    background: #f0fdfa;
  }
  .examples button:disabled {
    border-color: #cbd5e1;
    background: #f1f5f9;
    color: #64748b;
    cursor: default;
  }
</style>
