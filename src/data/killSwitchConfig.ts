import type { Terpene } from '../engine/types.ts';

export interface KillSwitchEntry {
  // Terpene fraction (pct / total_pcts) above which the kill-switch fires.
  // Measures terpene DOMINANCE in the profile, NOT THC percentage.
  threshold: number;
}

// Per-terpene dominance thresholds.
// Launch defaults: pinene + terpinolene are tighter (anxiety-sensitising terpenes with
// stronger literature support for adverse effects at lower fractions).
// Tune individual entries as clinical evidence accumulates.
export const KILL_SWITCH_CONFIG: Record<Terpene, KillSwitchEntry> = {
  myrcene:        { threshold: 0.25 },
  limonene:       { threshold: 0.20 },
  linalool:       { threshold: 0.20 },
  caryophyllene:  { threshold: 0.20 },
  pinene:         { threshold: 0.15 },
  terpinolene:    { threshold: 0.15 },
  humulene:       { threshold: 0.25 },
  ocimene:        { threshold: 0.25 },
};

export const KILL_SWITCH_DEFAULT_THRESHOLD = 0.20;

export function getKillSwitchThreshold(terpene: string): number {
  return (KILL_SWITCH_CONFIG as Record<string, KillSwitchEntry | undefined>)[terpene]?.threshold
    ?? KILL_SWITCH_DEFAULT_THRESHOLD;
}
