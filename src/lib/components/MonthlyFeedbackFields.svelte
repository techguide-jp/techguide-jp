<script lang="ts">
  import {
    feedbackQuestions,
    type MonthlyFeedbackInput,
  } from "$lib/monthlyFeedback";
  let { input }: { input: MonthlyFeedbackInput } = $props();
  const initial = () => input;
  let operatorComment = $state(initial().operatorComment);
  let privateReflection = $state(initial().privateReflection);
  let synced = $state(JSON.stringify(initial()));
  $effect(() => {
    const key = JSON.stringify(input);
    if (key === synced) return;
    synced = key;
    operatorComment = input.operatorComment;
    privateReflection = input.privateReflection;
  });
</script>

<input type="hidden" name="feedbackVersion" value={input.version} />
<label
  ><span class="form-field-label"
    >{feedbackQuestions.operatorComment}
    <small class="form-optional">任意</small></span
  >
  <small class="form-hint">運営にも表示されます。</small>
  <textarea
    name="operatorComment"
    rows="3"
    maxlength="2000"
    bind:value={operatorComment}
    placeholder="よかった点、Issueの切り方、報酬、やり取りで気になった点"
  ></textarea>
</label>
<label
  ><span class="form-field-label"
    >{feedbackQuestions.privateReflection}
    <small class="form-optional">任意</small></span
  >
  <small class="form-hint">本人だけが閲覧できます。</small>
  <textarea
    name="privateReflection"
    rows="3"
    maxlength="2000"
    bind:value={privateReflection}
    placeholder="できたこと、学んだこと、次に改善したいこと"></textarea>
</label>

<style>
  label {
    display: grid;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  textarea {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
</style>
