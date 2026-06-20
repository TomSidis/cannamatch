// ─────────────────────────────────────────────────────────────────────────────
//  CannaMatch — Static Israeli cannabis pharmacy registry
//
//  IDs ph1–ph3 must stay stable: all strain entries in strainsConfig.js and
//  israeli-pharmacy-catalog.js reference them in their `pharmacies` arrays.
//
//  Fields:
//    id          — stable key matching strain.pharmacies[]
//    name        — display name (Hebrew)
//    city        — city name (Hebrew)
//    region      — one of: "מרכז" | "ירושלים" | "צפון" | "דרום"
//    lat / lng   — WGS-84 coordinates for haversine distance sort
//    open        — placeholder status; real-time data comes from PharmacyViewer
//    priceFactor — relative to market avg (< 0.97 = low, > 1.03 = high)
//    delivery    — offers courier / delivery service
// ─────────────────────────────────────────────────────────────────────────────

export const PHARMACIES = [
  {
    id:          "ph1",
    name:        "פארמרי",
    city:        "אור עקיבא",
    region:      "מרכז",
    lat:         32.5059,
    lng:         34.9252,
    open:        true,
    priceFactor: 0.94,
    delivery:    true,
  },
  {
    id:          "ph2",
    name:        "גיוול",
    city:        "תל אביב",
    region:      "מרכז",
    lat:         32.0853,
    lng:         34.7818,
    open:        true,
    priceFactor: 1.05,
    delivery:    false,
  },
  {
    id:          "ph3",
    name:        "תמיר",
    city:        "ירושלים",
    region:      "ירושלים",
    lat:         31.7683,
    lng:         35.2137,
    open:        false,
    priceFactor: 1.00,
    delivery:    false,
  },
  {
    id:          "ph4",
    name:        "קנה-בוסם",
    city:        "חיפה",
    region:      "צפון",
    lat:         32.7940,
    lng:         34.9896,
    open:        true,
    priceFactor: 0.98,
    delivery:    true,
  },
  {
    id:          "ph5",
    name:        "פארמוס",
    city:        "פתח תקווה",
    region:      "מרכז",
    lat:         32.0878,
    lng:         34.8870,
    open:        true,
    priceFactor: 1.02,
    delivery:    false,
  },
  {
    id:          "ph6",
    name:        "נגב קנאביס",
    city:        "באר שבע",
    region:      "דרום",
    lat:         31.2589,
    lng:         34.7996,
    open:        true,
    priceFactor: 0.96,
    delivery:    true,
  },
  {
    id:          "ph7",
    name:        "גלילי קנאביס",
    city:        "נצרת",
    region:      "צפון",
    lat:         32.6996,
    lng:         35.3035,
    open:        false,
    priceFactor: 0.97,
    delivery:    false,
  },
  {
    id:          "ph8",
    name:        "ריאליף",
    city:        "ראשון לציון",
    region:      "מרכז",
    lat:         31.9642,
    lng:         34.8108,
    open:        true,
    priceFactor: 1.04,
    delivery:    true,
  },
];
