import { Router } from "express";
import { pool }    from "../db.js";

const router = Router();

// ── GET /api/genetic-equivalents/:geneticId ───────────────────
// All commercial products sharing the same genetic_id, ordered by price.
router.get("/genetic-equivalents/:geneticId", async (req, res) => {
  const { geneticId } = req.params;
  if (!geneticId) return res.status(400).json({ error: { message: "חסר geneticId." } });

  try {
    const { rows } = await pool.query(
      `SELECT * FROM genetic_equivalents WHERE genetic_id = $1`,
      [geneticId],
    );
    res.json({ count: rows.length, products: rows });
  } catch (err) {
    console.error("genetic-equivalents error:", err);
    res.status(500).json({ error: { message: "שגיאת שרת בשליפת שקילות גנטית" } });
  }
});

// ── GET /api/price-arbitrage/:strainId ────────────────────────
// Find cheaper genetic equivalents + price gap across pharmacies.
router.get("/price-arbitrage/:strainId", async (req, res) => {
  const { strainId } = req.params;
  try {
    // Resolve genetic_id via commercial_product mapping
    const { rows: [strainRow] } = await pool.query(
      `SELECT s.id, s.name, s.genetic_id,
              cp.product_id, cp.genetic_id AS cp_genetic_id
       FROM strains s
       LEFT JOIN commercial_product cp ON cp.commercial_name_norm = lower(s.name)
       WHERE s.id = $1
       LIMIT 1`,
      [strainId],
    );

    if (!strainRow) {
      return res.status(404).json({ error: { message: "זן לא נמצא" } });
    }

    const geneticId = strainRow.genetic_id || strainRow.cp_genetic_id;

    // Batch pricing query (shared by both paths)
    const { rows: batches } = await pool.query(
      `SELECT b.id AS batch_id, b.price, b.in_stock, b.data_confidence,
              b.terpene_source, b.batch_number, b.batch_year, b.expiry,
              ph.id AS pharmacy_id, ph.name AS pharmacy_name, ph.city,
              ph.website_url, ph.maps_url
       FROM batches b
       LEFT JOIN pharmacies ph ON ph.id = b.pharmacy_id
       WHERE b.strain_id = $1 AND b.in_stock = TRUE
       ORDER BY b.price ASC NULLS LAST`,
      [strainId],
    );

    if (!geneticId) {
      return res.json({
        genetic_id:   null,
        genetic_name: strainRow.name,
        equivalents:  [],
        price_range:  batches,
        cheapest:     batches[0] || null,
        savings:      0,
      });
    }

    const { rows: equiv } = await pool.query(
      `SELECT * FROM genetic_equivalents WHERE genetic_id = $1`,
      [geneticId],
    );

    const currentPrice  = batches[0]?.price;
    const cheapestEquiv = equiv.filter((e) => e.price != null).sort((a, b) => a.price - b.price)[0];
    const savings = (currentPrice && cheapestEquiv?.price)
      ? Math.round(currentPrice - cheapestEquiv.price)
      : 0;

    res.json({
      genetic_id:   geneticId,
      genetic_name: equiv[0]?.genetic_name || strainRow.name,
      equivalents:  equiv,
      price_range:  batches,
      cheapest:     cheapestEquiv || batches[0] || null,
      savings:      savings > 0 ? savings : 0,
    });
  } catch (err) {
    console.error("price-arbitrage error:", err);
    res.status(500).json({ error: { message: "שגיאת שרת בחישוב ארביטראז' מחיר" } });
  }
});

export default router;
