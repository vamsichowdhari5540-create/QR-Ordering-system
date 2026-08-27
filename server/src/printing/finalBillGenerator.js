const { center, rightAlign, line, money } = require('./receiptGenerator');

// Consolidates every order placed under one table session (a customer can order
// multiple rounds before paying) into a single printable bill.
function renderFinalBill(session, orders, customerMobile) {
  const rows = [];
  rows.push(center("VIJAY'S FOOD POLITICS"));
  rows.push(center('Thummalapenta Rd, Kavali, AP'));
  rows.push(center(`GSTIN: ${process.env.GSTIN || 'N/A'}`));
  rows.push('');
  rows.push(center('FINAL BILL'));
  rows.push(`TABLE: ${session.tableId}`);
  rows.push(`MOBILE: ${customerMobile}`);
  rows.push(`ROUNDS: ${orders.length}`);
  rows.push(`DATE: ${new Date().toLocaleDateString('en-IN')}`);

  let subtotal = 0;
  let cgst = 0;
  let sgst = 0;

  for (const order of orders) {
    rows.push(line());
    rows.push(`${order.id} — ${new Date(order.createdAt).toLocaleTimeString('en-IN')}`);
    rows.push('Qty  Item                  Price   Total');
    for (const item of order.items) {
      const name = `${item.itemName}${item.variantName ? ` (${item.variantName})` : ''}`.slice(0, 20);
      rows.push(
        `${String(item.quantity).padEnd(4)} ${name.padEnd(21)} ${String(item.itemPrice).padStart(6)} ${String(item.itemTotal).padStart(7)}`
      );
    }
    subtotal += Number(order.subtotal);
    cgst += Number(order.cgstAmount);
    sgst += Number(order.sgstAmount);
  }

  const grandTotal = subtotal + cgst + sgst;

  rows.push(line());
  rows.push(rightAlign(`Subtotal: ${money(subtotal)}`));
  rows.push(rightAlign(`CGST: ${money(cgst)}`));
  rows.push(rightAlign(`SGST: ${money(sgst)}`));
  rows.push(rightAlign(`Grand Total: ${money(grandTotal)}`));
  rows.push('');
  rows.push(center('Thank you!'));
  rows.push(center('Please visit again'));
  return rows.join('\n');
}

function buildFinalBillPayload(session, orders, customerMobile) {
  const subtotal = orders.reduce((sum, o) => sum + Number(o.subtotal), 0);
  const cgstAmount = orders.reduce((sum, o) => sum + Number(o.cgstAmount), 0);
  const sgstAmount = orders.reduce((sum, o) => sum + Number(o.sgstAmount), 0);

  return {
    sessionId: session.id,
    tableId: session.tableId,
    customerMobile,
    orderIds: orders.map((o) => o.id),
    orders: orders.map((o) => ({
      id: o.id,
      createdAt: o.createdAt,
      items: o.items,
      subtotal: o.subtotal,
      grandTotal: o.grandTotal,
    })),
    subtotal,
    cgstAmount,
    sgstAmount,
    grandTotal: subtotal + cgstAmount + sgstAmount,
    preview: renderFinalBill(session, orders, customerMobile),
  };
}

module.exports = { renderFinalBill, buildFinalBillPayload };
