import type { Leaning } from './types';

/**
 * Chart + state palette. These three hues are categorical slots 1–3 of the
 * validated reference palette; the trio clears every gate (lightness band,
 * chroma floor, all-pairs CVD separation, normal-vision floor, 3:1 contrast)
 * against this app's dark surface #151821. Do not substitute by eye — re-run
 * the palette validator if you change them.
 */
export const LEANING_COLORS: Record<Leaning, string> = {
  guilty: '#d95926', // orange — warm pole
  not_guilty: '#199e70', // aqua — cool pole
  uncertain: '#3987e5', // blue — neither pole
};

export const INK = {
  primary: '#ffffff',
  secondary: '#c3c2b7',
  muted: '#898781',
  grid: '#242a38',
  axis: '#333b4d',
  surface: '#151821',
};

export function leaningColor(leaning: Leaning): string {
  return LEANING_COLORS[leaning];
}

/** Blends the two poles for the continuous lean scale (-1 → +1). */
export function leanColor(lean: number): string {
  if (lean > 0.2) return LEANING_COLORS.guilty;
  if (lean < -0.2) return LEANING_COLORS.not_guilty;
  return LEANING_COLORS.uncertain;
}
