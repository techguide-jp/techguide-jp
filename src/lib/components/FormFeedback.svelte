<script lang="ts">
  type Props = {
    feedback: { messages: string[]; isError: boolean } | null;
    element?: HTMLElement | null;
  };

  let { feedback, element = $bindable(null) }: Props = $props();
</script>

{#if feedback}
  <div
    bind:this={element}
    class={feedback.isError
      ? "form-error form-feedback"
      : "notice form-feedback"}
    role={feedback.isError ? "alert" : "status"}
  >
    {#if feedback.isError && feedback.messages.length > 1}
      <p class="form-feedback-lead">入力内容を確認してください。</p>
      <ul class="form-feedback-list">
        {#each feedback.messages as message (message)}
          <li>{message}</li>
        {/each}
      </ul>
    {:else}
      <p class="form-feedback-single">{feedback.messages[0]}</p>
    {/if}
  </div>
{/if}
