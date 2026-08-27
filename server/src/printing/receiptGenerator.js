const WIDTH = 40;

function center(text) {
  const pad = Math.max(0, Math.floor((WIDTH - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function rightAlign(text) {
  const pad = Math.max(0, WIDTH - text.length);
  return ' '.repeat(pad) + text;
}

function line(char = '-') {
  return char.repeat(WIDTH);
}

function money(n) {
  return `₹${Number(n).toFixed(2)}`;
}

function renderReceipt(order, customerMobile) {
  const rows = [];
  rows.push(center("VIJAY'S FOOD POLITICS"));
  rows.push(center('Thummalapenta Rd, Kavali, AP'));
  rows.push(center(`GSTIN: ${process.env.GSTIN || 'N/A'}`));
  rows.push('');
  rows.push(`ORDER ID: ${order.id}`);
  rows.push(`TABLE: ${order.tableId}`);
  rows.push(`NAME: ${order.customerName}`);
  rows.push(`MOBILE: ${customerMobile}`);
  rows.push(`DATE: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`);
  rows.push(`TIME: ${new Date(order.createdAt).toLocaleTimeString('en-IN')}`);
  rows.push(line());
  rows.push('Qty  Item                  Price   Total');

  for (const item of order.items) {
    const name = `${item.itemName}${item.variantName ? ` (${item.variantName})` : ''}`.slice(0, 20);
    rows.push(
      `${String(item.quantity).padEnd(4)} ${name.padEnd(21)} ${String(item.itemPrice).padStart(6)} ${String(item.itemTotal).padStart(7)}`
    );
  }

  rows.push(line());
  rows.push(rightAlign(`Subtotal: ${money(order.subtotal)}`));
  rows.push(rightAlign(`CGST: ${money(order.cgstAmount)}`));
  rows.push(rightAlign(`SGST: ${money(order.sgstAmount)}`));
  rows.push(rightAlign(`Total: ${money(order.grandTotal)}`));
  rows.push('');
  rows.push(center('Payment: Cash on collection'));
  rows.push('');
  rows.push(center('Thank you!'));
  rows.push(center('Please visit again'));
  return rows.join('\n');
}

function buildReceiptPayload(order, customerMobile) {
  return {
    orderId: order.id,
    tableId: order.tableId,
    customerName: order.customerName,
    customerMobile,
    items: order.items,
    subtotal: order.subtotal,
    cgstAmount: order.cgstAmount,
    sgstAmount: order.sgstAmount,
    taxTotal: order.taxTotal,
    grandTotal: order.grandTotal,
    createdAt: order.createdAt,
    preview: renderReceipt(order, customerMobile),
  };
}

module.exports = { renderReceipt, buildReceiptPayload, WIDTH, center, rightAlign, line, money };
