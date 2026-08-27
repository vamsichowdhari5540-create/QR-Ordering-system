# Food Politics — Server

Express + MySQL backend for Vijay's FOOD POLITICS QR ordering system.

## Setup

```bash
npm install
cp .env.example .env
# edit .env: DB credentials, JWT_SECRET, MOBILE_INDEX_KEY, ENCRYPTION_KEY
```

`MOBILE_INDEX_KEY` can be any long random string. `ENCRYPTION_KEY` must be a **32-byte hex
string** (64 hex characters) — generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then create the schema and seed a menu + admin login:

```bash
npm run migrate   # creates the database and all tables from src/db/schema.sql
npm run seed       # seeds a sample menu + the admin account from SEED_ADMIN_EMAIL/PASSWORD
npm run dev         # starts on PORT (default 4000)
```

## Notes

- Admin auth is JWT (`POST /api/auth/login` -> `Authorization: Bearer <token>`), not the PIN
  scheme from the original spec.
- Every order is cash, collected at the counter by the cashier/owner — there is no online
  payment gateway. Orders are confirmed immediately on placement.
- Printing is stubbed: `POST /api/admin/print/kot/:orderId` and `/print/receipt/:orderId`
  render a formatted preview and enqueue a row in `print_jobs`. The `/print-agent` folder
  (added in a later step) will poll `GET /api/admin/print-jobs/pending` and mark jobs
  complete via `POST /api/admin/print-jobs/:id/complete`.
- A table's orders across multiple rounds share one `table_sessions` row; closing it via
  `POST /api/admin/sessions/:sessionId/close` consolidates every round into a single
  `FINAL_BILL` print job.
