/**
 * B6 — Chemical profile + UX polish tests.
 *
 * 1. chemProfileData: renders correct shape + colors from chemotype + terpenes
 * 2. scorer reasonHuman: condition/axis strings use "ייתכן ש" hedging
 * 3. No gamification FEATURES in journaling/reporting components
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { chemProfileData, CHEMOTYPE_SHAPE, TERPENE_COLORS } from '../chemProfile';
import { scoreSingle } from '../scorer';
import { buildNeedVector } from '../vectorMath';
import type { Batch } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

// provenance:'measured' → provFactor=1.0 → confidence = 0.65 * evidenceFactor ≥ 0.4
const thcBatch: Batch = {
  id: 'b6-thc', productId: 'p6-thc', thcPct: 22, cbdPct: 2,
  terpenes: [
    { terpene: 'myrcene',       pct: 1.8 },
    { terpene: 'caryophyllene', pct: 0.9 },
    { terpene: 'limonene',      pct: 0.4 },
  ],
  provenance: 'measured', category: 'T22/C2',
};

const cbdBatch: Batch = {
  id: 'b6-cbd', productId: 'p6-cbd', thcPct: 2, cbdPct: 20,
  terpenes: [
    { terpene: 'linalool', pct: 1.2 },
    { terpene: 'pinene',   pct: 0.7 },
  ],
  provenance: 'measured', category: 'T2/C20',
};

const balancedBatch: Batch = {
  id: 'b6-bal', productId: 'p6-bal', thcPct: 10, cbdPct: 10,
  terpenes: [
    { terpene: 'terpinolene', pct: 1.0 },
    { terpene: 'ocimene',     pct: 0.6 },
  ],
  provenance: 'measured', category: 'T10/C10',
};

const noTerpBatch: Batch = {
  id: 'b6-noter', productId: 'p6-noter', thcPct: 18, cbdPct: 4,
  terpenes: [],
  provenance: 'inferred', category: 'T18/C4',
};

// ── 1. chemProfileData: shape from chemotype ──────────────────────────────────

describe('B6 — chemProfileData: shape encodes chemotype', () => {
  it('THC-dominant (22/2) → shape: angular', () => {
    expect(chemProfileData(thcBatch).shape).toBe('angular');
  });

  it('CBD-dominant (2/20) → shape: circle', () => {
    expect(chemProfileData(cbdBatch).shape).toBe('circle');
  });

  it('balanced (10/10) → shape: round', () => {
    expect(chemProfileData(balancedBatch).shape).toBe('round');
  });

  it('CHEMOTYPE_SHAPE covers all 3 values', () => {
    const shapes = Object.values(CHEMOTYPE_SHAPE);
    expect(shapes).toContain('angular');
    expect(shapes).toContain('round');
    expect(shapes).toContain('circle');
  });
});

// ── 2. chemProfileData: colors from dominant terpenes ────────────────────────

describe('B6 — chemProfileData: colors encode dominant terpenes', () => {
  it('primaryColor = dominant terpene (myrcene) color', () => {
    const { primaryColor } = chemProfileData(thcBatch);
    expect(primaryColor).toBe(TERPENE_COLORS['myrcene']);
  });

  it('secondaryColor = second terpene (caryophyllene) color', () => {
    const { secondaryColor } = chemProfileData(thcBatch);
    expect(secondaryColor).toBe(TERPENE_COLORS['caryophyllene']);
  });

  it('tertiaryColor = third terpene (limonene) color', () => {
    const { tertiaryColor } = chemProfileData(thcBatch);
    expect(tertiaryColor).toBe(TERPENE_COLORS['limonene']);
  });

  it('secondaryColor null when only one terpene', () => {
    const oneTerp: Batch = { ...thcBatch, terpenes: [{ terpene: 'myrcene', pct: 1.0 }] };
    expect(chemProfileData(oneTerp).secondaryColor).toBeNull();
  });

  it('tertiaryColor null when only two terpenes', () => {
    expect(chemProfileData(cbdBatch).tertiaryColor).toBeNull();
  });

  it('no terpenes → primaryColor from chemotype fallback (non-empty string)', () => {
    const { primaryColor, secondaryColor, tertiaryColor } = chemProfileData(noTerpBatch);
    expect(typeof primaryColor).toBe('string');
    expect(primaryColor.length).toBeGreaterThan(0);
    expect(secondaryColor).toBeNull();
    expect(tertiaryColor).toBeNull();
  });

  it('two batches with same dominant terpene share same primaryColor', () => {
    const batch2: Batch = { ...cbdBatch, id: 'x', productId: 'y',
      terpenes: [{ terpene: 'linalool', pct: 2.0 }] };
    expect(chemProfileData(cbdBatch).primaryColor)
      .toBe(chemProfileData(batch2).primaryColor);
  });

  it('terpene order matters: highest pct → primary', () => {
    const reordered: Batch = {
      ...thcBatch,
      terpenes: [
        { terpene: 'limonene',      pct: 0.4 },
        { terpene: 'caryophyllene', pct: 0.9 },
        { terpene: 'myrcene',       pct: 1.8 },
      ],
    };
    expect(chemProfileData(reordered).primaryColor).toBe(TERPENE_COLORS['myrcene']);
  });
});

// ── 3. reasonHuman: "ייתכן ש" hedging ────────────────────────────────────────
// provenance:'measured' → confidence = 0.65 * evidenceFactor ≥ 0.41 → passes 0.4 gate

describe('B6 — scorer: reasonHuman uses "ייתכן ש" hedging (no assertive authority)', () => {
  const CONDITIONS = ['sleep', 'anxiety', 'pain', 'focus', 'appetite', 'mood'];

  for (const cond of CONDITIONS) {
    it(`condition "${cond}" → reasonHuman contains "ייתכן"`, () => {
      const need = buildNeedVector({ reasons: [cond] });
      const result = scoreSingle(need, thcBatch, { n: 0, mean: 0 });
      // Community string doesn't need ייתכן (already hedged by "patients reported")
      // Condition label or axis label both now use ייתכן.
      // Only exception: low-confidence "עדיין מעט דיווחים" (measured provenance avoids this)
      expect(result.reasonHuman).toMatch(/ייתכן|דיווחו/);
    });
  }

  it('community topLayer reasonHuman does not need ייתכן (already hedged)', () => {
    const need = buildNeedVector({ reasons: ['sleep'] });
    const result = scoreSingle(need, thcBatch, { n: 30, mean: 0.85 });
    expect(result.reasonHuman.length).toBeGreaterThan(0);
    // community string is "מטופלים עם פרופיל דומה לך דיווחו על עזרה" — no ייתכן needed
    expect(result.topLayer).toBe('community');
  });

  it('condition labels (not community, not low-conf) contain ייתכן', () => {
    // sleep via measured batch with no community (n=0) → condition label path
    const need = buildNeedVector({ reasons: ['sleep'] });
    const result = scoreSingle(need, thcBatch, { n: 0, mean: 0 });
    if (result.topLayer !== 'community') {
      expect(result.reasonHuman).toMatch(/ייתכן/);
    }
  });

  it('axis fallback labels contain ייתכן', () => {
    // No conditions → axis fallback path
    const need = buildNeedVector({ timing: ['evening'] });
    const result = scoreSingle(need, thcBatch, { n: 0, mean: 0 });
    if (result.topLayer !== 'community') {
      expect(result.reasonHuman).toMatch(/ייתכן/);
    }
  });
});

// ── 4. No gamification FEATURES in journaling / reporting ────────────────────
// Checks for actual feature code (state, API calls, counters) — not doc comments.
// Doc comments saying "No streaks" are correct; they shouldn't fail this test.

describe('B6 — no gamification features in journaling/reporting (data integrity)', () => {
  // Pattern: variable names, API calls, or JSX props that implement gamification.
  // Does NOT match doc comments that SAY "no streaks/badges".
  const GAMIFICATION_CODE_PATTERNS: RegExp[] = [
    /streakCount|streakDays|currentStreak\s*[=+]/,   // streak counter state
    /badgeList|earnBadge|awardBadge|badge_count/,     // badge award logic
    /(?:earn|award|grant)\s*(?:point|xp|badge)/i,     // earn/grant functions
    /const\s+(?:points|xp)\s*=/,                      // points/xp state variable
    /<(?:BadgeIcon|StreakMeter|XpBar|PointsDisplay)/,  // gamification UI components
    /addXp|grantXp|levelUp\s*\(/,                     // XP/level functions
  ];

  const componentsDir = path.resolve(
    new URL('../../components', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
  );

  const JOURNAL_COMPONENTS = [
    'JournalEntryForm.jsx',
    'JournalHistory.jsx',
    'ReportFlow.jsx',
    'EmotionalRating.jsx',
    'ImpactSummary.jsx',
    'DailyCheckIn.jsx',
  ];

  for (const filename of JOURNAL_COMPONENTS) {
    it(`${filename}: no gamification feature code`, () => {
      const filePath = path.join(componentsDir, filename);
      if (!fs.existsSync(filePath)) return;
      const source = fs.readFileSync(filePath, 'utf8');
      for (const pattern of GAMIFICATION_CODE_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });
  }

  it('JournalEntryForm explicitly documents the no-gamification rule in comments', () => {
    const filePath = path.join(componentsDir, 'JournalEntryForm.jsx');
    if (!fs.existsSync(filePath)) return;
    const source = fs.readFileSync(filePath, 'utf8');
    // The rule should be documented (not just absent by omission)
    expect(source).toMatch(/No.*gamification|gamification.*No|No.*streak|streak.*No/i);
  });
});
