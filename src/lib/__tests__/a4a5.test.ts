/**
 * Phase A4 + A5 structural assertions.
 *
 * These are source-text tests — they prove that forbidden patterns are
 * absent and required patterns are present, without needing a DOM or
 * React renderer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const main  = readFileSync(join(__dirname, '../../CannaMatch.jsx'), 'utf8');
const comm  = readFileSync(join(__dirname, '../../components/CommentThread.jsx'), 'utf8');
const split = readFileSync(join(__dirname, '../../components/CommunitySplitScreen.jsx'), 'utf8');

// ── Phase A4 — removed elements ──────────────────────────────────────────────
describe('A4 — search bar removed', () => {
  it('no "חפש זן, מגדל" search shortcut button in source', () => {
    expect(main).not.toContain('חפש זן, מגדל');
  });
});

describe('A4 — indication chip list removed', () => {
  it('no chip-list block (INDICATION_CHIPS rendered in nav area)', () => {
    // The chip block was guarded by ["recs","menu","pharm","basket"].includes(tab)
    // followed by a visibleChips map — that entire block is gone
    expect(main).not.toContain('visibleChips');
  });
  it('no chip toggle button', () => {
    expect(main).not.toContain('toggleChip');
  });
  it('no chipExpanded state', () => {
    expect(main).not.toContain('chipExpanded');
  });
  it('no indFilterManual state', () => {
    expect(main).not.toContain('indFilterManual');
  });
});

describe('A4 — home page two-pane structure intact', () => {
  it('Dashboard component still exists', () => {
    expect(main).toContain('function Dashboard(');
  });
  it('CommunityMiniPanel still rendered inside Dashboard', () => {
    expect(main).toContain('CommunityMiniPanel');
  });
  it('MenuScan still rendered inside Dashboard', () => {
    expect(main).toContain('<MenuScan');
  });
});

describe('A4 — brand title still top-center', () => {
  it('brand title uses absolute+translateX(-50%) centering', () => {
    expect(main).toContain("translateX(-50%)");
    expect(main).toContain('קנאמאצ');
  });
});

describe('A4 — MenuScan: no paste tab, camera touch-only', () => {
  it('no "הדבקה" tab ID in MenuScan', () => {
    // The paste/text tab was removed; only "file" and "manual" remain
    expect(main).not.toMatch(/"text"\s*,\s*label.*הדבקה/);
  });
  it('"צלם" camera button is behind isTouch guard', () => {
    // Both must exist and isTouch must appear before צלם in the file
    expect(main).toContain('isTouch');
    const touchIdx = main.indexOf('isTouch');
    const camIdx   = main.indexOf('📷 צלם');
    expect(touchIdx).toBeGreaterThan(-1);
    expect(camIdx).toBeGreaterThan(touchIdx);
  });
  it('ManualStrainEntry autocomplete reads the live catalog (STRAINS = offline fallback)', () => {
    // Now live-catalog first: getCatalogStrains(q, cats); STRAINS only as the offline fallback.
    expect(main).toMatch(/getCatalogStrains\(s, ans\.cats/);
  });
});

// ── Phase A5 — keyboard support ───────────────────────────────────────────────
describe('A5 — login form Enter support', () => {
  it('login form wrapped in <form onSubmit>', () => {
    // Layer 1: email+password login form (doLogin replaced the OTP sendOtp handler)
    expect(main).toMatch(/<form onSubmit[\s\S]{0,60}doLogin/);
  });
  it('register form wrapped in <form onSubmit>', () => {
    // Layer 1: signup form (api.signup → welcome_room replaced the OTP go("verify") hop)
    expect(main).toMatch(/<form onSubmit[\s\S]{0,260}api\.signup/);
  });
  it('OTP verify form wrapped in <form onSubmit>', () => {
    expect(main).toMatch(/form onSubmit.*verify\(\)|<form onSubmit.*e\.preventDefault.*verify/);
  });
});

describe('A5 — Escape closes overlays', () => {
  it('global Escape handler covers showPerms', () => {
    expect(main).toContain('showPerms');
    expect(main).toMatch(/Escape[\s\S]{0,120}showPerms|showPerms[\s\S]{0,120}Escape/);
  });
  it('global Escape handler covers reportStrain', () => {
    expect(main).toMatch(/Escape[\s\S]{0,120}reportStrain|closeReport[\s\S]{0,120}Escape/);
  });
  it('PermissionModal has its own Escape handler', () => {
    expect(main).toMatch(/PermissionModal[\s\S]{0,600}Escape|Escape[\s\S]{0,200}onDone/);
  });
  it('StrainDetailDrawer has Escape handler', () => {
    expect(main).toMatch(/onClose[\s\S]{0,200}Escape|Escape[\s\S]{0,200}onClose/);
  });
});

describe('A5 — community/comments keyboard', () => {
  it('CommunitySplitScreen composer: Ctrl+Enter submits', () => {
    expect(split).toMatch(/ctrlKey.*submit|metaKey.*submit/i);
  });
  it('CommentThread textarea: Ctrl+Enter submits', () => {
    expect(comm).toMatch(/ctrlKey.*send|metaKey.*send/i);
  });
});

describe('A5 — ManualStrainEntry keyboard', () => {
  it('Enter on suggestion selects it', () => {
    expect(main).toMatch(/key.*Enter.*addEntry|Enter.*addEntry/);
  });
  it('Escape dismisses suggestions', () => {
    expect(main).toMatch(/key.*Escape.*setShowSugg|Escape.*setShowSugg/);
  });
});
