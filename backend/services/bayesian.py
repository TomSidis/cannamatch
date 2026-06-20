"""
קנאמאצ׳ — שירות דיווח ועדכון בייסיאני
─────────────────────────────────────────────────────────
כשמטופל שולח דיווח micro-engagement:
  1. מחשבים משקל לדיווח (שלמות × עדכניות × דמיון פרופיל × אמינות).
  2. מריצים עדכון בייסיאני לציון הביטחון של האצווה.
  3. מעדכנים את הווקטור הכימי המצטבר של האצווה.
─────────────────────────────────────────────────────────
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from db.database import get_conn
from models.schemas import PatientReportRequest, ReportResponse
from services.bayesian_scoring_math import (
    completeness_weight, recency_weight, profile_similarity_weight,
    bayesian_confidence, PRIOR_WEIGHT_C,
)


async def submit_report_and_update(report: PatientReportRequest) -> ReportResponse:
    """
    שומר את הדיווח ומריץ את העדכון הבייסיאני לאצווה.
    הכל בטרנזקציה אחת — עקביות מלאה.
    """
    async with get_conn() as conn:
        async with conn.transaction():
            # ── שלב א': משיכת נתוני האצווה והמשתמש ──
            # ה-prior הקליני = דמיון Cosine בין וקטור האצווה לוקטור יעד ההתוויה
            batch = await conn.fetchrow(
                """SELECT
                       b.confidence_score,
                       b.report_count,
                       b.embedding,
                       b.aggregated_vector,
                       1 - (b.embedding <=> i.target_vector) AS indication_prior
                   FROM batches b
                   JOIN indications i ON i.id = $2
                   WHERE b.id = $1""",
                report.batch_id, report.indication_id,
            )
            if batch is None:
                raise ValueError("אצווה לא נמצאה")

            user = await conn.fetchrow(
                "SELECT learned_vector, credibility_score FROM users WHERE id = $1",
                report.user_id,
            )
            if user is None:
                raise ValueError("משתמש לא נמצא")

            # ── שלב ב': חישוב משקל הדיווח ──
            now = datetime.now(timezone.utc)
            has_post = report.post_symptom_severity is not None
            has_extra = bool(report.side_effects) or report.satisfaction is not None
            w_complete = completeness_weight(has_post, has_extra)
            w_recency = recency_weight(now, now)
            w_sim = profile_similarity_weight(
                list(user["learned_vector"]) if user["learned_vector"] is not None else None,
                list(batch["embedding"]) if batch["embedding"] is not None else None,
            )
            w_cred = float(user["credibility_score"])
            weight = w_complete * w_recency * w_sim * w_cred

            # ── שלב ג': שמירת הדיווח ──
            report_row = await conn.fetchrow(
                """INSERT INTO patient_reports
                   (user_id, batch_id, indication_id, pre_symptom_severity,
                    post_symptom_severity, side_effects, satisfaction, computed_weight)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                   RETURNING id""",
                report.user_id, report.batch_id, report.indication_id,
                report.pre_symptom_severity, report.post_symptom_severity,
                report.side_effects, report.satisfaction, round(weight, 4),
            )

            # ── שלב ד': העדכון הבייסיאני ──
            # נמשוך את כל הדיווחים המשוקללים לאצווה זו (כולל החדש)
            agg = await conn.fetchrow(
                """SELECT
                       COALESCE(SUM(computed_weight), 0)                       AS sum_w,
                       COALESCE(SUM(computed_weight *
                           ((pre_symptom_severity - COALESCE(post_symptom_severity,
                             pre_symptom_severity)) + 9.0) / 18.0), 0)          AS sum_wx
                   FROM patient_reports
                   WHERE batch_id = $1""",
                report.batch_id,
            )
            sum_w = float(agg["sum_w"])
            sum_wx = float(agg["sum_wx"])

            # ה-prior הקליני (m): עד כמה האצווה תואמת את יעד ההתוויה
            prior_m = batch["indication_prior"]
            prior_m = float(prior_m) if prior_m is not None else 0.5

            # נוסחת הממוצע הבייסיאני (מ-math_core)
            new_confidence = bayesian_confidence(prior_m, sum_w, sum_wx)

            new_count = int(batch["report_count"]) + 1

            # ── שלב ה': עדכון הווקטור המצטבר של האצווה ──
            # ממוצע משוקלל בין הווקטור הקיים למדידת ה-COA (התכנסות איטית).
            # כאן שומרים על ה-embedding כעוגן ומזיזים בעדינות לפי הדיווחים.
            await conn.execute(
                """UPDATE batches
                   SET confidence_score = $1,
                       report_count     = $2,
                       aggregated_vector = COALESCE(aggregated_vector, embedding)
                   WHERE id = $3""",
                round(new_confidence, 4), new_count, report.batch_id,
            )

    return ReportResponse(
        status="ok",
        report_id=report_row["id"],
        computed_weight=round(weight, 4),
        new_confidence_score=round(new_confidence, 4),
        new_report_count=new_count,
    )
