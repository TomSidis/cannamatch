import { describe, it, expect } from "vitest";
import { validateComment } from "../commentFilter.js";

// Override helper: inject a test profanity word without mutating shared config.
const withProfanity = (word) => ({ blockedWords: [word] });

// ── Empty / blank ─────────────────────────────────────────────────────────────
describe("empty body", () => {
  it("rejects null",            () => expect(validateComment(null).ok).toBe(false));
  it("rejects undefined",       () => expect(validateComment(undefined).ok).toBe(false));
  it("rejects empty string",    () => expect(validateComment("").ok).toBe(false));
  it("rejects whitespace-only", () => expect(validateComment("   ").ok).toBe(false));
  it("reason is 'empty'",       () => expect(validateComment("").reason).toBe("empty"));
});

// ── Clean comment ─────────────────────────────────────────────────────────────
describe("clean comment passes", () => {
  it("plain Hebrew text",          () => expect(validateComment("עזר לי מאוד עם כאבי הגב").ok).toBe(true));
  it("mixed text",                 () => expect(validateComment("שינה טובה, 10/10").ok).toBe(true));
  it("comment with image context", () => expect(validateComment("ראו את התמונה שצירפתי").ok).toBe(true));
});

// ── External links ────────────────────────────────────────────────────────────
describe("external links are blocked", () => {
  it("http:// → external_link",   () => {
    const r = validateComment("בדוק http://example.com");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("external_link");
  });
  it("https:// → external_link",  () => {
    expect(validateComment("https://spam.com/buy").ok).toBe(false);
  });
  it("www. prefix → external_link", () => {
    expect(validateComment("כנס ל www.example.com").ok).toBe(false);
  });
  it("bare .com domain → external_link", () => {
    expect(validateComment("לך ל example.com").ok).toBe(false);
  });
  it(".co.il domain → external_link", () => {
    expect(validateComment("ראה כאן: example.co.il").ok).toBe(false);
  });
  it("image via external URL is also blocked (use upload mechanism)", () => {
    expect(validateComment("https://imgur.com/abc.jpg").ok).toBe(false);
  });
  // email address should NOT trigger link block (@ lookbehind)
  it("email address does NOT trigger external_link", () => {
    expect(validateComment("צור קשר user@example.com").ok).toBe(true);
  });
});

// ── Profanity ─────────────────────────────────────────────────────────────────
describe("profanity (config-injected word)", () => {
  it("blocked word → profanity",   () => {
    const r = validateComment("מה ה-TESTWORD הזה", withProfanity("testword"));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("profanity");
  });
  it("case-insensitive match",     () => {
    expect(validateComment("BADWORD נוראי", withProfanity("badword")).ok).toBe(false);
  });
  it("word NOT in list → passes",  () => {
    expect(validateComment("מילה כלשהי", withProfanity("different")).ok).toBe(true);
  });
  it("empty BLOCKED_WORDS → passes any text", () => {
    expect(validateComment("גידוף כלשהו", { blockedWords: [] }).ok).toBe(true);
  });
});

// ── Sales / spam keywords ─────────────────────────────────────────────────────
describe("sales keywords are blocked", () => {
  it('"למכירה" → sales',   () => {
    const r = validateComment("זן זה למכירה");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("sales");
  });
  it('"מחיר" → sales',    () => expect(validateComment("מה המחיר?").ok).toBe(false));
  it('"₪" → sales',        () => expect(validateComment("200₪ בלבד").ok).toBe(false));
  it('"במבצע" → sales',   () => expect(validateComment("זמין במבצע").ok).toBe(false));
});

// ── Phone number patterns ─────────────────────────────────────────────────────
describe("phone numbers are blocked (as sales/spam)", () => {
  it("Israeli mobile 0521234567 → sales",  () => {
    expect(validateComment("התקשרו 0521234567").ok).toBe(false);
  });
  it("formatted 052-123-4567 → sales",    () => {
    expect(validateComment("052-123-4567").ok).toBe(false);
  });
  it("+972 prefix → sales",               () => {
    expect(validateComment("+972521234567").ok).toBe(false);
  });
  it("reason is 'sales' for phone",        () => {
    expect(validateComment("052 123 4567").reason).toBe("sales");
  });
});

// ── Length limit ──────────────────────────────────────────────────────────────
describe("length limit: over 1000 chars → rejected, exactly 1000 → passes", () => {
  it("1001-char body → too_long",  () => {
    const r = validateComment("א".repeat(1001));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("too_long");
  });

  it("reason includes maxLength",  () => {
    const r = validateComment("א".repeat(1001));
    expect(r.maxLength).toBe(1000);
  });

  it("exactly 1000 chars → passes", () => {
    expect(validateComment("א".repeat(1000)).ok).toBe(true);
  });

  it("999 chars → passes",          () => {
    expect(validateComment("א".repeat(999)).ok).toBe(true);
  });

  it("over-long body is NOT truncated — rejected outright", () => {
    // If we ever silently slice instead of reject, this test catches it.
    // The route must return 400, not store a truncated body.
    const r = validateComment("א".repeat(1500));
    expect(r.ok).toBe(false);
  });

  it("custom maxLength override works", () => {
    const r = validateComment("א".repeat(51), { maxLength: 50 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("too_long");
  });
});

// ── Rejection returns message, not silent store-and-hide ─────────────────────
describe("rejection shape", () => {
  it("rejected result has ok=false and a reason string", () => {
    const r = validateComment("https://spam.com");
    expect(r.ok).toBe(false);
    expect(typeof r.reason).toBe("string");
    expect(r.reason.length).toBeGreaterThan(0);
  });
  it("accepted result has ok=true and no reason", () => {
    const r = validateComment("תגובה תקינה לגמרי");
    expect(r.ok).toBe(true);
    expect(r.reason).toBeUndefined();
  });
});
