# NEXRON Flow

Billing web app with a **PHP + MySQL API**, JWT login, and **5 simple roles** (Admin / Office / Field / Store / Accounts).

## Backend

All API work is in XAMPP only (no `backend/` folder in this repo):

`C:\xampp\htdocs\mems-backend`

## Run locally

1. XAMPP → Start **Apache** + **MySQL**
2. Health check: http://127.0.0.1/mems-backend/api/health
3. Frontend:

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173` — Vite proxies `/api` → `http://127.0.0.1/mems-backend/api/...`

Config: `C:\xampp\htdocs\mems-backend\config\config.php` (MySQL DB `ledgerly`)

Seed / reset demo data:

```bash
npm run db:seed
```

### Demo users (password: `demo@123`)

| Username   | Role     |
|------------|----------|
| admin      | Admin    |
| office1    | Office   |
| field1     | Field    |
| store1     | Store    |
| accounts1  | Accounts |

## Stack

- React + Vite + TypeScript (frontend)
- PHP 8 + MySQL via XAMPP Apache (`mems-backend`)
- JWT auth, simple role → menu access
- React Router, Framer Motion, Lucide icons
