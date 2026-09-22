import type { Action } from "svelte/action";

export const dismissOnBackdrop: Action<HTMLDialogElement, () => void> = (
  dialog,
  dismiss,
) => {
  let startedOutside = false;
  const isOutside = (event: MouseEvent): boolean => {
    if (event.target !== dialog) return false;
    const rect = dialog.getBoundingClientRect();
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  };
  const pointerdown = (event: PointerEvent) => {
    startedOutside = event.button === 0 && isOutside(event);
  };
  const click = (event: MouseEvent) => {
    // 入力欄から背景へドラッグしただけでは、入力中のモーダルを閉じない。
    const shouldDismiss = startedOutside && isOutside(event);
    startedOutside = false;
    if (shouldDismiss) dismiss();
  };
  dialog.addEventListener("pointerdown", pointerdown);
  dialog.addEventListener("click", click);
  return {
    destroy() {
      dialog.removeEventListener("pointerdown", pointerdown);
      dialog.removeEventListener("click", click);
    },
  };
};
