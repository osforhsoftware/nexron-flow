# NEXRON Flow PHP Backend (XAMPP / MySQL)

## Recommended setup (your current path)

Backend lives in:

`C:\xampp\htdocs\mems-backend`

### Steps

1. **XAMPP Control Panel** → Start **Apache** + **MySQL**
2. Open health check:  
   http://127.0.0.1/mems-backend/api/health  
   Should return: `{"ok":true,"phase":0,...}`
3. In the frontend project:
   ```bash
   npm run dev
   ```
4. Login: `admin` / `demo@123`

No need for `php -S ...4000` when using Apache + htdocs.

### Config

`config/config.php` → MySQL database `ledgerly` (user `root`, empty password).

### Seed / reset demo data

```bash
cd C:\xampp\htdocs\mems-backend
C:\xampp\php\php.exe scripts\seed.php
```

### Important

- Do **not** use `router.php` / port `4000` for this setup.
- Frontend Vite proxies `/api` → `http://127.0.0.1/mems-backend/api/...`
- After moving backend to htdocs, restart `npm run dev` once so the new proxy applies.
