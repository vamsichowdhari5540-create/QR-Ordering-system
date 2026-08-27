const path = require('path');
const PDFDocument = require('pdfkit');

// PDFKit's built-in fonts are WinAnsi-encoded and have no glyph for U+20B9 (₹).
// IBM Plex Sans (OFL, the same family the app's screens use) does, so it is
// embedded here — otherwise every rupee sign would render as garbage.
const FONT = 'Plex';
const FONT_BOLD = 'Plex-Bold';
const FONT_FILES = {
  [FONT]: path.join(__dirname, 'fonts', 'IBMPlexSans-Regular.ttf'),
  [FONT_BOLD]: path.join(__dirname, 'fonts', 'IBMPlexSans-Bold.ttf'),
};

function money(n) {
  return `₹${Number(n).toFixed(2)}`;
}

function clock(ts) {
  return new Date(ts).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function longDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const INK = '#1f241f';
const SOFT = '#5c655a';
const FAINT = '#8c9488';
const CHILI = '#c1440e';
const RULE = '#dde1d6';

const COLUMNS = [
  { key: 'time', label: 'TIME', width: 52 },
  { key: 'id', label: 'ORDER ID', width: 100 },
  { key: 'table', label: 'TABLE', width: 40 },
  { key: 'guest', label: 'GUEST', width: 108 },
  { key: 'status', label: 'STATUS', width: 62 },
  { key: 'amount', label: 'AMOUNT', width: 76, align: 'right' },
  { key: 'balance', label: 'BALANCE', width: 77, align: 'right' },
];

// The statuses ledgerModel.getDaySummary counts as revenue.
const BILLABLE = new Set(['CONFIRMED', 'READY', 'COMPLETED']);

const STATUS_LABEL = {
  CONFIRMED: 'In kitchen',
  READY: 'Ready',
  COMPLETED: 'Served',
  CANCELLED: 'Cancelled',
  PENDING: 'Pending',
};

function drawRow(doc, x, y, cells, { bold = false, color = INK, size = 9 } = {}) {
  doc.font(bold ? FONT_BOLD : FONT).fontSize(size).fillColor(color);
  let cx = x;
  for (const col of COLUMNS) {
    doc.text(String(cells[col.key] ?? ''), cx, y, {
      width: col.width - 6,
      align: col.align || 'left',
      lineBreak: false,
      ellipsis: true,
    });
    cx += col.width;
  }
}

function drawTableHeader(doc, x, y) {
  doc.rect(x - 4, y - 4, 515, 18).fill('#f3f5ef');
  const labels = {};
  for (const col of COLUMNS) labels[col.key] = col.label;
  drawRow(doc, x, y, labels, { bold: true, color: FAINT, size: 7.5 });
  return y + 18;
}

/**
 * A bank-statement style PDF of a single trading day: every order as a line item
 * with a running balance, voided orders shown but not counted.
 * Returns a PDFDocument the caller pipes to the response.
 */
function buildDayStatement({ date, summary, orders, restaurantName = "Vijay's FOOD POLITICS" }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  doc.registerFont(FONT, FONT_FILES[FONT]);
  doc.registerFont(FONT_BOLD, FONT_FILES[FONT_BOLD]);
  const x = 40;

  // Oldest first — a statement reads forwards.
  const rows = [...orders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  // Must match ledgerModel.getDaySummary exactly, or the closing balance would
  // disagree with the "total collected" figure printed above it.
  const countsTowardBalance = (o) => BILLABLE.has(o.status);
  const voided = rows.filter((o) => !countsTowardBalance(o));
  const counted = rows.filter(countsTowardBalance);
  const tables = new Set(rows.map((o) => o.sessionId)).size;

  // ---- header -------------------------------------------------------------
  doc.font(FONT_BOLD).fontSize(17).fillColor(INK).text(restaurantName, x, 44);
  doc.font(FONT).fontSize(9).fillColor(CHILI).text('DAILY SALES STATEMENT', x, 66);

  doc.font(FONT).fontSize(8.5).fillColor(FAINT);
  doc.text(`Generated ${new Date().toLocaleString('en-IN')}`, x, 48, { width: 515, align: 'right' });
  doc.text(`Statement for ${longDate(date)}`, x, 62, { width: 515, align: 'right' });

  doc.moveTo(x, 86).lineTo(x + 515, 86).strokeColor(RULE).lineWidth(1).stroke();

  // ---- summary ------------------------------------------------------------
  let y = 102;
  doc.rect(x, y, 515, 66).fillAndStroke('#fdfdfb', RULE);

  const cells = [
    ['Total collected', money(summary.totalRevenue), true],
    ['Of which tax (CGST+SGST)', money(summary.totalTax), false],
    ['Orders billed', String(counted.length), false],
    ['Orders cancelled', String(voided.length), false],
    ['Tables served', String(tables), false],
  ];

  let cx = x + 14;
  const colWidth = 487 / cells.length;
  for (const [label, value, highlight] of cells) {
    doc.font(FONT).fontSize(7).fillColor(FAINT).text(label.toUpperCase(), cx, y + 14, {
      width: colWidth - 8,
      lineBreak: false,
      ellipsis: true,
    });
    doc
      .font(FONT_BOLD)
      .fontSize(highlight ? 13 : 11)
      .fillColor(highlight ? CHILI : INK)
      .text(value, cx, y + 30, { width: colWidth - 8, lineBreak: false });
    cx += colWidth;
  }

  y += 88;

  // ---- transactions -------------------------------------------------------
  doc.font(FONT_BOLD).fontSize(8).fillColor(SOFT).text('TRANSACTIONS', x, y);
  y += 16;
  y = drawTableHeader(doc, x, y);

  let balance = 0;
  if (rows.length === 0) {
    doc.font(FONT).fontSize(9).fillColor(FAINT);
    doc.text('No orders were taken on this day.', x, y + 6);
    y += 24;
  }

  for (const order of rows) {
    if (y > 760) {
      doc.addPage();
      y = 50;
      y = drawTableHeader(doc, x, y);
    }

    const isVoid = !countsTowardBalance(order);
    if (!isVoid) balance += Number(order.grandTotal);

    drawRow(
      doc,
      x,
      y,
      {
        time: clock(order.createdAt),
        id: order.id,
        table: String(order.tableId),
        guest: order.customerName,
        status: STATUS_LABEL[order.status] || order.status,
        amount: isVoid ? `(${money(order.grandTotal)})` : money(order.grandTotal),
        balance: isVoid ? '—' : money(balance),
      },
      { color: isVoid ? FAINT : INK }
    );

    y += 15;
    doc.moveTo(x - 4, y - 3).lineTo(x + 511, y - 3).strokeColor('#eef0e9').lineWidth(0.5).stroke();
  }

  // ---- closing balance ----------------------------------------------------
  if (y > 720) {
    doc.addPage();
    y = 50;
  }
  y += 8;
  doc.rect(x + 275, y, 240, 30).fillAndStroke('#fdf4f0', CHILI);
  doc.font(FONT_BOLD).fontSize(8).fillColor(SOFT).text('CLOSING BALANCE', x + 287, y + 6);
  doc.font(FONT_BOLD).fontSize(13).fillColor(CHILI).text(money(balance), x + 287, y + 6, {
    width: 216,
    align: 'right',
  });
  y += 50;

  // ---- category breakdown -------------------------------------------------
  const byCategory = summary.breakdown?.byCategory || [];
  if (byCategory.length > 0) {
    if (y > 640) {
      doc.addPage();
      y = 50;
    }
    doc.font(FONT_BOLD).fontSize(8).fillColor(SOFT).text('SALES BY CATEGORY', x, y);
    y += 16;

    doc.rect(x - 4, y - 4, 515, 18).fill('#f3f5ef');
    doc.font(FONT_BOLD).fontSize(7.5).fillColor(FAINT);
    doc.text('CATEGORY', x, y, { width: 300, lineBreak: false });
    doc.text('QTY SOLD', x + 300, y, { width: 100, align: 'right', lineBreak: false });
    doc.text('REVENUE', x + 400, y, { width: 111, align: 'right', lineBreak: false });
    y += 18;

    for (const cat of byCategory) {
      if (y > 770) {
        doc.addPage();
        y = 50;
      }
      doc.font(FONT).fontSize(9).fillColor(INK);
      doc.text(cat.category, x, y, { width: 300, lineBreak: false, ellipsis: true });
      doc.text(String(cat.quantity), x + 300, y, { width: 100, align: 'right', lineBreak: false });
      doc.text(money(cat.revenue), x + 400, y, { width: 111, align: 'right', lineBreak: false });
      y += 15;
      doc.moveTo(x - 4, y - 3).lineTo(x + 511, y - 3).strokeColor('#eef0e9').lineWidth(0.5).stroke();
    }
  }

  // ---- footers ------------------------------------------------------------
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    // Writing below the bottom margin makes PDFKit spill onto a fresh page, so the
    // margin is lifted for the footer line only.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font(FONT).fontSize(7.5).fillColor(FAINT);
    doc.text(
      `${restaurantName} · Statement for ${date} · Page ${i + 1} of ${range.count}`,
      x,
      doc.page.height - 46,
      { width: 515, align: 'center', lineBreak: false }
    );
    doc.page.margins.bottom = bottom;
  }

  return doc;
}

module.exports = { buildDayStatement };
