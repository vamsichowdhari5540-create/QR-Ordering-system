-- Vijay's FOOD POLITICS — QR Ordering System
-- MySQL schema (v1). Adapted from spec: PIN auth -> admins table (JWT),
-- plaintext mobile -> mobileIndex/mobileEncrypted, and print_jobs queue
-- added for the local print-agent architecture.

SET NAMES utf8mb4;

-- 0. ADMINS (JWT auth, bcrypt password hashes)
CREATE TABLE IF NOT EXISTS admins (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(190) NOT NULL UNIQUE,
  passwordHash VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  -- OWNER sees revenue and settles bills; SERVER works the floor; KITCHEN only sees the ticket queue.
  role ENUM('OWNER', 'SERVER', 'KITCHEN') NOT NULL DEFAULT 'OWNER',
  active BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 1. MENU STRUCTURE
CREATE TABLE IF NOT EXISTS categories (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  displayOrder INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  categoryId INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  basePrice DECIMAL(10, 2) NOT NULL,
  image VARCHAR(255),
  outOfStockDate DATE DEFAULT NULL, -- set to today when 86'd; auto-clears itself the next calendar day
  active BOOLEAN DEFAULT TRUE, -- removed from the menu entirely (soft delete)
  gstApplicable BOOLEAN DEFAULT TRUE,
  displayOrder INT DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (categoryId) REFERENCES categories(id),
  INDEX (categoryId)
);

CREATE TABLE IF NOT EXISTS item_variants (
  id INT PRIMARY KEY AUTO_INCREMENT,
  itemId INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  priceModifier DECIMAL(10, 2) DEFAULT 0,
  displayOrder INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (itemId) REFERENCES items(id) ON DELETE CASCADE,
  UNIQUE KEY (itemId, name)
);

CREATE TABLE IF NOT EXISTS item_modifiers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  itemId INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  type ENUM('RADIO', 'CHECKBOX') DEFAULT 'RADIO',
  priceModifier DECIMAL(10, 2) DEFAULT 0,
  displayOrder INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (itemId) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS modifier_options (
  id INT PRIMARY KEY AUTO_INCREMENT,
  modifierId INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  priceModifier DECIMAL(10, 2) DEFAULT 0,
  displayOrder INT DEFAULT 0,
  FOREIGN KEY (modifierId) REFERENCES item_modifiers(id) ON DELETE CASCADE
);

-- 2. SESSIONS (table-level grouping)
CREATE TABLE IF NOT EXISTS table_sessions (
  id VARCHAR(64) PRIMARY KEY, -- sess_<timestamp>_<table>
  tableId INT NOT NULL,
  status ENUM('OPEN', 'CLOSED') DEFAULT 'OPEN',
  totalAmount DECIMAL(12, 2) DEFAULT 0,
  totalTax DECIMAL(10, 2) DEFAULT 0,
  openedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closedAt TIMESTAMP NULL,
  lastActivityAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  notes TEXT,
  INDEX (tableId, status),
  INDEX (openedAt)
);

-- 3. CUSTOMERS (minimal, phone protected)
-- mobileIndex: deterministic HMAC-SHA256(mobile) for lookups (never reversible)
-- mobileEncrypted: AES-256-GCM ciphertext (iv:authTag:ciphertext, hex) for display
CREATE TABLE IF NOT EXISTS customers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  mobileIndex CHAR(64) NOT NULL UNIQUE,
  mobileEncrypted VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  totalOrders INT DEFAULT 1,
  firstOrderAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  lastOrderAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (mobileIndex)
);

-- 4. ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(50) PRIMARY KEY, -- ORD-DDMM-NNN
  sessionId VARCHAR(64) NOT NULL,
  tableId INT NOT NULL,
  customerId INT,
  customerName VARCHAR(100) NOT NULL,
  status ENUM('PENDING', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED') DEFAULT 'PENDING',
  subtotal DECIMAL(12, 2) NOT NULL,
  cgstAmount DECIMAL(10, 2) NOT NULL,
  sgstAmount DECIMAL(10, 2) NOT NULL,
  taxTotal DECIMAL(10, 2) NOT NULL,
  grandTotal DECIMAL(12, 2) NOT NULL,
  kotPrintedAt TIMESTAMP NULL,
  receiptPrintedAt TIMESTAMP NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completedAt TIMESTAMP NULL,
  -- Set when this order's guest is billed. Lets one table hold several
  -- independent parties, each settled on their own without closing the table.
  paidAt TIMESTAMP NULL,
  FOREIGN KEY (sessionId) REFERENCES table_sessions(id),
  FOREIGN KEY (customerId) REFERENCES customers(id),
  INDEX (tableId, status),
  INDEX (createdAt)
);

-- 5. ORDER ITEMS
CREATE TABLE IF NOT EXISTS order_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  orderId VARCHAR(50) NOT NULL,
  itemId INT NOT NULL,
  itemName VARCHAR(150) NOT NULL,
  quantity INT NOT NULL,
  variantId INT,
  variantName VARCHAR(100),
  selectedModifiers JSON,
  specialNotes TEXT,
  itemPrice DECIMAL(10, 2) NOT NULL,
  itemTotal DECIMAL(12, 2) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (itemId) REFERENCES items(id),
  FOREIGN KEY (variantId) REFERENCES item_variants(id),
  INDEX (orderId)
);

-- 6. DAILY LEDGER (reconciliation)
CREATE TABLE IF NOT EXISTS daily_ledger (
  id INT PRIMARY KEY AUTO_INCREMENT,
  date DATE UNIQUE NOT NULL,
  totalOrders INT DEFAULT 0,
  totalRevenue DECIMAL(12, 2) DEFAULT 0,
  totalTax DECIMAL(10, 2) DEFAULT 0,
  totalRefunds DECIMAL(12, 2) DEFAULT 0,
  closedAt TIMESTAMP NULL,
  notes TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (date)
);

-- 7. ORDER SEQUENCES (per-day counter backing ORD-DDMM-NNN ids)
CREATE TABLE IF NOT EXISTS order_sequences (
  dateKey CHAR(4) PRIMARY KEY, -- DDMM
  seq INT NOT NULL DEFAULT 0
);

-- 8. PRINT JOBS (queue consumed by the local print-agent)
CREATE TABLE IF NOT EXISTS print_jobs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  orderId VARCHAR(50) NOT NULL,
  type ENUM('KOT', 'RECEIPT', 'FINAL_BILL') NOT NULL,
  status ENUM('PENDING', 'PRINTED', 'FAILED') DEFAULT 'PENDING',
  payload JSON NOT NULL,
  errorMessage TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  printedAt TIMESTAMP NULL,
  FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX (status),
  INDEX (orderId)
);
