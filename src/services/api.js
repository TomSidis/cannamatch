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
  // אימות
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
  getStrains: ({ type, q } = {}) => {
    const p = new URLSearchParams();
    if (type) p.set("type", type);
    if (q) p.set("q", q);
    return apiFetch(`/api/strains?${p}`);
  },
  parseMenu: ({ image_base64, media_type, text, url, user_id }) =>
    apiFetch(`/api/parse-menu`, { method: "POST",
      body: JSON.stringify({ image_base64, media_type, text, url, user_id }) }),
  fetchMenuUrl: (url) => apiFetch(`/api/fetch-menu`, { method: "POST", body: JSON.stringify({ url }) }),

  // בתי מרקחת + מלאי
  getPharmacies: () => apiFetch(`/api/pharmacies`),
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

  // ביקורת
  submitReview: (payload) =>
    apiFetch(`/api/reviews`, { method: "POST", body: JSON.stringify(payload) }),

  // RWE — חוכמת קהילה (community_stats aggregate; k-anonymity n≥20)
  getCommunityStats: ({ strainId, indicationId } = {}) => {
    const p = new URLSearchParams();
    if (strainId) p.set("strain_id", strainId);
    if (indicationId) p.set("indication_id", indicationId);
    return apiFetch(`/api/community-stats?${p}`);
  },

  // צמח — עוזר AI
  zemachChat: (message, history) =>
    apiFetch(`/api/zemach-chat`, { method: "POST", body: JSON.stringify({ message, history }) }),
};

// בדיקת קישוריות — רץ בטעינה, נזרק החוצה אם ה-backend לא חי (לא דמו, לא שקט)
export async function pingBackend() {
  const r = await fetch("/api/health");
  if (!r.ok) throw new Error(`Backend health check failed: HTTP ${r.status}`);
  return r.json();
}
