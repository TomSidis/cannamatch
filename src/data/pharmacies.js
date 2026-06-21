// ─────────────────────────────────────────────────────────────────────────────
//  CannaMatch — Static Israeli cannabis pharmacy registry
//
//  IDs ph1–ph3 must stay stable: all strain entries in strainsConfig.js and
//  israeli-pharmacy-catalog.js reference them in their `pharmacies` arrays.
//
//  Fields:
//    data_source — provenance tag: "scraped" | "public"
//                  ph1/ph2 = scraped (menu sources for the strain catalog)
//                  ph3–ph8 = public (real pharmacies licensed by MoH, coordinates from maps)
//    id          — stable key matching strain.pharmacies[]
//    name        — display name (Hebrew)
//    city        — city name (Hebrew)
//    region      — one of: "מרכז" | "ירושלים" | "צפון" | "דרום"
//    lat / lng   — WGS-84 coordinates for haversine distance sort
//    open        — PLACEHOLDER (not shown to users); real open/close from PharmacyViewer
//    priceFactor — PLACEHOLDER estimate (not shown to users); real prices from scraped menu
//    delivery    — offers courier / delivery service
// ─────────────────────────────────────────────────────────────────────────────

export const PHARMACIES = [
  {
    id:          "ph1",
    data_source: "scraped",
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
    data_source: "scraped",
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
    data_source: "public",
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
    data_source: "public",
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
    data_source: "public",
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
    data_source: "public",
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
    data_source: "public",
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
    data_source: "public",
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
