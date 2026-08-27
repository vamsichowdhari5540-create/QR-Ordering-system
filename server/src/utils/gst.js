const CGST_RATE = () => parseFloat(process.env.CGST_RATE || '2.5');
const SGST_RATE = () => parseFloat(process.env.SGST_RATE || '2.5');

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// GST is always computed server-side from DB prices — never trust a client total.
function calculateGst(subtotal) {
  const cgstAmount = round2((subtotal * CGST_RATE()) / 100);
  const sgstAmount = round2((subtotal * SGST_RATE()) / 100);
  const taxTotal = round2(cgstAmount + sgstAmount);
  const grandTotal = round2(subtotal + taxTotal);
  return { cgstAmount, sgstAmount, taxTotal, grandTotal };
}

module.exports = { calculateGst, round2 };
