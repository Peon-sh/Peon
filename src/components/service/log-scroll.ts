export const STICK_TO_BOTTOM_PX = 48;

/** True when the viewport is within `threshold` pixels of the bottom. */
export function isStuckToBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  threshold = STICK_TO_BOTTOM_PX,
) {
  return scrollHeight - scrollTop - clientHeight < threshold;
}
