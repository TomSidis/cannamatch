// ─────────────────────────────────────────────
//  קנאמאצ׳ — שכבת ה-API (כל הקריאות ל-Node backend)
//  בפיתוח: Vite מפנה /api → localhost:8787 (proxy)
// ─────────────────────────────────────────────

function getStoredSessionToken() {
  try { return localStorage.getItem("cm_session_token"); } catch { return null; }
}

async function apiFetch(path, opts = {}) {
  const token = getStoredSessionToken();
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // אימות — מייל + סיסמה
  signup: (email, password) =>
    apiFetch(`/api/auth/signup`, { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email, password) =>
    apiFetch(`/api/auth/login`, { method: "POST", body: JSON.stringify({ email, password }) }),
  // OTP — נשמר ל-flows קיימים שאינם מסך הכניסה הראשי
  sendOtp: (contact) => apiFetch(`/api/auth/send-otp`, { method: "POST", body: JSON.stringify({ contact }) }),
  verifyOtp: (contact, code) =>
    apiFetch(`/api/auth/verify-otp`, { method: "POST", body: JSON.stringify({ contact, code }) }),
  submitOnboarding: (payload) =>
    apiFetch(`/api/auth/onboarding`, { method: "POST", body: JSON.stringify({ payload }) }),

  // פרופיל DNA
  getDNA: (userId) => apiFetch(`/api/dna/${userId}`),
  updateDNA: (userId, strain_id, feedback) =>
    apiFetch(`/api/dna/${userId}`, { method: "PUT", body: JSON.stringify({ strain_id, feedback }) }),
  checkin: (userId, dimension, value) =>
    apiFetch(`/api/dna/${userId}/checkin`, { method: "POST", body: JSON.stringify({ dimension, value }) }),

  // זנים + תפריט
  // Returns { results: Strain[], peek: { enabled, count, categories } } when user_id
  // is provided (scored path), or a plain Strain[] when it is not (search path).
  getStrains: ({ type, q, user_id } = {}) => {
    const p = new URLSearchParams();
    if (type)    p.set("type",    type);
    if (q)       p.set("q",       q);
    if (user_id) p.set("user_id", user_id);
    return apiFetch(`/api/strains?${p}`).then(res =>
      // Normalize: server wraps scored results in { results, peek }; bare search returns array.
      Array.isArray(res) ? { results: res, peek: null } : res,
    );
  },
  parseMenu: ({ image_base64, media_type, text, url, user_id }) =>
    apiFetch(`/api/parse-menu`, { method: "POST",
      body: JSON.stringify({ image_base64, media_type, text, url, user_id }) }),
  parseMenuImage: ({ image_base64, media_type }) =>
    apiFetch(`/api/parse-menu-image`, { method: "POST",
      body: JSON.stringify({ image_base64, media_type }) }),
  fetchMenuUrl: (url) => apiFetch(`/api/fetch-menu`, { method: "POST", body: JSON.stringify({ url }) }),

  // קטלוג חי לבורר האונבורדינג — product_sku active בלבד (לא pending). cats = סינון לפי רישיון.
  getCatalogStrains: (q = "", cats = []) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (cats.length) p.set("cats", cats.join(","));
    return apiFetch(`/api/catalog/strains?${p}`);
  },

  // חדש בשוק
  getNewOnMarket: (limit = 30) => apiFetch(`/api/new-on-market?limit=${limit}`),
  // Task 1a — user-scan triggered ingestion
  submitPendingScan: (names) => apiFetch('/api/pending-scan', { method: 'POST', body: JSON.stringify({ names }) }),

  // בתי מרקחת + מלאי
  getPharmacies: () => apiFetch(`/api/pharmacies`),
  syncPharmacies: () => apiFetch(`/api/pharmacies/sync`, { method: 'POST' }),
  getPharmacyMenu: (pharmacyId) => apiFetch(`/api/pharmacies/${pharmacyId}/menu`),
  verifyStock: (pharmacyId, batchId, answer) =>
    apiFetch(`/api/pharmacies/${pharmacyId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ batch_id: batchId, answer }),
    }),
  setStockAlert: (pharmacyId, strainId, strainName, pharmacyName) =>
    apiFetch(`/api/pharmacies/alert`, {
      method: 'POST',
      body: JSON.stringify({ pharmacy_id: pharmacyId, strain_id: strainId, strain_name: strainName, pharmacy_name: pharmacyName }),
    }),
  getStockAlerts: () => apiFetch(`/api/pharmacies/alerts`),
  deleteStockAlert: (alertId) =>
    apiFetch(`/api/pharmacies/alerts/${alertId}`, { method: 'DELETE' }),
  getInventory: ({ pharmacy_id, category, strain_id } = {}) => {
    const p = new URLSearchParams();
    if (pharmacy_id) p.set("pharmacy_id", pharmacy_id);
    if (category) p.set("category", category);
    if (strain_id) p.set("strain_id", strain_id);
    return apiFetch(`/api/inventory?${p}`);
  },

  // חברתי
  getTwins: (userId) => apiFetch(`/api/social/twins/${userId}`),
  getGeneticTwins: (userId, limit) => apiFetch(`/api/social/genetic-twins/${userId}?limit=${limit || 10}`),
  getRecommendations: (userId, { indication, limit } = {}) => {
    const p = new URLSearchParams();
    if (indication) p.set("indication", indication);
    if (limit) p.set("limit", limit);
    return apiFetch(`/api/recommendations/${userId}?${p}`);
  },

  // תכנון קנייה
  planBasket: ({ track = 'balanced', gramsByCategory = {} } = {}) =>
    apiFetch('/api/basket/plan', { method: 'POST', body: JSON.stringify({ track, gramsByCategory }) }),

  // ביקורת + דיווח מהיר
  submitReview: (payload) =>
    apiFetch(`/api/reviews`, { method: "POST", body: JSON.stringify(payload) }),
  // 5-second report flow (maps rating 1-4 → efficacy 1-5 scale)
  submitReport: ({ user_id, strain_id, rating, effects = [] }) =>
    apiFetch(`/api/reviews`, {
      method: "POST",
      body: JSON.stringify({
        user_id,
        strain_id,
        efficacy: Math.min(5, Math.max(1, Math.round(rating * 1.25))),
        side_effects: effects,
        anxiety_triggered: effects.includes("anxious"),
      }),
    }).catch(() => ({ ok: true, offline: true })), // non-blocking — offline OK

  // יומן טיפול פרטי (C2)
  journal: {
    create: (payload) =>
      apiFetch(`/api/journal/treatment`, { method: "POST", body: JSON.stringify(payload) }),
    addDetails: (id, payload) =>
      apiFetch(`/api/journal/treatment/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    list: ({ limit, offset } = {}) => {
      const p = new URLSearchParams();
      if (limit)  p.set("limit",  String(limit));
      if (offset) p.set("offset", String(offset));
      return apiFetch(`/api/journal/treatment?${p}`);
    },
    // C3 — share/unshare publishes to community (internal only, no external links)
    share:   (id) => apiFetch(`/api/journal/treatment/${id}/share`, { method: "POST" }),
    unshare: (id) => apiFetch(`/api/journal/treatment/${id}/share`, { method: "DELETE" }),
  },

  // פיד קהילה (C4)
  feed: {
    list: ({ limit, offset, categories } = {}) => {
      const p = new URLSearchParams();
      if (limit)              p.set("limit",      String(limit));
      if (offset)             p.set("offset",     String(offset));
      if (categories?.length) p.set("categories", categories.join(","));
      return apiFetch(`/api/feed?${p}`);
    },
    // "עזר לי" toggle — returns { helped: boolean, count: number }
    help: (reviewId) =>
      apiFetch(`/api/feed/${reviewId}/help`, { method: "POST" }),
    listComments: (reviewId) =>
      apiFetch(`/api/feed/${reviewId}/comments`),
    addComment: (reviewId, body, parentId = null) =>
      apiFetch(`/api/feed/${reviewId}/comments`, {
        method: "POST",
        body: JSON.stringify(parentId ? { body, parent_id: parentId } : { body }),
      }),
    deleteComment: (reviewId, cid) =>
      apiFetch(`/api/feed/${reviewId}/comments/${cid}`, { method: "DELETE" }),
  },

  // השפעת הדיווחים שלי (C5) — aggregate + per-report breakdown
  impact: {
    get: () => apiFetch("/api/impact"),
  },

  // תנאי שימוש (C6) — status check + acceptance
  terms: {
    status: () => apiFetch("/api/terms/status"),
    accept: () => apiFetch("/api/terms/accept", { method: "POST" }),
  },

  // RWE — חוכמת קהילה (community_stats aggregate; k-anonymity n≥20)
  getCommunityStats: ({ strainId, indicationId } = {}) => {
    const p = new URLSearchParams();
    if (strainId) p.set("strain_id", strainId);
    if (indicationId) p.set("indication_id", indicationId);
    return apiFetch(`/api/community-stats?${p}`);
  },

};

// בדיקת קישוריות — רץ בטעינה, נזרק החוצה אם ה-backend לא חי (לא דמו, לא שקט)
export async function pingBackend() {
  const r = await fetch("/api/health");
  if (!r.ok) throw new Error(`Backend health check failed: HTTP ${r.status}`);
  return r.json();
}
