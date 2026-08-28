-- Vijay's FOOD POLITICS — QR Ordering System
-- Postgres schema (Supabase). Ported from the original MySQL schema:
-- PIN auth -> admins table (JWT), plaintext mobile -> mobileIndex/
-- mobileEncrypted, print_jobs queue for the local print-agent.
--
-- Every camelCase column is double-quoted so Postgres preserves its case
-- (unquoted identifiers fold to lowercase) — the app's JS reads rows by
-- exact camelCase property name, same as it did against MySQL.

-- Generic "touch updatedAt on any UPDATE" trigger, replacing MySQL's
-- `ON UPDATE CURRENT_TIMESTAMP` column option (Postgres has no equivalent).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_last_activity_at() RETURNS TRIGGER AS $$
BEGIN
  NEW."lastActivityAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_last_order_at() RETURNS TRIGGER AS $$
BEGIN
  NEW."lastOrderAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 0. ADMINS (JWT auth, bcrypt password hashes)
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  "passwordHash" VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  -- OWNER sees revenue and settles bills; SERVER works the floor; KITCHEN only sees the ticket queue.
  role TEXT NOT NULL DEFAULT 'OWNER' CHECK (role IN ('OWNER', 'SERVER', 'KITCHEN')),
  active BOOLEAN DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 1. MENU STRUCTURE
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  "displayOrder" INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
DROP TRIGGER IF EXISTS trg_categories_updated_at ON categories;
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  "categoryId" INT NOT NULL REFERENCES categories(id),
  name VARCHAR(150) NOT NULL,
  description TEXT,
  "basePrice" DECIMAL(10, 2) NOT NULL,
  image VARCHAR(255),
  "outOfStockDate" DATE DEFAULT NULL, -- set to today when 86'd; auto-clears itself the next calendar day
  active BOOLEAN DEFAULT TRUE, -- removed from the menu entirely (soft delete)
  "gstApplicable" BOOLEAN DEFAULT TRUE,
  "displayOrder" INT DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_items_category ON items ("categoryId");
DROP TRIGGER IF EXISTS trg_items_updated_at ON items;
CREATE TRIGGER trg_items_updated_at BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS item_variants (
  id SERIAL PRIMARY KEY,
  "itemId" INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  "priceModifier" DECIMAL(10, 2) DEFAULT 0,
  "displayOrder" INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  UNIQUE ("itemId", name)
);

CREATE TABLE IF NOT EXISTS item_modifiers (
  id SERIAL PRIMARY KEY,
  "itemId" INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type TEXT DEFAULT 'RADIO' CHECK (type IN ('RADIO', 'CHECKBOX')),
  "priceModifier" DECIMAL(10, 2) DEFAULT 0,
  "displayOrder" INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS modifier_options (
  id SERIAL PRIMARY KEY,
  "modifierId" INT NOT NULL REFERENCES item_modifiers(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  "priceModifier" DECIMAL(10, 2) DEFAULT 0,
  "displayOrder" INT DEFAULT 0
);

-- 2. SESSIONS (table-level grouping)
CREATE TABLE IF NOT EXISTS table_sessions (
  id VARCHAR(64) PRIMARY KEY, -- sess_<timestamp>_<table>
  "tableId" INT NOT NULL,
  status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  "totalAmount" DECIMAL(12, 2) DEFAULT 0,
  "totalTax" DECIMAL(10, 2) DEFAULT 0,
  "openedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMPTZ NULL,
  "lastActivityAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  -- Set when the guest taps "Call server"; cleared when staff acknowledges it.
  -- Lives on the session (not a standalone table) since a call always implies
  -- an occupied table, and reuses the same row the rest of the table's state lives on.
  "callRequestedAt" TIMESTAMPTZ NULL,
  notes TEXT
);
-- CREATE TABLE IF NOT EXISTS skips column changes on a table that already
-- exists, so this covers a table_sessions created before this column existed.
ALTER TABLE table_sessions ADD COLUMN IF NOT EXISTS "callRequestedAt" TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_table_status ON table_sessions ("tableId", status);
CREATE INDEX IF NOT EXISTS idx_sessions_opened_at ON table_sessions ("openedAt");
DROP TRIGGER IF EXISTS trg_sessions_last_activity ON table_sessions;
CREATE TRIGGER trg_sessions_last_activity BEFORE UPDATE ON table_sessions
  FOR EACH ROW EXECUTE FUNCTION set_last_activity_at();

-- 3. CUSTOMERS (minimal, phone protected)
-- mobileIndex: deterministic HMAC-SHA256(mobile) for lookups (never reversible)
-- mobileEncrypted: AES-256-GCM ciphertext (iv:authTag:ciphertext, hex) for display
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  "mobileIndex" CHAR(64) NOT NULL UNIQUE,
  "mobileEncrypted" VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  "totalOrders" INT DEFAULT 1,
  "firstOrderAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "lastOrderAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customers_mobile_index ON customers ("mobileIndex");
DROP TRIGGER IF EXISTS trg_customers_last_order ON customers;
CREATE TRIGGER trg_customers_last_order BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_last_order_at();

-- 4. ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(50) PRIMARY KEY, -- ORD-DDMM-NNN
  "sessionId" VARCHAR(64) NOT NULL REFERENCES table_sessions(id),
  "tableId" INT NOT NULL,
  "customerId" INT REFERENCES customers(id),
  "customerName" VARCHAR(100) NOT NULL,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED')),
  subtotal DECIMAL(12, 2) NOT NULL,
  "cgstAmount" DECIMAL(10, 2) NOT NULL,
  "sgstAmount" DECIMAL(10, 2) NOT NULL,
  "taxTotal" DECIMAL(10, 2) NOT NULL,
  "grandTotal" DECIMAL(12, 2) NOT NULL,
  "kotPrintedAt" TIMESTAMPTZ NULL,
  "receiptPrintedAt" TIMESTAMPTZ NULL,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ NULL,
  -- Set when this order's guest is billed. Lets one table hold several
  -- independent parties, each settled on their own without closing the table.
  "paidAt" TIMESTAMPTZ NULL,
  -- Proves the caller is the guest who placed this order, not just someone
  -- who guessed the ID. Order ids are sequential (ORD-DDMM-NNN) and meant to
  -- be — they're printed on receipts and read aloud at pickup — so they
  -- can't double as the secret the public status page relies on.
  "accessToken" VARCHAR(64) NULL
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "accessToken" VARCHAR(64) NULL;
CREATE INDEX IF NOT EXISTS idx_orders_table_status ON orders ("tableId", status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders ("createdAt");

-- 5. ORDER ITEMS
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  "orderId" VARCHAR(50) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  "itemId" INT NOT NULL REFERENCES items(id),
  "itemName" VARCHAR(150) NOT NULL,
  quantity INT NOT NULL,
  "variantId" INT REFERENCES item_variants(id),
  "variantName" VARCHAR(100),
  "selectedModifiers" JSONB,
  "specialNotes" TEXT,
  "itemPrice" DECIMAL(10, 2) NOT NULL,
  "itemTotal" DECIMAL(12, 2) NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items ("orderId");

-- 6. DAILY LEDGER (reconciliation)
CREATE TABLE IF NOT EXISTS daily_ledger (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  "totalOrders" INT DEFAULT 0,
  "totalRevenue" DECIMAL(12, 2) DEFAULT 0,
  "totalTax" DECIMAL(10, 2) DEFAULT 0,
  "totalRefunds" DECIMAL(12, 2) DEFAULT 0,
  "closedAt" TIMESTAMPTZ NULL,
  notes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_daily_ledger_date ON daily_ledger (date);
DROP TRIGGER IF EXISTS trg_ledger_updated_at ON daily_ledger;
CREATE TRIGGER trg_ledger_updated_at BEFORE UPDATE ON daily_ledger
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7. ORDER SEQUENCES (per-day counter backing ORD-DDMM-NNN ids)
CREATE TABLE IF NOT EXISTS order_sequences (
  "dateKey" CHAR(4) PRIMARY KEY, -- DDMM
  seq INT NOT NULL DEFAULT 0
);

-- 8. PRINT JOBS (queue consumed by the local print-agent)
CREATE TABLE IF NOT EXISTS print_jobs (
  id SERIAL PRIMARY KEY,
  "orderId" VARCHAR(50) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('KOT', 'RECEIPT', 'FINAL_BILL')),
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PRINTED', 'FAILED')),
  payload JSONB NOT NULL,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "printedAt" TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs (status);
CREATE INDEX IF NOT EXISTS idx_print_jobs_order ON print_jobs ("orderId");
