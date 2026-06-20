// ─────────────────────────────────────────────
//  קנאמאצ׳ — אתחול וזריעת מסד הנתונים
//  1. מריץ את api/db/schema.sql
//  2. זורע את הזנים מ-strains_data.json (עם וקטור 12-ממדי)
//  הרצה:  node api/db/initDb.js
// ─────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// סדר ממדים: THC,CBD,CBG,CBN, myrcene,limonene,caryophyllene,linalool,pinene,humulene,terpinolene,ocimene
const TERP_KEYS = ["myrcene","limonene","caryophyllene","linalool","pinene","humulene","terpinolene"];

function parseCat(cat) {
  const m = /T(\d+)\/C(\d+)/.exec(cat || "");
  if (!m) return [0.2, 0.04];
  return [Math.min(1, +m[1] / 30), Math.min(1, +m[2] / 30)];
}

function buildVector(s) {
  const [thc, cbd] = parseCat(s.cat);
  const t = s.terps || {};
  return [thc, cbd, 0.05, 0.05, ...TERP_KEYS.map((k) => +(t[k] || 0)), 0.0];
}

const mapKind = (k) => ({ "אינדיקה":"indica", "סאטיבה":"sativa", "היברידי":"hybrid" }[k] || "hybrid");
const mapConf = (g) => (["verified","grower","unverified","none"].includes(g) ? g : "unverified");
const productType = (s) => (s.name?.includes("שמן") || s.kind === "oil" ? "oil" : "flower");

async function run() {
  const client = await pool.connect();
  try {
    // ── 1. סכמה בסיסית ──
    const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    await client.query(schema);
    console.log("✅ סכמה בסיסית הורצה");

    // ── 1b. Migration V2: מודל 3-ישויות ──
    const migV2 = fs.readFileSync(path.join(__dirname, "migration_v2.sql"), "utf8");
    await client.query(migV2);
    console.log("✅ Migration V2 הורץ (genetic_identity, commercial_product, bio_journal)");

    // ── אם כבר יש זנים, דלג ──
    const { rows: [{ count }] } = await client.query("SELECT count(*) FROM strains");
    if (+count > 0) {
      console.log(`ℹ️  כבר קיימים ${count} זנים — דילוג על זריעה`);
      return;
    }

    // ── 2. בית מרקחת דמו ──
    const { rows: [ph] } = await client.query(
      `INSERT INTO pharmacies (name, city, delivery) VALUES ('בית מרקחת דמו','ירושלים',true) RETURNING id`
    );

    // ── 3. זריעת זנים + אצוות ──
    const strains = JSON.parse(fs.readFileSync(path.join(__dirname, "strains_data.json"), "utf8"));
    let n = 0;
    for (const s of strains) {
      const vec = `[${buildVector(s).join(",")}]`;
      const cat = s.cat || "T20/C4";
      const price = s.price ? +s.price : null;
      try {
        const { rows: [row] } = await client.query(
          `INSERT INTO strains (name, name_en, genetics, lineage, kind, category,
             terpene_dist, embedding, target_indications, genetic_confidence)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [s.name, s.en || null, s.genetics || null, s.lineage || null,
           mapKind(s.kind), cat, JSON.stringify(s.terps || {}), vec,
           s.effects || [], mapConf(s.gConf)]
        );
        await client.query(
          `INSERT INTO batches (strain_id, pharmacy_id, batch_lot, embedding, category, product_type, price, in_stock, confidence_score)
           VALUES ($1,$2,$3,$4,$5,$6,$7,true,0.5)`,
          [row.id, ph.id, `SEED-${s.id}`, vec, cat, productType(s), price]
        );
        n++;
      } catch (e) {
        console.warn(`⚠️ דילוג על ${s.name}: ${e.message}`);
      }
    }
    console.log(`🌿 נזרעו ${n} זנים + אצוות`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => { console.error("שגיאת אתחול:", e); process.exit(1); });
