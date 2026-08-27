const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const srcPath = path.join(__dirname, 'logo-source.png');
const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

// The logo itself is used exactly as supplied — no redraw, no recolor, no
// crop. It just isn't quite square (1299x1211), so it's padded to a square
// canvas with its own background color sampled from a corner pixel, which is
// invisible padding, not an edit to the artwork.
const BG = { r: 250, g: 186, b: 8 };

async function squared() {
  const { width, height } = await sharp(srcPath).metadata();
  const size = Math.max(width, height);
  return sharp(srcPath)
    .resize(size, size, { fit: 'contain', background: BG })
    .toBuffer();
}

// Maskable icons are cropped hard into a circle/squircle by Android — unlike
// the regular icons, this one needs the unchanged logo shrunk (uniformly,
// same aspect ratio) inside extra padding so that crop doesn't eat into
// "FOOD", "Politics", or the splash accents at the edges.
async function maskable(square) {
  const inset = await sharp(square).resize(760, 760, { fit: 'contain', background: BG }).toBuffer();
  return sharp(inset).extend({ top: 126, bottom: 126, left: 126, right: 126, background: BG }).toBuffer();
}

(async () => {
  const square = await squared();
  const maskableSquare = await maskable(square);

  const targets = [
    { file: 'icon-192.png', size: 192, src: square },
    { file: 'icon-512.png', size: 512, src: square },
    { file: 'maskable-192.png', size: 192, src: maskableSquare },
    { file: 'maskable-512.png', size: 512, src: maskableSquare },
    { file: 'apple-touch-icon.png', size: 180, src: square },
  ];

  for (const t of targets) {
    await sharp(t.src).resize(t.size, t.size).png().toFile(path.join(outDir, t.file));
    console.log('wrote', t.file);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
