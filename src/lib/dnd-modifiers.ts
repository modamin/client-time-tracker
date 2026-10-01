import type { Modifier } from "@dnd-kit/core";

/** Keeps a dragged item on the vertical axis (rows only move up/down). */
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });
