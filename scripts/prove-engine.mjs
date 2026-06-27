/**
 * PROOF SCRIPT — Phase A
 * Runs the scoring engine with 3 different profiles and prints top-10 with scores.
 * Shows PTSD vs Epilepsy vs Morning-timing produce different strain lists.
 *
 * Run: node scripts/prove-engine.mjs
 */

import { STRAINS } from '../src/data/strainsConfig.js';
import { bridgeScore } from '../src/engine/legacyBridge.ts';

const ALL_CATS = ["T22/C4","T18/C3","T15/C3","T12/C2","T10/C2",
  "T12/C12","T10/C10","T8/C8","T5/C5","T1/C1",
  "T0/C26","T1/C22","T3/C18","T3/C15","T3/C12","T5/C10"];

function simulate(label, ans) {
  const fullAns = { cats: ALL_CATS, killSwitches: [], ...ans };
  const results = STRAINS
    .filter(s => fullAns.cats.includes(s.cat))
    .map(s => { const r = bridgeScore(s, fullAns); return { ...s, match: r.matchPct }; })
    .sort((a, b) => b.match - a.match);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📋 ${label}`);
  console.log(`   reasons: [${fullAns.reasons?.join(', ') || '—'}]`);
  console.log(`${'─'.repeat(60)}`);
  results.slice(0, 10).forEach((s, i) => {
    const bar = '█'.repeat(Math.round(s.match / 5));
    console.log(`  ${String(i+1).padStart(2)}. ${s.name.padEnd(25)} ${String(s.match).padStart(3)}%  ${bar}`);
  });
  return results.slice(0, 5).map(s => s.id);
}

// ── Profile 1: PTSD (evening user) ───────────────────────────────
const ptsdTop5 = simulate('PTSD — ערב/לילה', {
  reasons: ['ptsd', 'anxiety', 'sleep'],
  terpWeights: { linalool: 1.3, limonene: 1.0, caryophyllene: 0.7 },
});

// ── Profile 2: Epilepsy (calm, CBD preference) ───────────────────
const epilepsyTop5 = simulate('אפילפסיה — יממה שלמה', {
  reasons: ['anxiety', 'sleep'],
  terpWeights: { linalool: 1.4, myrcene: 0.8, caryophyllene: 0.5 },
});

// ── Profile 3: Morning focus, chronic pain ────────────────────────
const morningTop5 = simulate('כאב כרוני — בוקר / ריכוז', {
  reasons: ['pain', 'focus'],
  terpWeights: { pinene: 1.2, limonene: 0.9, caryophyllene: 0.7 },
});

// ── Overlap analysis ─────────────────────────────────────────────
const overlap12 = ptsdTop5.filter(id => epilepsyTop5.includes(id)).length;
const overlap13 = ptsdTop5.filter(id => morningTop5.includes(id)).length;
const overlap23 = epilepsyTop5.filter(id => morningTop5.includes(id)).length;

console.log(`\n${'═'.repeat(60)}`);
console.log('📊 OVERLAP ANALYSIS (lower = more differentiated)');
console.log(`   PTSD ∩ Epilepsy  : ${overlap12}/5 shared in top-5`);
console.log(`   PTSD ∩ Morning   : ${overlap13}/5 shared in top-5`);
console.log(`   Epilepsy ∩ Morning: ${overlap23}/5 shared in top-5`);
console.log(`\n✅ If all overlaps < 3, the engine IS differentiating correctly.`);
console.log(`${'═'.repeat(60)}\n`);
