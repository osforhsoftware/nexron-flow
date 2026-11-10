# NEXRON Flow

Billing web app with a **PHP + MySQL API**, JWT login, and **5 simple roles** (Admin / Office / Field / Store / Accounts).

## Run locally

Terminal 1 — PHP API (requires XAMPP PHP):

### Backend (XAMPP Apache — recommended)

Backend folder: `C:\xampp\htdocs\mems-backend`

1. XAMPP → Start **Apache** + **MySQL**
2. Check: http://127.0.0.1/mems-backend/api/health
3. Frontend: `npm run dev` (proxies `/api` to Apache)

Uses **MySQL** database `ledgerly`. Config: `mems-backend/config/config.php`

Terminal 2 — frontend:

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173` (Vite proxies `/api` → PHP on port 4000).

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
- PHP 8 + SQLite PDO (backend API)
- JWT auth, simple role → menu access (no RBAC matrix)
- React Router, Framer Motion, Lucide icons

See `backend/README.md` for API endpoints.
