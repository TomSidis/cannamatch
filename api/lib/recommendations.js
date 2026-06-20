// ─────────────────────────────────────────────────────────────
//  קנאמאצ׳ — מנוע ה-Collaborative Filtering ("תאומים גנטיים")
//  Tier 1: התוויה קלינית זהה + פרופיל DNA קרוב (twinScore גבוה)
//  Tier 2: חפיפה כימית (טרפנים+גנטיקה) גבוהה, חוצה התוויות
// ─────────────────────────────────────────────────────────────
import { pool } from "../db.js";
import { cosine, TERP_IDX } from "./scoring.js";
import { twinScore } from "./vectorMath.js";

const TIER1_TWIN_THRESHOLD = 0.55;   // twinScore מינימלי כדי להיחשב "תאום גנטי"
const TIER2_CHEM_THRESHOLD = 0.85;   // cosine מינימלי בין וקטור הזן לוקטור-המטרה של המשתמש
const MIN_EFFICACY = 4;              // user_reviews.efficacy >= זה נחשב "דיווח חיובי"

function toMatchPercent(x) {
  return Math.round(Math.max(0, Math.min(1, x)) * 100);
}

/**
 * getGeneticTwins — מוצא משתמשים אחרים עם פרופיל DNA קרוב, ממוין מהקרוב ביותר.
 * @param {string} userId
 * @param {number} limit
 */
async function getGeneticTwins(userId, limit = 10) {
  const { rows: [me] } = await pool.query(
    `SELECT profile FROM user_dna_profiles WHERE user_id = $1`, [userId]
  );
  if (!me) return [];

  const { rows: others } = await pool.query(
    `SELECT u.id, u.pseudonym, p.profile
     FROM user_dna_profiles p
     JOIN users u ON u.id = p.user_id
     WHERE p.user_id != $1`,
    [userId]
  );

  return others
    .map((o) => ({
      userId: o.id,
      pseudonym: o.pseudonym,
      score: twinScore(me.profile, o.profile),
      sharedIndications: (me.profile.indications || []).filter((i) =>
        (o.profile.indications || []).includes(i)
      ),
    }))
    .filter((o) => o.score >= TIER1_TWIN_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * getCollaborativeRecommendations — Tier-1 (התוויה+DNA זהים) ואז Tier-2 (חפיפה כימית, חוצה-התוויות).
 * מחזיר רשימת זנים מדורגת עם metadata להצגת trust badges בפרונט.
 *
 * @param {string} userId
 * @param {string} [primaryIndication] - אם לא הועבר, נלקח profile.indications[0]
 * @param {number} [limit]
 */
async function getCollaborativeRecommendations(userId, primaryIndication, limit = 10) {
  const { rows: [meRow] } = await pool.query(
    `SELECT profile FROM user_dna_profiles WHERE user_id = $1`, [userId]
  );
  const myProfile = meRow?.profile || { target_vector: new Array(12).fill(0), indications: [] };
  const myIndication = primaryIndication || (myProfile.indications || [])[0] || null;
  const myVector = myProfile.target_vector || new Array(12).fill(0);

  const recommended = new Map(); // strain_id -> rec object
  const usedStrainIds = new Set();

  // ── Tier 1: תאומים גנטיים עם אותה התוויה ראשית ──────────────────────
  const twins = await getGeneticTwins(userId, 50);
  const tier1Twins = myIndication
    ? twins.filter((t) => t.sharedIndications.includes(myIndication))
    : twins;

  if (tier1Twins.length) {
    const twinIds = tier1Twins.map((t) => t.userId);
    const { rows: reviews } = await pool.query(
      `SELECT r.strain_id, r.user_id, r.efficacy, s.name, s.genetics, s.lineage,
              s.terpene_dist, s.target_indications
       FROM user_reviews r
       JOIN strains s ON s.id = r.strain_id
       WHERE r.user_id = ANY($1) AND r.efficacy >= $2`,
      [twinIds, MIN_EFFICACY]
    );

    const byStrain = new Map();
    for (const rv of reviews) {
      if (!byStrain.has(rv.strain_id)) {
        byStrain.set(rv.strain_id, { ...rv, supporters: new Set(), efficacySum: 0, n: 0 });
      }
      const agg = byStrain.get(rv.strain_id);
      agg.supporters.add(rv.user_id);
      agg.efficacySum += rv.efficacy;
      agg.n += 1;
    }

    for (const [strainId, agg] of byStrain) {
      const twinAvgScore =
        tier1Twins
          .filter((t) => agg.supporters.has(t.userId))
          .reduce((s, t) => s + t.score, 0) / agg.supporters.size;
      const matchPct = toMatchPercent(0.6 * twinAvgScore + 0.4 * (agg.efficacySum / agg.n / 5));

      recommended.set(strainId, {
        strain_id: strainId,
        name: agg.name,
        genetics: agg.genetics,
        lineage: agg.lineage,
        tier: 1,
        match_pct: matchPct,
        support_count: agg.supporters.size,
        indication: myIndication,
        badge: myIndication
          ? `${matchPct}% התאמה: מומלץ על ידי ${agg.supporters.size} מטופלים עם ${myIndication} שחולקים את פרופיל הטרפנים שלך`
          : `${matchPct}% התאמה: מומלץ על ידי ${agg.supporters.size} מטופלים עם פרופיל DNA קרוב לשלך`,
      });
      usedStrainIds.add(strainId);
    }
  }

  // ── Tier 2: חפיפה כימית גבוהה, חוצה-התוויות ─────────────────────────
  if (recommended.size < limit) {
    const { rows: positiveStrains } = await pool.query(
      `SELECT DISTINCT s.id, s.name, s.genetics, s.lineage, s.embedding, s.target_indications,
              AVG(r.efficacy) AS avg_efficacy, COUNT(DISTINCT r.user_id) AS supporters
       FROM user_reviews r
       JOIN strains s ON s.id = r.strain_id
       WHERE r.efficacy >= $1
       GROUP BY s.id, s.name, s.genetics, s.lineage, s.embedding, s.target_indications`,
      [MIN_EFFICACY]
    );

    const tier2 = positiveStrains
      .filter((s) => !usedStrainIds.has(s.id) && s.embedding)
      .map((s) => ({ ...s, chemSim: cosine(s.embedding, myVector) }))
      .filter((s) => s.chemSim >= TIER2_CHEM_THRESHOLD)
      .sort((a, b) => b.chemSim - a.chemSim);

    for (const s of tier2) {
      if (recommended.size >= limit) break;
      const matchPct = toMatchPercent(s.chemSim);
      const crossIndication = (s.target_indications || [])[0] || "מטופלים אחרים";
      recommended.set(s.id, {
        strain_id: s.id,
        name: s.name,
        genetics: s.genetics,
        lineage: s.lineage,
        tier: 2,
        match_pct: matchPct,
        support_count: Number(s.supporters),
        indication: crossIndication,
        badge: `${matchPct}% התאמה: יעיל מאוד ל${crossIndication} עם חפיפה כימית של ${matchPct}% לזנים שאהבת`,
      });
    }
  }

  return Array.from(recommended.values())
    .sort((a, b) => (a.tier - b.tier) || (b.match_pct - a.match_pct))
    .slice(0, limit);
}

export { getGeneticTwins, getCollaborativeRecommendations, TIER1_TWIN_THRESHOLD, TIER2_CHEM_THRESHOLD };
