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
  ><span
    >{feedbackQuestions.operatorComment} <small>任意・運営にも表示</small></span
  >
  <textarea
    name="operatorComment"
    rows="3"
    maxlength="2000"
    bind:value={operatorComment}
    placeholder="よかった点、Issueの切り方、報酬、やり取りで気になった点"
  ></textarea>
</label>
<label
  ><span
    >{feedbackQuestions.privateReflection}
    <small>任意・本人だけが閲覧できます</small></span
  >
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
  small {
    color: #526174;
    font-weight: normal;
  }
</style>
