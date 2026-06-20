// ──────────────────────────────────────────────────────────────
//  CannaMatch — one-time DB seed from strainsConfig.js
//  Run: node api/db/seedStrains.js
//
//  Safe to re-run: truncates strains + batches first.
//  Requires STRAINS to be fully exported from strainsConfig.js
//  (BASE_STRAINS + PHARMARY_STRAINS + PHARMARY_STRAINS_2 merged).
// ──────────────────────────────────────────────────────────────

import { pool } from "../db.js";
import { STRAINS } from "../../src/data/strainsConfig.js";

const TERP_KEYS = [
  "myrcene","limonene","caryophyllene","linalool",
  "pinene","humulene","terpinolene","ocimene",
];

function parseCat(cat) {
  const m = /T(\d+)\/C(\d+)/.exec(cat || "");
  if (!m) return [0.2, 0.04];
  return [Math.min(1, +m[1] / 30), Math.min(1, +m[2] / 30)];
}

// Build the 12-dim embedding vector:
// [thc, cbd, cbg, cbn, myrcene, limonene, caryophyllene, linalool, pinene, humulene, terpinolene, ocimene]
function buildVector(s) {
  const [thc, cbd] = parseCat(s.cat);
  const t = s.terps || {};
  return [thc, cbd, 0.05, 0.05, ...TERP_KEYS.map((k) => +(t[k] || 0))];
}

const KIND_MAP = { "אינדיקה": "indica", "סאטיבה": "sativa", "היברידי": "hybrid" };
const CONF_SET = new Set(["verified","grower","unverified","none"]);

const mapKind = (k) => KIND_MAP[k] || "hybrid";
const mapConf = (g) => (CONF_SET.has(g) ? g : "unverified");
const confScore = (g) => ({ verified: 0.9, grower: 0.7, unverified: 0.4, none: 0.3 }[g] ?? 0.4);

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Truncate in FK order
    await client.query("TRUNCATE TABLE user_reviews, batches, strains RESTART IDENTITY CASCADE");
    console.log("🗑  Truncated strains, batches, user_reviews");

    // Upsert a single demo pharmacy (keeps FK valid across re-seeds)
    const { rows: [ph] } = await client.query(`
      INSERT INTO pharmacies (name, city, delivery)
      VALUES ('Pharmary (Or Akiva)', 'Or Akiva', true)
      ON CONFLICT (name) DO UPDATE SET city = EXCLUDED.city
      RETURNING id`);
    const pharmacyId = ph?.id || null;

    // Bulk insert — one transaction, one statement per strain + batch
    let ok = 0;
    let skip = 0;
    for (const s of STRAINS) {
      if (!s.id || !s.name) { skip++; continue; }

      const vec = buildVector(s);
      const vecStr = `[${vec.join(",")}]`;
      const conf = mapConf(s.gConf || s.genetic_confidence || "unverified");

      // aka = array of alternate commercial names
      const aka = [
        s.en,
        s.genetics !== s.name ? s.genetics : null,
      ].filter(Boolean);

      const { rows: [{ id: strainId }] } = await client.query(`
        INSERT INTO strains
          (name, name_en, aka, genetics, lineage, kind,
           terpene_dist, embedding, target_indications, genetic_confidence)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::vector,$9,$10)
        RETURNING id`,
        [
          s.name,
          s.en || null,
          aka,
          s.genetics || s.name,
          s.lineage || null,
          mapKind(s.kind),
          JSON.stringify(s.terps || {}),
          vecStr,
          s.effects || [],
          conf,
        ]
      );

      // One batch row per strain (current stock snapshot)
      await client.query(`
        INSERT INTO batches
          (strain_id, pharmacy_id, batch_lot, embedding,
           category, product_type, price, in_stock, confidence_score)
        VALUES ($1,$2,$3,$4::vector,$5,$6,$7,$8,$9)`,
        [
          strainId,
          pharmacyId,
          s.batch || null,
          vecStr,
          s.cat || "T22/C4",
          s.type || "flower",
          s.price || 0,
          true,
          confScore(conf),
        ]
      );

      ok++;
    }

    await client.query("COMMIT");
    console.log(`✅ Seeded ${ok} strains (${skip} skipped due to missing id/name)`);
    console.log(`   Pharmacy: ${pharmacyId}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
