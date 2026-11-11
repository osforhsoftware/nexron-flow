# NEXRON Flow PHP Backend (XAMPP / MySQL)

**This is the live backend.** Edit API code here only:

`C:\xampp\htdocs\mems-backend`

## Steps

1. **XAMPP Control Panel** — Start **Apache** + **MySQL**
2. Health check: http://127.0.0.1/mems-backend/api/health  
   Should return: `{"ok":true,...}`
3. Frontend project: `npm run dev`  
   Vite proxies `/api` → this folder
4. Login: `admin` / `demo@123`

## Config

`config/config.php` — MySQL database `ledgerly` (user `root`, empty password).

## Seed / reset demo data

```bash
cd C:\xampp\htdocs\mems-backend
C:\xampp\php\php.exe scripts\seed.php
```

Or from the frontend repo: `npm run db:seed`

## Notes

- No `php -S` / port `4000` needed when Apache serves this folder.
- Frontend proxy: `/api` → `http://127.0.0.1/mems-backend/api/...`
