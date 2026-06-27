/**
 * googlePlaces.js — Google Places API hours enrichment (optional).
 *
 * Requires GOOGLE_PLACES_KEY in .env. Without it every call returns null
 * and pharmacies display "שעות לא זמינות" — graceful degradation.
 *
 * To enable:
 *   1. Get a key at https://console.cloud.google.com → APIs & Services → Credentials
 *   2. Enable "Places API" (legacy v1 is fine) on the project
 *   3. Add to .env:  GOOGLE_PLACES_KEY=AIzaSy...
 *
 * Rate-limit: the caller (pharmacySync.js) should limit to ~10 lookups per sync
 * to stay within the free tier (200 USD/month credit → ~5000 detail calls/month).
 */

const FIND_URL   = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json';
const DETAIL_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

// weekday_text is Sun-indexed in Hebrew/English; returns HH:MM-HH:MM or null
function extractHours(weekdayText, dayIndex) {
  const line = weekdayText?.[dayIndex];
  if (!line) return null;
  const m = line.match(/(\d{1,2}:\d{2})\s*[–\-]\s*(\d{1,2}:\d{2})/);
  if (!m) return null;
  const pad = t => t.length === 4 ? '0' + t : t; // "9:00" → "09:00"
  return `${pad(m[1])}-${pad(m[2])}`;
}

/**
 * fetchPlaceHours — look up a pharmacy's opening hours via Google Places.
 *
 * @param {string} name    — pharmacy display name (Hebrew OK)
 * @param {string} city    — city name (improves accuracy)
 * @param {string} apiKey  — Google Places API key
 * @returns {Promise<{hours_weekdays:string|null, hours_friday:string|null, hours_saturday:string|null} | null>}
 *          null on any error or missing key
 */
export async function fetchPlaceHours(name, city, apiKey) {
  if (!apiKey) return null;
  try {
    // Step 1: Find place ID
    const findParams = new URLSearchParams({
      input:         `${name} ${city} ישראל`,
      inputtype:     'textquery',
      fields:        'place_id',
      language:      'he',
      key:           apiKey,
    });
    const findRes = await fetch(`${FIND_URL}?${findParams}`);
    if (!findRes.ok) return null;
    const findData = await findRes.json();
    const placeId = findData?.candidates?.[0]?.place_id;
    if (!placeId) return null;

    // Step 2: Get opening hours
    const detailParams = new URLSearchParams({
      place_id: placeId,
      fields:   'opening_hours',
      language: 'he',
      key:      apiKey,
    });
    const detailRes = await fetch(`${DETAIL_URL}?${detailParams}`);
    if (!detailRes.ok) return null;
    const detailData = await detailRes.json();
    const wt = detailData?.result?.opening_hours?.weekday_text;
    if (!wt || wt.length < 7) return null;

    // Google weekday_text: index 0=Monday … 6=Sunday — convert to Israeli week
    // Israeli: Sun(0), Mon(1), Tue(2), Wed(3), Thu(4), Fri(5), Sat(6) in JS getDay()
    // Google:  Mon(0), Tue(1), Wed(2), Thu(3), Fri(4), Sat(5), Sun(6)
    const googleFri = 4, googleSat = 5;
    const googleMon = 0; // representative weekday

    return {
      hours_weekdays:  extractHours(wt, googleMon),
      hours_friday:    extractHours(wt, googleFri),
      hours_saturday:  extractHours(wt, googleSat),
    };
  } catch {
    return null;
  }
}
