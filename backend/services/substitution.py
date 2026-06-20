"""
קנאמאצ׳ — שירות "ההחלפה החכמה"
─────────────────────────────────────────────────────────
שני שלבים, בסדר קריטי:
  1. שער רגולציה קשיח (Hard Gate) — סינון לפי קטגוריית הרישיון. קודם!
  2. דמיון כימי (Cosine) דרך pgvector — דירוג רק על המסוננים החוקיים.
─────────────────────────────────────────────────────────
"""
from __future__ import annotations

from uuid import UUID

from db.database import get_conn
from models.schemas import BatchMatch, SubstitutionResponse

# שקלול הציון הסופי: 70% דמיון כימי, 30% ביטחון קהילתי
SIMILARITY_WEIGHT = 0.70
CONFIDENCE_WEIGHT = 0.30


async def get_user_licenses(conn, user_id: UUID) -> list[str]:
    """שולף את קטגוריות הרישיון של המשתמש לשער הרגולציה."""
    row = await conn.fetchrow(
        "SELECT license_categories FROM users WHERE id = $1", user_id
    )
    if row is None:
        return []
    return list(row["license_categories"] or [])


async def smart_substitution(
    user_id: UUID,
    target_vector: list[float],
    product_type: str,
    limit: int = 3,
) -> SubstitutionResponse:
    """
    מחזיר את 3 התחליפים הקרובים ביותר שזמינים *עכשיו* ועומדים ברישיון.
    """
    async with get_conn() as conn:
        # ── שלב 0: רישיון המשתמש ──
        licenses = await get_user_licenses(conn, user_id)
        if not licenses:
            return SubstitutionResponse(
                status="no_legal_match",
                message="לא נמצאו קטגוריות רישיון למשתמש. עדכנו את הפרופיל.",
            )

        # ── שלב 1 + 2: שער רגולציה קשיח ואז דמיון Cosine, בשאילתה אחת ──
        # השער (WHERE) רץ לפני חישוב הדמיון (ORDER BY <=>),
        # כך שלעולם לא נדרג מוצר מחוץ לרישיון.
        # אופרטור <=> הוא מרחק קוסינוס; similarity = 1 - distance.
        query = """
            SELECT
                b.id                AS batch_id,
                s.name              AS strain_name,
                s.genetics          AS genetics,
                b.category          AS category,
                b.product_type      AS product_type,
                b.price             AS price,
                p.name              AS pharmacy_name,
                b.confidence_score  AS confidence_score,
                1 - (b.embedding <=> $1::vector) AS similarity
            FROM batches b
            JOIN strains s ON s.id = b.strain_id
            LEFT JOIN pharmacies p ON p.id = b.pharmacy_id
            WHERE b.in_stock = TRUE                 -- במלאי עכשיו
              AND b.category = ANY($2::text[])      -- שער רגולציה קשיח!
              AND b.product_type = $3               -- תצורה תואמת
            ORDER BY b.embedding <=> $1::vector     -- הקרוב ביותר ראשון
            LIMIT $4
        """
        rows = await conn.fetch(query, target_vector, licenses, product_type, limit)

    if not rows:
        return SubstitutionResponse(
            status="no_legal_match",
            message=(
                "אין כרגע מוצר זמין בקטגוריית הרישיון שלך "
                f"({', '.join(licenses)}) בתצורה המבוקשת. "
                "נבדוק שוב כשייכנס מלאי חדש."
            ),
        )

    matches: list[BatchMatch] = []
    for r in rows:
        sim = max(0.0, min(1.0, float(r["similarity"])))   # קיבוע 0-1
        conf = float(r["confidence_score"])
        final = SIMILARITY_WEIGHT * sim + CONFIDENCE_WEIGHT * conf
        sim_pct = round(sim * 100, 1)

        # הסבר שקוף בעברית — למה זה תחליף טוב
        parts = [f"{sim_pct}% דמיון כימי לפרופיל המטרה שלך"]
        if conf >= 0.7:
            parts.append("דירוג קהילתי גבוה")
        elif conf <= 0.4:
            parts.append("עדיין מעט דיווחים — נסו בזהירות")
        if r["pharmacy_name"]:
            parts.append(f"במלאי ב{r['pharmacy_name']}")
        explanation = " · ".join(parts)

        matches.append(BatchMatch(
            batch_id=r["batch_id"],
            strain_name=r["strain_name"],
            genetics=r["genetics"],
            category=r["category"],
            product_type=r["product_type"],
            price=float(r["price"]) if r["price"] is not None else None,
            pharmacy_name=r["pharmacy_name"],
            similarity_index=sim_pct,
            confidence_score=round(conf, 4),
            final_score=round(final, 4),
            explanation=explanation,
        ))

    # מיון סופי לפי הציון המשולב (דמיון + ביטחון)
    matches.sort(key=lambda m: m.final_score, reverse=True)

    return SubstitutionResponse(status="ok", matches=matches)
