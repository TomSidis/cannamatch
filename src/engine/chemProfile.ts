/**
 * chemProfile.ts — pure chemical fingerprint data function (B6).
 *
 * Encodes chemotype + dominant terpenes into a renderable profile shape:
 *   shape     = cannabinoid ratio (THC:CBD) → 'angular' | 'round' | 'circle'
 *   colors[0] = dominant terpene color (primary fill)
 *   colors[1] = second terpene color   (border / gradient stop)
 *   colors[2] = third terpene color    (accent dot)
 *
 * "Similar profile → similar effect" is encoded by visual similarity:
 *   same shape  → same chemotype
 *   same colors → same dominant terpenes → similar effect axis
 *
 * No React dependency — import from components freely.
 */

import { chemotypeFromBatch } from './vectorMath.ts';
import type { Batch, Chemotype } from './types.ts';

// Mirrors TERP_META in ds.js — engine layer must not depend on the design system.
export const TERPENE_COLORS: Record<string, string> = {
  myrcene:       '#4ade80',
  limonene:      '#fde047',
  caryophyllene: '#f87171',
  linalool:      '#c084fc',
  pinene:        '#86efac',
  humulene:      '#fbbf24',
  terpinolene:   '#fb923c',
  ocimene:       '#38bdf8',
};

// Shape encoding: border-radius archetype per chemotype.
export const CHEMOTYPE_SHAPE = {
  thcDominant: 'angular',  // square-ish, THC:CBD ≥ 3
  balanced:    'round',    // soft pill, 1/3 < ratio < 3
  cbdDominant: 'circle',   // fully circular, THC:CBD ≤ 0.33
} as const satisfies Record<Chemotype, string>;

export type ChemShape = 'angular' | 'round' | 'circle';

// Fallback fill when no terpenes are declared — chemotype-driven.
const CHEMOTYPE_FALLBACK_COLOR: Record<Chemotype, string> = {
  thcDominant: '#4ade80',  // green
  balanced:    '#a78bfa',  // violet
  cbdDominant: '#38bdf8',  // sky-blue
};

export interface ChemProfileResult {
  shape:          ChemShape;
  primaryColor:   string;         // always set; terpene-derived or chemotype fallback
  secondaryColor: string | null;  // null when only 0-1 terpenes
  tertiaryColor:  string | null;  // null when fewer than 3 terpenes
  chemotype:      Chemotype;
}

export function chemProfileData(batch: Batch): ChemProfileResult {
  const chemotype = chemotypeFromBatch(batch);
  const shape     = CHEMOTYPE_SHAPE[chemotype];

  const sorted = [...batch.terpenes].sort((a, b) => b.pct - a.pct);

  const primaryColor   = TERPENE_COLORS[sorted[0]?.terpene] ?? CHEMOTYPE_FALLBACK_COLOR[chemotype];
  const secondaryColor = sorted[1] ? (TERPENE_COLORS[sorted[1].terpene] ?? null) : null;
  const tertiaryColor  = sorted[2] ? (TERPENE_COLORS[sorted[2].terpene] ?? null) : null;

  return { shape, primaryColor, secondaryColor, tertiaryColor, chemotype };
}
