# מתכוני המשפחה

אפליקציית מתכונים שיתופית למשפחה: העלאת מתכונים ידנית או מצילום (זיהוי AI), חיפוש וסינון, תגובות וטיפים, מועדפים ודירוגים. עברית ואנגלית, מותאם לנייד, ניתן להתקנה כאפליקציה (PWA).

## סטאק

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase: מסד נתונים (Postgres + RLS), התחברות, אחסון תמונות
- Gemini 2.5 Flash: זיהוי מתכון מצילום
- next-intl: עברית (ברירת מחדל) ואנגלית
- פריסה: Vercel

## הרצה מקומית

1. `npm install`
2. להעתיק את `.env.example` לקובץ `.env.local` ולמלא את הערכים
3. להריץ את קבצי ה-SQL שב-`supabase/migrations` על פרויקט ה-Supabase (לפי סדר המספרים)
4. `npm run dev`

## משתני סביבה

| משתנה | מה זה |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | כתובת פרויקט ה-Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | מפתח ציבורי (anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | מפתח שרת סודי - לא נחשף לדפדפן |
| `GEMINI_API_KEY` | מפתח Google AI Studio לזיהוי מצילום |
| `FAMILY_INVITE_CODE` | קוד ההזמנה המשפחתי להרשמה |

## פקודות

- `npm run dev` - שרת פיתוח
- `npm run build` - בניית פרודקשן
- `npm test` - טסטים
- `npm run typecheck` - בדיקת טיפוסים

## החלטות ארכיטקטורה

- התחברות בשם משתמש: נשמר אימייל סינתטי `<username>@family.local` ב-Supabase Auth. אימייל אמיתי אופציונלי בהרשמה.
- תמונות בדלי (bucket) ציבורי עם נתיבי UUID - פשוט ומהיר; הפרטיות נשמרת ברמת האפליקציה.
- מתכון שנסרק מצילום שומר תמיד את צילומי המקור (kind='scan') בנפרד מתמונות המנה.
- הרשאות בשכבת ה-DB (RLS): מתכון פרטי גלוי רק לבעליו, הערה פרטית רק לכותבה.
