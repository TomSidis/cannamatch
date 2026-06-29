/**
 * resolveScreen — single routing decision, pure and testable.
 *
 * Takes a storage-like interface (any object with a `get(key)` method) so
 * tests can pass a plain object without mocking localStorage.
 *
 * Routing order (immutable — never patch with one-off flags):
 *   1. Intro not seen          → "intro"         (logo + what-the-app-does, once, pre-login)
 *   2. No valid token / user   → "welcome"       (login / register)
 *   3. Onboarding not done      → "onboarding"    (3-screen V3, DNA reveal is its last screen)
 *   4. Welcome ("ספיץ'") unseen → "welcome_room"  (Tom's intro, AFTER onboarding+DNA)
 *   5. → "app"                  (menu scan)
 *
 * Each pre-app step is gated by its own persisted flag so it shows ONCE and refresh
 * doesn't reset: cm_intro_seen, cm_session_token+cm_user, cm_onboarding_done, cm_welcome_seen.
 *
 * @param store   — storage accessor ({ get(k): string|null })
 * @param onCorrupt — optional callback fired when stored JSON is corrupt;
 *                    the caller should clear the corrupt keys from real storage
 */
export type Screen = "intro" | "welcome" | "welcome_room" | "onboarding" | "app";

export function resolveScreen(
  store: { get(k: string): string | null },
  onCorrupt?: () => void,
): Screen {
  try {
    // 1. Intro screen — shown once before anything else (even before login).
    if (!store.get("cm_intro_seen")) return "intro";

    const token = store.get("cm_session_token");
    const raw   = store.get("cm_user");
    if (!token || !raw) return "welcome";
    JSON.parse(raw); // throws if corrupt → caught below

    // 2. Onboarding done via explicit flag OR pre-existing profile data?
    let onboardingDone = !!store.get("cm_onboarding_done");
    if (!onboardingDone) {
      try {
        const p = JSON.parse(store.get("cm_profile_v2") || "{}");
        onboardingDone =
          (p?.ans?.reasons?.length ?? 0) > 0 ||
          (p?.ans?.form?.length    ?? 0) > 0 ||
          (p?.ans?.helped?.length  ?? 0) > 0;
      } catch { /* malformed profile — treat as not done */ }
    }
    if (!onboardingDone) return "onboarding";

    // 3. ספיץ' welcome — AFTER onboarding + DNA reveal, last screen before the app.
    if (!store.get("cm_welcome_seen")) return "welcome_room";

    // 4. Into the app (menu scan).
    return "app";
  } catch {
    // Corrupt cm_user JSON
    onCorrupt?.();
    return "welcome";
  }
}
