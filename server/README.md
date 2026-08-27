# Food Politics — Server

Express + Postgres (Supabase) backend for Vijay's FOOD POLITICS QR ordering system.

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
npm run migrate   # applies src/db/schema.sql
npm run seed       # seeds the menu + staff accounts from the SEED_* vars
npm run dev         # starts on PORT (default 4000)
```

Sanity-check the whole database layer at any time (order lifecycle, both
cancellation cases, availability, day book, PDF export):

```bash
node scripts/test-supabase-flow.js
```

## Environments

Local dev and production share one Supabase project but use **separate
databases**, so test orders can never land in the real books:

| | `DB_NAME` |
|---|---|
| Production (Render) | `postgres` |
| Local development | `food_politics_dev` |

`DB_NAME` is the only variable that differs. Isolation is at the database
level rather than a schema/`search_path` switch on purpose — `search_path` is
session state, and a connection pooler can reset or share it between clients.

Two settings must be **identical** in both environments, because the same
person's phone number has to be readable wherever it was written:

- `ENCRYPTION_KEY` — decrypts stored mobile numbers. Changing it after
  go-live permanently orphans every customer record written under the old key.
- `MOBILE_INDEX_KEY` — the HMAC lookup index. A mismatch makes a returning
  customer look brand new, losing their order history.

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
