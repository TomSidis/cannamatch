"""
קנאמאצ׳ — לוגיקה מתמטית טהורה (ללא תלות ב-DB)
פונקציות העדכון הבייסיאני וחישוב המשקלים. ניתנות לבדיקה בנפרד.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

# ─────────── פרמטרי כוונון ───────────
PRIOR_WEIGHT_C = 10.0
RECENCY_HALFLIFE_DAYS = 90

COMPLETENESS_BASE = 0.4
COMPLETENESS_POST = 0.4
COMPLETENESS_EXTRA = 0.2


def completeness_weight(has_post: bool, has_extra: bool) -> float:
    """משקל לפי שלמות הדיווח."""
    w = COMPLETENESS_BASE
    if has_post:
        w += COMPLETENESS_POST
    if has_extra:
        w += COMPLETENESS_EXTRA
    return min(1.0, w)


def recency_weight(reported_at: datetime, now: datetime | None = None) -> float:
    """דעיכה מעריכית לפי גיל הדיווח."""
    now = now or datetime.now(timezone.utc)
    age_days = max(0.0, (now - reported_at).total_seconds() / 86400.0)
    return 0.5 ** (age_days / RECENCY_HALFLIFE_DAYS)


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """דמיון קוסינוס בין שני וקטורים."""
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def profile_similarity_weight(
    user_vec: list[float] | None, batch_vec: list[float] | None
) -> float:
    """דמיון פרופיל מנורמל ל-0.3..1.0; ניטרלי 0.7 בהיעדר וקטור."""
    if not user_vec or not batch_vec:
        return 0.7
    cos = cosine_similarity(user_vec, batch_vec)
    return max(0.3, min(1.0, (cos + 1) / 2))


def relief_score(pre: int, post: int | None) -> float:
    """ציון הקלה מנורמל 0-1. אין post → 0.5 ניטרלי."""
    if post is None:
        return 0.5
    relief = pre - post
    return max(0.0, min(1.0, (relief + 9) / 18))


def report_weight(
    has_post: bool, has_extra: bool,
    reported_at: datetime,
    user_vec: list[float] | None, batch_vec: list[float] | None,
    credibility: float,
    now: datetime | None = None,
) -> float:
    """המשקל המלא של דיווח = שלמות × עדכניות × דמיון × אמינות."""
    return (
        completeness_weight(has_post, has_extra)
        * recency_weight(reported_at, now)
        * profile_similarity_weight(user_vec, batch_vec)
        * credibility
    )


def bayesian_confidence(prior_m: float, sum_w: float, sum_wx: float) -> float:
    """
    הממוצע הבייסיאני:
        (C·m + Σ wᵢxᵢ) / (C + Σ wᵢ)
    prior_m = ה-prior הקליני, sum_w = סכום משקלים, sum_wx = סכום משוקלל של ההקלות.
    """
    prior_m = max(0.0, min(1.0, prior_m))
    score = (PRIOR_WEIGHT_C * prior_m + sum_wx) / (PRIOR_WEIGHT_C + sum_w)
    return max(0.0, min(1.0, score))
