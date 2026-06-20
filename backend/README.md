# קנאמאצ׳ — Backend (FastAPI + PostgreSQL + pgvector)

מנוע ההתאמה המולקולרי: סכמת DB וקטורית, אלגוריתם החלפה חכמה (Cosine + שער רגולציה), ועדכון בייסיאני מדיווחי מטופלים.

## מבנה

```
backend/
├── db/
│   ├── schema.sql              # סכמת PostgreSQL + pgvector (DDL)
│   ├── seed_indications.sql    # 12 התוויות עם פרופילי DNA מטרה
│   └── database.py             # חיבור asyncpg + pgvector
├── models/
│   └── schemas.py              # מודלי Pydantic + ולידציה
├── services/
│   ├── math_core.py            # לוגיקה מתמטית טהורה (ניתנת לבדיקה)
│   ├── substitution.py         # החלפה חכמה: שער רגולציה + Cosine
│   └── bayesian.py             # עדכון בייסיאני מדיווחים
├── api/
│   └── main.py                 # אפליקציית FastAPI + endpoints
├── tests/
│   └── test_math.py            # בדיקות יחידה למתמטיקה (ללא DB)
├── docker-compose.yml          # PostgreSQL+pgvector מוכן להרצה
└── requirements.txt
```

## הרצה מהירה

### 1. הקמת מסד הנתונים (Docker)
```bash
cd backend
docker compose up -d        # מקים Postgres+pgvector, מריץ schema+seed אוטומטית
```
המסד יעלה על `localhost:5432` עם 12 ההתוויות כבר טעונות.

### 2. התקנת התלויות והרצת ה-API
```bash
pip install -r requirements.txt
export DATABASE_URL="postgresql://cannamatch:cannamatch@localhost:5432/cannamatch"
uvicorn api.main:app --reload --port 8000
```
תיעוד אינטראקטיבי: `http://localhost:8000/docs`

### 3. בדיקת המתמטיקה (ללא DB)
```bash
python tests/test_math.py
```

## נקודות הקצה (Endpoints)

| Method | Path | תיאור |
|---|---|---|
| GET  | `/api/health` | בדיקת חיים |
| GET  | `/api/indications` | רשימת ההתוויות הפעילות + אזהרות |
| POST | `/api/substitution` | 3 התחליפים הקרובים (אחרי שער רגולציה) |
| POST | `/api/reports` | דיווח מטופל + עדכון בייסיאני |

### דוגמה: בקשת תחליפים
```json
POST /api/substitution
{
  "user_id": "uuid-here",
  "target_vector": [0.7,0.3,0.1,0.1, 0.6,0.4,0.8,0.5,0.2,0.3,0.1,0.1],
  "product_type": "flower",
  "limit": 3
}
```

### דוגמה: דיווח מטופל
```json
POST /api/reports
{
  "user_id": "uuid-here",
  "batch_id": "uuid-here",
  "indication_id": 1,
  "pre_symptom_severity": 8,
  "post_symptom_severity": 3,
  "side_effects": ["יובש בפה"],
  "satisfaction": 8
}
```

## הארכיטקטורה בקצרה

**שער הרגולציה קודם לכל:** ב-`substitution.py`, ה-`WHERE b.category = ANY(licenses)` רץ *לפני* חישוב הדמיון (`ORDER BY embedding <=> target`). כך לעולם לא יומלץ מוצר מחוץ לרישיון — גם אם הוא הכי דומה כימית.

**המודל הבייסיאני:** ב-`math_core.py`, `bayesian_confidence` מושך הערכות עם מעט דיווחים לכיוון ה-prior הקליני (מהמחקר), ומשחרר אותן לכיוון הדאטה האמיתי ככל שנצברים דיווחים. כל דיווח משוקלל לפי שלמות × עדכניות × דמיון-מטופל × אמינות.

**הווקטור:** 12 ממדים בסדר קבוע — THC, CBD, CBG, CBN, ואז 8 טרפנים. הסדר חייב להישמר עקבי בכל המערכת (frontend, seed, COA import).

## הבהרות
- **פרטיות:** לפני production — הצפנת PII ברמת עמודה, הפרדת טבלאות מזהות מקליניות, מנגנון consent ומחיקה (GDPR/חוק הגנת הפרטיות הישראלי). זה שלד, לא מערכת מאובטחת מוכנה.
- **רפואי:** המערכת מתאימה ומדרגת — לא מאבחנת, לא רושמת מינון. כל ערך טיפולי באחריות הרופא.
- **רגולציה:** טבלת ה-`indications` דינמית (`is_active`) — מתעדכנת עם נוהל 106 בלי שינוי קוד.
