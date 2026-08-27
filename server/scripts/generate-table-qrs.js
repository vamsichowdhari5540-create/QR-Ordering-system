// Generates one QR code PNG per table, pointing at the live customer
// ordering page for that table, plus a single printable HTML sheet with
// all of them laid out for cutting/laminating.
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const BASE_URL = process.env.QR_BASE_URL || 'https://qr-ordering-system-psi.vercel.app';
const TOTAL_TABLES = Number(process.env.TOTAL_TABLES || 15);

const outDir = path.join(__dirname, '..', 'table-qrcodes');
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const cards = [];

  for (let table = 1; table <= TOTAL_TABLES; table += 1) {
    const url = `${BASE_URL}/t/${table}`;
    const file = path.join(outDir, `table-${table}.png`);
    await QRCode.toFile(file, url, {
      width: 600,
      margin: 2,
      color: { dark: '#1f241f', light: '#ffffff' },
    });
    const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 2 });
    cards.push({ table, url, dataUrl });
    console.log(`Table ${table}: ${file}`);
  }

  const sheetPath = path.join(outDir, 'print-sheet.html');
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Vijay's Food Politics — Table QR Codes</title>
<style>
  @page { size: A4; margin: 10mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; background: #fff; }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6mm;
  }
  .card {
    border: 2px dashed #ccc;
    border-radius: 10px;
    padding: 8mm;
    text-align: center;
    page-break-inside: avoid;
  }
  .card img { width: 100%; max-width: 220px; height: auto; }
  .card h2 { margin: 4px 0 2px; font-size: 20px; color: #1f241f; }
  .card p { margin: 0; font-size: 11px; color: #666; word-break: break-all; }
  .brand { text-align: center; margin-bottom: 6mm; }
  .brand h1 { margin: 0; font-size: 22px; color: #1f241f; }
  .brand p { margin: 2px 0 0; color: #666; font-size: 12px; }
</style>
</head>
<body>
  <div class="brand">
    <h1>Vijay's Food Politics</h1>
    <p>Scan to view the menu &amp; order — one code per table</p>
  </div>
  <div class="grid">
    ${cards
      .map(
        (c) => `<div class="card">
      <img src="${c.dataUrl}" alt="Table ${c.table} QR code">
      <h2>Table ${c.table}</h2>
      <p>${c.url}</p>
    </div>`
      )
      .join('\n    ')}
  </div>
</body>
</html>`;

  fs.writeFileSync(sheetPath, html, 'utf8');
  console.log(`\nPrint sheet: ${sheetPath}`);
})();
