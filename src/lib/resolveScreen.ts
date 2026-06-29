/**
 * resolveScreen — single routing decision, pure and testable.
 *
 * Takes a storage-like interface (any object with a `get(key)` method) so
 * tests can pass a plain object without mocking localStorage.
 *
 * Routing order (immutable — never patch with one-off flags):
 *   1. No valid token / user   → "welcome"       (login / register)
 *   2. Logged in, no welcome   → "welcome_room"  (ברוכים הבאים)
 *   3. Welcome seen, no done   → "onboarding"
 *   4. Onboarding done (flag OR existing profile data) → "app"
 *
 * @param store   — storage accessor ({ get(k): string|null })
 * @param onCorrupt — optional callback fired when stored JSON is corrupt;
 *                    the caller should clear the corrupt keys from real storage
 */
export type Screen = "welcome" | "welcome_room" | "onboarding" | "app";

export function resolveScreen(
  store: { get(k: string): string | null },
  onCorrupt?: () => void,
): Screen {
  try {
    const token = store.get("cm_session_token");
    const raw   = store.get("cm_user");
    if (!token || !raw) return "welcome";
    JSON.parse(raw); // throws if corrupt → caught below

    // Onboarding done via explicit flag?
    if (store.get("cm_onboarding_done")) return "app";

    // Onboarding done via pre-existing profile data?
    try {
      const p = JSON.parse(store.get("cm_profile_v2") || "{}");
      if (
        (p?.ans?.reasons?.length ?? 0) > 0 ||
        (p?.ans?.form?.length    ?? 0) > 0 ||
        (p?.ans?.helped?.length  ?? 0) > 0
      ) return "app";
    } catch { /* malformed profile — ignore, continue routing */ }

    // Welcome screen seen but onboarding not yet done
    if (store.get("cm_welcome_seen")) return "onboarding";

    // Logged in but hasn't seen the welcome screen yet
    return "welcome_room";
  } catch {
    // Corrupt cm_user JSON
    onCorrupt?.();
    return "welcome";
  }
}
