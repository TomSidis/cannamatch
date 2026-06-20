import { Router }  from "express";
import { pool }     from "../db.js";
import { DEFAULT_DNA } from "../constants.js";
import { updateUserDNAProfile } from "../lib/scoring.js";
import { twinScore }             from "../lib/vectorMath.js";
import { getGeneticTwins, getCollaborativeRecommendations } from "../lib/recommendations.js";

const router = Router();

// ── GET /api/social/twins/:id — DNA-similarity feed ──────────
router.get("/social/twins/:id", async (req, res) => {
  try {
    const { rows: [me] } = await pool.query(
      `SELECT profile FROM user_dna_profiles WHERE user_id=$1`, [req.params.id],
    );
    if (!me) return res.json([]);

    const { rows: others } = await pool.query(
      `SELECT u.id, u.pseudonym, p.profile FROM user_dna_profiles p
       JOIN users u ON u.id = p.user_id WHERE p.user_id != $1`,
      [req.params.id],
    );

    const ranked = others
      .map((o) => ({ ...o, score: twinScore(me.profile, o.profile) }))
      .filter((o) => o.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (!ranked.length) return res.json([]);

    const { rows: reviews } = await pool.query(
      `SELECT DISTINCT ON (r.user_id, r.strain_id)
              r.user_id, r.efficacy,
              s.name, s.genetics, s.lineage, s.terpene_dist, s.target_indications
       FROM user_reviews r
       JOIN strains s ON s.id = r.strain_id
       WHERE r.user_id = ANY($1) AND r.efficacy >= 4
       ORDER BY r.user_id, r.strain_id, r.efficacy DESC`,
      [ranked.map((t) => t.id)],
    );

    const getTopTerpene = (d) => {
      const e = Object.entries(d || {}).sort((a, b) => b[1] - a[1])[0];
      return e ? e[0] : "";
    };

    const feed = reviews
      .map((rv) => {
        const twin = ranked.find((t) => t.id === rv.user_id);
        return {
          similarity:  Math.round((twin?.score || 0) * 100),
          city:        "ישראל",
          indication:  (rv.target_indications || [])[0] || "כללי",
          strain:      rv.name,
          genetics:    rv.genetics,
          lineage:     rv.lineage,
          topTerpene:  getTopTerpene(rv.terpene_dist),
          rating:      rv.efficacy,
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 8);

    res.json(feed);
  } catch (err) {
    console.error("twins error:", err);
    res.status(500).json({ error: { message: "שגיאת שרת בשליפת תאומים גנטיים" } });
  }
});

// ── GET /api/social/genetic-twins/:userId ─────────────────────
router.get("/social/genetic-twins/:userId", async (req, res) => {
  try {
    const twins = await getGeneticTwins(req.params.userId, Number(req.query.limit) || 10);
    res.json({ count: twins.length, twins });
  } catch (err) {
    console.error("genetic-twins error:", err);
    res.status(500).json({ error: { message: "שגיאת שרת בחיפוש תאומים גנטיים" } });
  }
});

// ── GET /api/recommendations/:userId ─────────────────────────
router.get("/recommendations/:userId", async (req, res) => {
  try {
    const { indication, limit = 10 } = req.query;
    const recs = await getCollaborativeRecommendations(req.params.userId, indication, Number(limit));
    res.json({ count: recs.length, recommendations: recs });
  } catch (err) {
    console.error("recommendations error:", err);
    res.status(500).json({ error: { message: "שגיאת שרת בחישוב המלצות" } });
  }
});

// ── POST /api/reviews ─────────────────────────────────────────
router.post("/reviews", async (req, res) => {
  const {
    user_id, strain_id, efficacy,
    anxietyTriggered, painRelief, sleepQuality,
    sideEffects = [], indication,
  } = req.body;

  if (!user_id || !strain_id || efficacy == null) {
    return res.status(400).json({ error: { message: "חסרים שדות חובה: user_id, strain_id, efficacy." } });
  }
  if (typeof efficacy !== "number" || efficacy < 1 || efficacy > 10) {
    return res.status(400).json({ error: { message: "efficacy חייב להיות מספר בין 1–10." } });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const rev = await client.query(
      `INSERT INTO user_reviews (user_id, strain_id, efficacy, anxiety_triggered, pain_relief, sleep_quality, side_effects)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [user_id, strain_id, efficacy, anxietyTriggered, painRelief, sleepQuality, sideEffects],
    );

    const { rows: [profRow] } = await client.query(
      `SELECT profile FROM user_dna_profiles WHERE user_id=$1 FOR UPDATE`, [user_id],
    );
    const { rows: [strain] } = await client.query(
      `SELECT s.lineage, b.embedding FROM strains s
       LEFT JOIN LATERAL (SELECT embedding FROM batches WHERE strain_id=s.id LIMIT 1) b ON TRUE
       WHERE s.id=$1`,
      [strain_id],
    );

    const updated = updateUserDNAProfile(
      profRow?.profile || DEFAULT_DNA,
      strain || { lineage: "", embedding: new Array(12).fill(0) },
      { efficacy, anxietyTriggered, painRelief, sleepQuality, indication },
    );

    await client.query(
      `INSERT INTO user_dna_profiles (user_id, profile) VALUES ($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET profile=$2, updated_at=now()`,
      [user_id, updated],
    );
    await client.query("COMMIT");

    res.json({ status: "ok", review_id: rev.rows[0].id, profile: updated });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("review error:", err);
    res.status(500).json({ error: { message: "שגיאה בשמירת הביקורת" } });
  } finally {
    client.release();
  }
});

export default router;
