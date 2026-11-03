type Rect = { left: number; right: number; top: number; bottom: number };
/** Measured physical coordinates for a fixed portal; clamp both edges in either reading direction. */
export function menuPosition(
  trigger: Rect,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  rtl: boolean,
) {
  const gutter = 12;
  const maxLeft = Math.max(gutter, viewport.width - menu.width - gutter);
  const preferredLeft = rtl ? trigger.left : trigger.right - menu.width;
  const below = trigger.bottom + 6;
  const above = trigger.top - menu.height - 6;
  const preferredTop = below + menu.height <= viewport.height - gutter ? below : above;
  return {
    left: Math.max(gutter, Math.min(preferredLeft, maxLeft)),
    top: Math.max(gutter, Math.min(preferredTop, viewport.height - menu.height - gutter)),
  };
}
