"""
קנאמאצ׳ — אפליקציית FastAPI ראשית
נקודות הקצה: התאמת תחליפים, דיווח מטופל, רשימת התוויות.
הרצה:  uvicorn api.main:app --reload --port 8000
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from db.database import init_pool, close_pool, get_conn
from models.schemas import (
    SubstitutionRequest, SubstitutionResponse,
    PatientReportRequest, ReportResponse,
)
from services.substitution import smart_substitution
from services.bayesian import submit_report_and_update


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(
    title="קנאמאצ׳ API",
    description="מנוע התאמת קנאביס רפואי מבוסס DNA מולקולרי",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # ה-frontend בפיתוח
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"ok": True}


@app.get("/api/indications")
async def list_indications(active_only: bool = True):
    """רשימת ההתוויות הפעילות (נוהל 106) + אזהרות מיוחדות."""
    q = """SELECT id, code, name_he, name_en, is_active, evidence_strength,
                  has_special_warning, warning_text
           FROM indications"""
    if active_only:
        q += " WHERE is_active = TRUE"
    q += " ORDER BY id"
    async with get_conn() as conn:
        rows = await conn.fetch(q)
    return [dict(r) for r in rows]


@app.post("/api/substitution", response_model=SubstitutionResponse)
async def substitution(req: SubstitutionRequest):
    """מחזיר את 3 התחליפים הקרובים ביותר — אחרי שער הרגולציה."""
    try:
        return await smart_substitution(
            user_id=req.user_id,
            target_vector=req.target_vector,
            product_type=req.product_type,
            limit=req.limit,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"שגיאת מערכת: {e}")


@app.post("/api/reports", response_model=ReportResponse)
async def submit_report(req: PatientReportRequest):
    """קליטת דיווח מטופל + הרצת העדכון הבייסיאני."""
    try:
        return await submit_report_and_update(req)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"שגיאת מערכת: {e}")
