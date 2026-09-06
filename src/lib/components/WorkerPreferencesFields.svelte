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
  <span>{preferenceQuestions.availabilityNote} <small>任意</small></span>
  <textarea
    name="availabilityNote"
    rows="3"
    maxlength="2000"
    bind:value={availability}
    placeholder="週5時間程度、平日夜中心、9月後半は休みたい、依頼を増やしたい"
  ></textarea>
</label>
<label>
  <span>{preferenceQuestions.selfAssignmentNote} <small>任意</small></span>
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
  {#each preferenceExampleGroups as group (group.title)}
    <p>{group.title}</p>
    <div class="examples">
      {#each group.examples as example (example)}
        <button
          type="button"
          onclick={() => appendExample(example)}
          disabled={workPreference.split("\n").includes(example)}
          >{example}</button
        >
      {/each}
    </div>
  {/each}
</details>
<fieldset>
  <legend>{preferenceQuestions.partnerInterest} <small>必須</small></legend>
  {#each partnerInterestOptions as option (option.value)}
    <label class="choice"
      ><input
        type="radio"
        name="partnerInterest"
        value={option.value}
        bind:group={interest}
        required
      />{option.label}</label
    >
  {/each}
  <p class="muted">回答は案件紹介や参画を確約するものではありません。</p>
</fieldset>
{#if interest === "interested" || interest === "conditional"}
  <label>
    <span>{preferenceQuestions.partnerConditions} <small>任意</small></span>
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
    border: 1px solid #d9e1e8;
    border-radius: 0.5rem;
    padding: 1rem;
  }
  legend {
    max-width: 100%;
  }
  .choice {
    display: flex;
    align-items: center;
    margin: 0.65rem 0;
  }
  .choice input {
    width: auto;
  }
  small {
    color: #526174;
    font-weight: normal;
  }
  .examples {
    display: grid;
    gap: 0.4rem;
  }
  .examples button {
    text-align: left;
    white-space: normal;
  }
</style>
