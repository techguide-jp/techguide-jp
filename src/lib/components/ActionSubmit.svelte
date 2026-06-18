<script lang="ts">
  type Props = {
    actionName: string;
    pendingAction: string | null;
    label: string;
    pendingLabel: string;
    disabled?: boolean;
    variant?: "primary" | "secondary" | "danger";
  };

  let {
    actionName,
    pendingAction,
    label,
    pendingLabel,
    disabled = false,
    variant = "primary",
  }: Props = $props();

  const isPending = $derived(pendingAction === actionName);
</script>

<button
  class="button {variant}"
  type="submit"
  disabled={disabled || pendingAction !== null}
  aria-busy={isPending}
>
  {isPending ? pendingLabel : label}
</button>
