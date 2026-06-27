/**
 * vectorPrefilter.js — §6 pgvector ANN prefilter
 *
 * Converts a UserNeed.effect (EffectVector) into a pgvector literal,
 * then queries batches by cosine distance ORDER BY batch_effect_vec <=> $needVec.
 * Returns the top-200 batch IDs for exact §4 blend in app code.
 *
 * Falls back to a full table scan when pgvector column is not yet populated
 * (e.g. right after migration, before the backfill job runs).
 */

/** @param {import('./types.js').EffectVector} effectVec */
const AXIS_ORDER = ['bodyCalm','clearHead','sleep','antiPain','mood','antiAnxiety','appetite'];

/**
 * @param {import('pg').Pool} pool
 * @param {Record<string,number>} effectVec  - UserNeed.effect
 * @param {number} [limit=200]
 * @returns {Promise<string[]>} batchIds sorted by ANN cosine distance
 */
export async function prefilterBatches(pool, effectVec, limit = 200) {
  const vec = AXIS_ORDER.map(k => effectVec[k] ?? 0);
  const pgVec = `[${vec.join(',')}]`;

  try {
    const { rows } = await pool.query(
      `SELECT id
       FROM batches
       WHERE batch_effect_vec IS NOT NULL
       ORDER BY batch_effect_vec <=> $1::vector
       LIMIT $2`,
      [pgVec, limit],
    );

    if (rows.length === 0) {
      // Column not yet populated — fall back to returning all batch ids
      return await fallbackAllIds(pool, limit);
    }

    return rows.map(r => r.id);
  } catch (err) {
    // pgvector extension not installed or column missing — degrade gracefully (§1.4)
    console.warn('[vectorPrefilter] pgvector not available, using full scan:', err.message);
    return await fallbackAllIds(pool, limit);
  }
}

async function fallbackAllIds(pool, limit) {
  const { rows } = await pool.query(
    `SELECT id FROM batches WHERE in_stock = TRUE LIMIT $1`, [limit],
  );
  return rows.map(r => r.id);
}

/**
 * Backfill: compute and store batch_effect_vec for all batches missing it.
 * Called by the nightly sync job.
 *
 * @param {import('pg').Pool} pool
 * @param {function(batch: object): Record<string,number>} buildVecFn
 */
export async function backfillEffectVectors(pool, buildVecFn) {
  const { rows } = await pool.query(
    `SELECT b.id, b.terpene_dist, b.category, b.product_type, b.thc_pct, b.cbd_pct
     FROM batches b
     WHERE b.batch_effect_vec IS NULL`,
  );
  console.log(`[backfill] ${rows.length} batches need effect vectors`);

  let done = 0;
  for (const row of rows) {
    try {
      const vec = buildVecFn(row);
      const pgVec = `[${AXIS_ORDER.map(k => vec[k] ?? 0).join(',')}]`;
      await pool.query(
        `UPDATE batches SET batch_effect_vec = $1::vector WHERE id = $2`,
        [pgVec, row.id],
      );
      done++;
    } catch (e) {
      console.warn(`[backfill] failed for batch ${row.id}:`, e.message);
    }
  }
  console.log(`[backfill] done: ${done}/${rows.length}`);
}
