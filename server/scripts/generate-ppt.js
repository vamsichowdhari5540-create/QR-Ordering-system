// Generates the project presentation (.pptx) for academic evaluation.
// Content is drawn from what the system actually does — versions, table
// counts and the bugs described here are real, so the deck stays honest
// under questioning.
const path = require('path');
const PptxGenJS = require('pptxgenjs');

const INK = '1F241F';       // near-black green, the app's own dark tone
const CHILI = 'C1440E';     // accent
const CREAM = 'F3F5EF';     // app background
const MUTED = '5A6157';
const WHITE = 'FFFFFF';

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_16x9';
pptx.author = 'Vamsi Chowdhari';
pptx.title = "Vijay's Food Politics — QR Ordering System";

// ---------- helpers ----------

// Every content slide shares this chrome: title, chili rule, footer.
function slide(title, subtitle) {
  const s = pptx.addSlide();
  s.background = { color: CREAM };
  s.addText(title, {
    x: 0.55, y: 0.38, w: 9.0, h: 0.55,
    fontSize: 30, bold: true, color: INK, fontFace: 'Segoe UI',
  });
  s.addShape(pptx.ShapeType.rect, { x: 0.55, y: 1.0, w: 0.9, h: 0.055, fill: { color: CHILI } });
  if (subtitle) {
    s.addText(subtitle, {
      x: 0.55, y: 1.12, w: 9.0, h: 0.35,
      fontSize: 13, color: MUTED, fontFace: 'Segoe UI',
    });
  }
  return s;
}

function bullets(s, items, opts = {}) {
  s.addText(
    items.map((t) => ({
      text: typeof t === 'string' ? t : t.text,
      options: {
        bullet: { code: '2022' },
        breakLine: true,
        bold: typeof t === 'object' && t.bold,
        color: typeof t === 'object' && t.color ? t.color : INK,
      },
    })),
    {
      x: opts.x ?? 0.75, y: opts.y ?? 1.75, w: opts.w ?? 8.6, h: opts.h ?? 3.6,
      fontSize: opts.fontSize ?? 15, color: INK, fontFace: 'Segoe UI',
      lineSpacingMultiple: 1.45, valign: 'top',
    }
  );
}

// A row of labelled boxes — used for architecture and flow diagrams.
function boxRow(s, boxes, y, h = 0.95) {
  const gap = 0.25;
  const totalW = 8.9;
  const w = (totalW - gap * (boxes.length - 1)) / boxes.length;
  boxes.forEach((b, i) => {
    const x = 0.55 + i * (w + gap);
    s.addShape(pptx.ShapeType.roundRect, {
      x, y, w, h, rectRadius: 0.08,
      fill: { color: b.fill || WHITE },
      line: { color: b.line || 'D8DCD2', width: 1 },
    });
    s.addText(
      [
        { text: b.title, options: { bold: true, fontSize: 13, color: b.fg || INK, breakLine: true } },
        { text: b.sub || '', options: { fontSize: 10, color: b.subFg || MUTED } },
      ],
      { x, y, w, h, align: 'center', valign: 'middle', fontFace: 'Segoe UI', margin: 4 }
    );
  });
}

function arrows(s, count, y) {
  const gap = 0.25;
  const totalW = 8.9;
  const w = (totalW - gap * (count - 1)) / count;
  for (let i = 0; i < count - 1; i++) {
    const x = 0.55 + i * (w + gap) + w + 0.02;
    s.addText('▶', { x, y, w: gap - 0.04, h: 0.3, fontSize: 11, color: CHILI, align: 'center' });
  }
}

// ---------- 1. title ----------
{
  const s = pptx.addSlide();
  s.background = { color: INK };
  s.addText("Vijay's Food Politics", {
    x: 0.8, y: 1.75, w: 8.4, h: 0.8,
    fontSize: 44, bold: true, color: WHITE, fontFace: 'Segoe UI',
  });
  s.addText('A QR-Based Contactless Restaurant Ordering System', {
    x: 0.8, y: 2.6, w: 8.4, h: 0.5,
    fontSize: 19, color: 'C9D1C4', fontFace: 'Segoe UI',
  });
  s.addShape(pptx.ShapeType.rect, { x: 0.85, y: 3.3, w: 1.1, h: 0.06, fill: { color: CHILI } });
  s.addText(
    [
      { text: 'Submitted by: Vamsi Chowdhari', options: { breakLine: true } },
      { text: 'Full-Stack Web Application  ·  Deployed & Live in Production', options: { color: '9BA697' } },
    ],
    { x: 0.85, y: 3.65, w: 8.4, h: 0.8, fontSize: 13, color: 'C9D1C4', fontFace: 'Segoe UI', lineSpacingMultiple: 1.4 }
  );
}

// ---------- 2. problem ----------
{
  const s = slide('The Problem', 'Why a small restaurant needs this');
  bullets(s, [
    'Paper menus are reprinted every time a price or dish changes — costly and slow.',
    'A waiter must physically take every order, then walk it to the kitchen.',
    'Handwritten tickets get misread, lost, or reach the kitchen out of order.',
    'When one table has several separate parties, splitting the bill is manual and error-prone.',
    'The owner has no reliable end-of-day figure without adding up paper bills by hand.',
    'Items that run out mid-service keep getting ordered, because nobody updates the menu.',
  ]);
}

// ---------- 3. objectives ----------
{
  const s = slide('Objectives');
  bullets(s, [
    'Let a customer order from their own phone by scanning a QR code — no app install, no signup.',
    'Deliver orders to the kitchen instantly, printed clearly and in sequence.',
    'Give each staff role only the screen they need: kitchen, floor, owner.',
    'Support multiple independent guests at one table, each billed separately.',
    'Compute GST automatically and keep an accurate daily revenue record.',
    'Run entirely on free hosting, with no per-order cost to the restaurant.',
  ]);
}

// ---------- 4. existing vs proposed ----------
{
  const s = slide('Existing System vs Proposed System');
  s.addTable(
    [
      [
        { text: 'Aspect', options: { bold: true, color: WHITE, fill: { color: INK } } },
        { text: 'Existing (manual)', options: { bold: true, color: WHITE, fill: { color: INK } } },
        { text: 'Proposed (this system)', options: { bold: true, color: WHITE, fill: { color: INK } } },
      ],
      ['Menu', 'Printed card, reprint to change', 'Digital, updated instantly'],
      ['Ordering', 'Waiter writes it down', 'Customer orders on own phone'],
      ['Kitchen', 'Handwritten ticket', 'Live digital queue, oldest first'],
      ['Out of stock', 'Told after ordering', 'Hidden from menu immediately'],
      ['Split bills', 'Manual calculation', 'Automatic, per guest'],
      ['Day total', 'Added up by hand', 'Live, with PDF statement'],
    ],
    {
      x: 0.55, y: 1.7, w: 8.9,
      fontSize: 12, fontFace: 'Segoe UI', color: INK,
      border: { type: 'solid', color: 'D8DCD2', pt: 1 },
      fill: { color: WHITE },
      rowH: 0.42,
      colW: [1.9, 3.3, 3.7],
    }
  );
}

// ---------- 5. architecture ----------
{
  const s = slide('System Architecture', 'Three-tier, fully hosted on free infrastructure');
  boxRow(s, [
    { title: 'Customer Phone', sub: 'Scans QR → browser', fill: WHITE },
    { title: 'Staff Devices', sub: 'PWA / Android APK', fill: WHITE },
  ], 1.75, 0.85);

  s.addText('▼', { x: 0.55, y: 2.68, w: 8.9, h: 0.25, fontSize: 12, color: CHILI, align: 'center' });

  boxRow(s, [
    { title: 'React + Vite', sub: 'Frontend — Vercel', fill: WHITE },
    { title: 'Express REST API', sub: 'Backend — Render', fill: WHITE },
    { title: 'PostgreSQL', sub: 'Database — Supabase', fill: WHITE },
  ], 2.95, 0.9);

  s.addText('▼', { x: 0.55, y: 3.9, w: 8.9, h: 0.25, fontSize: 12, color: CHILI, align: 'center' });

  boxRow(s, [
    { title: 'JWT Auth + Role Guards', sub: 'OWNER · SERVER · KITCHEN', fill: INK, fg: WHITE, subFg: '9BA697', line: INK },
  ], 4.18, 0.6);
}

// ---------- 6. tech stack ----------
{
  const s = slide('Technology Stack');
  s.addTable(
    [
      [
        { text: 'Layer', options: { bold: true, color: WHITE, fill: { color: INK } } },
        { text: 'Technology', options: { bold: true, color: WHITE, fill: { color: INK } } },
        { text: 'Why', options: { bold: true, color: WHITE, fill: { color: INK } } },
      ],
      ['Frontend', 'React 18, Vite 5, React Router 6', 'Fast builds, responsive SPA'],
      ['Backend', 'Node.js, Express 4', 'Lightweight REST API'],
      ['Database', 'PostgreSQL 17 (Supabase)', 'Relational integrity, ACID transactions'],
      ['Realtime', 'Socket.IO 4', 'Live order updates to staff'],
      ['Security', 'JWT, bcrypt, Helmet, AES-256-GCM', 'Auth + data protection'],
      ['Reports', 'PDFKit', 'Daily statement export'],
      ['Mobile', 'PWA (Workbox) + TWA APK', 'Installable staff app'],
      ['Hosting', 'Vercel · Render · Supabase', 'Zero-cost deployment'],
    ],
    {
      x: 0.55, y: 1.65, w: 8.9,
      fontSize: 11.5, fontFace: 'Segoe UI', color: INK,
      border: { type: 'solid', color: 'D8DCD2', pt: 1 },
      fill: { color: WHITE },
      rowH: 0.35,
      colW: [1.5, 3.6, 3.8],
    }
  );
}

// ---------- 7. database ----------
{
  const s = slide('Database Design', '13 relational tables, normalised');
  bullets(s, [
    { text: 'Core entities', bold: true },
    'categories → items → item_variants / item_modifiers  (the menu hierarchy)',
    'table_sessions → orders → order_items  (a table visit and everything ordered in it)',
    'customers  (identified by phone, never stored in plain text)',
    'admins  (staff accounts with role: OWNER / SERVER / KITCHEN)',
    'daily_ledger, order_sequences, print_jobs  (reporting, ID generation, printing)',
  ], { h: 2.2, fontSize: 13.5 });

  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.75, y: 3.95, w: 8.5, h: 0.95, rectRadius: 0.08,
    fill: { color: WHITE }, line: { color: 'D8DCD2', width: 1 },
  });
  s.addText(
    [
      { text: 'Key design decision:  ', options: { bold: true, color: CHILI } },
      { text: 'a table session groups many orders, so several guests can share one table yet each be billed independently — the table only clears when every guest has settled.', options: { color: INK } },
    ],
    { x: 0.95, y: 4.05, w: 8.1, h: 0.75, fontSize: 12, fontFace: 'Segoe UI', valign: 'middle' }
  );
}

// ---------- 8. modules ----------
{
  const s = slide('Modules');
  boxRow(s, [
    { title: 'Customer', sub: 'Scan · browse · order', fill: WHITE },
    { title: 'Kitchen', sub: 'Live ticket queue', fill: WHITE },
  ], 1.7, 1.15);
  boxRow(s, [
    { title: 'Floor Server', sub: 'Table status · serve', fill: WHITE },
    { title: 'Owner', sub: 'Billing · menu · day book', fill: WHITE },
  ], 3.05, 1.15);

  s.addText(
    'Each role sees only its own screen. Signing in routes the user automatically to the right dashboard.',
    { x: 0.55, y: 4.4, w: 8.9, h: 0.4, fontSize: 12, color: MUTED, fontFace: 'Segoe UI', align: 'center' }
  );
}

// ---------- 9. order flow ----------
{
  const s = slide('Order Workflow');
  boxRow(s, [
    { title: '1. Scan', sub: 'QR at table' },
    { title: '2. Order', sub: 'Phone browser' },
    { title: '3. Kitchen', sub: 'Live ticket' },
    { title: '4. Serve', sub: 'Marked ready' },
    { title: '5. Settle', sub: 'Bill + GST' },
  ], 2.0, 1.0);
  arrows(s, 5, 2.35);

  bullets(s, [
    'Prices are recalculated on the server from the database — the phone is never trusted.',
    'Every order is confirmed instantly; payment is cash at the counter.',
    'Cancelling the last active order frees the table automatically.',
  ], { y: 3.5, h: 1.3, fontSize: 13 });
}

// ---------- 10. features ----------
{
  const s = slide('Key Features');
  bullets(s, [
    { text: 'Live menu — ', bold: true },
    '15 categories, 163 dishes; an item marked out of stock disappears from every phone at once and returns automatically the next day.',
    { text: 'Split billing — ', bold: true },
    'multiple guests at one table are tracked and billed separately.',
    { text: 'Automatic GST — ', bold: true },
    'CGST 2.5% + SGST 2.5% computed per order, itemised on the bill.',
    { text: 'Day book — ', bold: true },
    'live revenue, category breakdown, table history, exportable as a PDF statement.',
    { text: 'Search — ', bold: true },
    'customers and the owner can search dishes across all categories instantly.',
  ], { fontSize: 13, h: 3.5 });
}

// ---------- 11. security ----------
{
  const s = slide('Security & Data Protection');
  bullets(s, [
    { text: 'Authentication — ', bold: true },
    'JWT tokens with role-based route guards; passwords hashed with bcrypt (12 rounds).',
    { text: 'Phone numbers are never stored in plain text — ', bold: true },
    'each is encrypted with AES-256-GCM for display, and indexed separately with an HMAC-SHA256 hash so a returning customer can still be recognised without the number ever being readable in the database.',
    { text: 'Transport & headers — ', bold: true },
    'HTTPS enforced, Helmet security headers, CORS restricted to the known frontend origin.',
    { text: 'Abuse protection — ', bold: true },
    'rate limiting on login and order endpoints; all input validated server-side.',
  ], { fontSize: 12.5, h: 3.6 });
}

// ---------- 12. deployment ----------
{
  const s = slide('Deployment', 'Live in production at zero hosting cost');
  s.addTable(
    [
      [
        { text: 'Component', options: { bold: true, color: WHITE, fill: { color: INK } } },
        { text: 'Platform', options: { bold: true, color: WHITE, fill: { color: INK } } },
        { text: 'Notes', options: { bold: true, color: WHITE, fill: { color: INK } } },
      ],
      ['Frontend', 'Vercel', 'Auto-deploys from GitHub'],
      ['REST API', 'Render', 'Node service, health-checked'],
      ['Database', 'Supabase (PostgreSQL)', 'Separate dev + production databases'],
      ['Staff app', 'Android APK (TWA)', 'Signed, domain-verified'],
    ],
    {
      x: 0.55, y: 1.7, w: 8.9,
      fontSize: 12, fontFace: 'Segoe UI', color: INK,
      border: { type: 'solid', color: 'D8DCD2', pt: 1 },
      fill: { color: WHITE }, rowH: 0.42, colW: [1.9, 3.0, 4.0],
    }
  );
  bullets(s, [
    'Local development runs against its own database, so testing can never touch the restaurant’s real books.',
    'Every push to GitHub redeploys the frontend and API automatically.',
  ], { y: 4.05, h: 0.9, fontSize: 12 });
}

// ---------- 13. testing ----------
{
  const s = slide('Testing & Validation');
  bullets(s, [
    'An automated suite of 19 checks covers the full database layer: order lifecycle, both cancellation cases, availability toggles, day-book totals and PDF export.',
    'End-to-end testing performed in the browser against the live deployment — order placed, cooked, served, settled.',
    'Concurrency verified: two tables ordering simultaneously stay independent, with correct separate totals.',
    'QR codes verified by decoding all 15 images programmatically before printing, confirming each maps to its correct table.',
  ], { fontSize: 13, h: 2.6 });

  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.75, y: 4.0, w: 8.5, h: 0.75, rectRadius: 0.08,
    fill: { color: WHITE }, line: { color: 'D8DCD2', width: 1 },
  });
  s.addText('19 / 19 automated checks passing  ·  verified in production', {
    x: 0.75, y: 4.0, w: 8.5, h: 0.75,
    fontSize: 13, bold: true, color: CHILI, fontFace: 'Segoe UI', align: 'center', valign: 'middle',
  });
}

// ---------- 14. challenges ----------
{
  const s = slide('Challenges Faced & Solutions', 'Real defects found and fixed during development');
  s.addTable(
    [
      [
        { text: 'Problem', options: { bold: true, color: WHITE, fill: { color: INK } } },
        { text: 'Cause', options: { bold: true, color: WHITE, fill: { color: INK } } },
        { text: 'Solution', options: { bold: true, color: WHITE, fill: { color: INK } } },
      ],
      ['Day book empty after midnight', 'Server ran in UTC; restaurant works in IST, so the business day ended at the wrong moment', 'Day boundaries resolved explicitly in IST'],
      ['Tables freed themselves instantly', 'Timestamps read as local time, making new sessions look hours idle', 'Migrated to timezone-aware TIMESTAMPTZ'],
      ['Orders failed on the live site', 'JSON column decoded twice by the driver', 'Parse only when the driver returns text'],
      ['Bill could not be settled', 'Two environments used different encryption keys on one database', 'Aligned keys; settling no longer blocked by an unreadable phone number'],
    ],
    {
      x: 0.55, y: 1.7, w: 8.9,
      fontSize: 10.5, fontFace: 'Segoe UI', color: INK,
      border: { type: 'solid', color: 'D8DCD2', pt: 1 },
      fill: { color: WHITE }, rowH: 0.7, colW: [2.4, 3.6, 2.9],
      valign: 'middle',
    }
  );
}

// ---------- 15. results ----------
{
  const s = slide('Results');
  const stats = [
    ['163', 'menu items'],
    ['15', 'tables live'],
    ['13', 'database tables'],
    ['3', 'staff roles'],
  ];
  const w = 2.05, gap = 0.22;
  stats.forEach(([n, label], i) => {
    const x = 0.55 + i * (w + gap);
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.8, w, h: 1.25, rectRadius: 0.1,
      fill: { color: WHITE }, line: { color: 'D8DCD2', width: 1 },
    });
    s.addText(
      [
        { text: n, options: { fontSize: 30, bold: true, color: CHILI, breakLine: true } },
        { text: label, options: { fontSize: 11, color: MUTED } },
      ],
      { x, y: 1.8, w, h: 1.25, align: 'center', valign: 'middle', fontFace: 'Segoe UI' }
    );
  });

  bullets(s, [
    'Customers order without installing anything — the QR code opens straight into the menu.',
    'Orders reach the kitchen in under a second, in the order they were placed.',
    'The owner sees live revenue and can export a GST-itemised daily statement.',
    'Runs at no monthly cost on free hosting tiers.',
  ], { y: 3.35, h: 1.5, fontSize: 13 });
}

// ---------- 16. future scope ----------
{
  const s = slide('Future Scope');
  bullets(s, [
    'Online payment integration (UPI / cards) alongside the existing cash flow.',
    'Thermal printer agent for automatic KOT and bill printing at the counter.',
    'Customer order history and loyalty offers, using the existing phone-number identity.',
    'Analytics: peak hours, slow-moving dishes, per-category trends over time.',
    'Multi-branch support with a shared menu and per-branch reporting.',
    'Regional language menu for wider accessibility.',
  ], { fontSize: 14 });
}

// ---------- 17. conclusion ----------
{
  const s = slide('Conclusion');
  bullets(s, [
    'A complete, working restaurant ordering system — not a prototype — deployed and verified in production.',
    'Covers the full cycle: customer ordering, kitchen operations, floor service, billing and daily accounting.',
    'Built with attention to correctness: server-side pricing, transactional order creation, encrypted customer data and timezone-accurate reporting.',
    'Demonstrates the full development lifecycle: requirement analysis, database design, implementation, debugging, testing and deployment.',
  ], { fontSize: 14, h: 2.8 });

  s.addShape(pptx.ShapeType.rect, { x: 0.75, y: 4.35, w: 0.9, h: 0.05, fill: { color: CHILI } });
  s.addText('Thank You', {
    x: 0.75, y: 4.5, w: 8.5, h: 0.5,
    fontSize: 20, bold: true, color: INK, fontFace: 'Segoe UI',
  });
}

// pptxgenjs resolves fileName against the current working directory, so this
// is written relative to the repo root rather than passed as an absolute path.
const out = path.join('..', 'Food-Politics-Presentation.pptx');
pptx.writeFile({ fileName: out }).then(() => {
  console.log('Presentation written:', path.resolve(out));
});
