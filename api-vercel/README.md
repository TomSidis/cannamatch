# פריסה ל-Vercel

תיקייה זו מכילה גרסת **Serverless Function** של ה-proxy, לפריסה ב-Vercel.

## שלבים

1. **העבר את הפונקציה למקום הנכון:** Vercel מצפה לפונקציות בתיקיית `api/` בשורש.
   ```bash
   mkdir -p api
   cp api-vercel/claude.js api/claude.js
   ```
   (בפיתוח מקומי משתמשים ב-`api/server.js` של Express; ב-Vercel משתמשים ב-`api/claude.js`.)

2. **הגדר משתנה סביבה ב-Vercel:**
   - לוח הבקרה → Settings → Environment Variables
   - שם: `ANTHROPIC_API_KEY`
   - ערך: המפתח שלך

3. **פרוס:**
   ```bash
   vercel --prod
   ```

הקליינט כבר קורא ל-`/api/claude` — אותו נתיב עובד גם מקומית (Express) וגם ב-Vercel (Serverless), אז לא צריך לשנות קוד.

## חלופות
- **Netlify Functions** — דומה, הפונקציה תהיה ב-`netlify/functions/claude.js` עם התאמה קלה של ה-handler.
- **Cloudflare Workers** — דורש התאמת ה-handler ל-fetch API של Workers.
