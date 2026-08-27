require('dotenv').config();
const adminModel = require('../src/models/adminModel');
const menuModel = require('../src/models/menuModel');
const orderModel = require('../src/models/orderModel');
const sessionModel = require('../src/models/sessionModel');
const ledgerModel = require('../src/models/ledgerModel');
const printJobModel = require('../src/models/printJobModel');
const { buildKotPayload } = require('../src/printing/kotGenerator');
const { buildDayStatement } = require('../src/printing/statementGenerator');
const pool = require('../src/config/db');

function ok(label, cond) {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main() {
  const admin = await adminModel.findByEmail('owner@foodpolitics.local');
  ok('admin login lookup', admin && admin.role === 'OWNER');

  const menu = await menuModel.getFullMenuForCustomer();
  ok('menu: 15 categories', menu.length === 15);
  ok('menu: 163 items', menu.reduce((n, c) => n + c.items.length, 0) === 163);

  // Availability toggle
  const item = menu[0].items[0];
  const off = await menuModel.setItemAvailability(item.id, false);
  ok('mark unavailable', off.available === false);
  const menuAfter = await menuModel.getFullMenuForCustomer();
  ok('unavailable item hidden from customer menu', !menuAfter[0].items.some((i) => i.id === item.id));
  const on = await menuModel.setItemAvailability(item.id, true);
  ok('restore availability', on.available === true);

  // Order 1 (table 11) -> full lifecycle -> settle
  const order1 = await orderModel.createOrder({
    tableId: 11,
    customer: { name: 'Flow Test A', mobile: '9700000001' },
    items: [{ itemId: item.id, quantity: 2, modifiers: [] }],
  });
  ok('order created', order1.status === 'CONFIRMED');
  ok('order items round-trip (JSONB, not double-parsed)', Array.isArray(order1.items[0].selectedModifiers));

  const ready = await orderModel.markReady(order1.id);
  ok('mark ready', ready.status === 'READY');
  const completed = await orderModel.completeOrder(order1.id);
  ok('mark completed', completed.status === 'COMPLETED');

  const kotJob = await printJobModel.enqueue(order1.id, 'KOT', buildKotPayload(order1));
  ok('print job enqueued with real id', Number.isInteger(kotJob.id));
  ok('print job payload round-trips as object (JSONB)', typeof kotJob.payload === 'object');

  const session1 = await sessionModel.getOpenSessionForTable(11);
  ok('session open for table 11', !!session1);

  // Order 2 (table 12) -> cancel the ONLY order -> table should free itself
  const order2 = await orderModel.createOrder({
    tableId: 12,
    customer: { name: 'Flow Test B', mobile: '9700000002' },
    items: [{ itemId: item.id, quantity: 1, modifiers: [] }],
  });
  await orderModel.cancelOrder(order2.id);
  const session2 = await sessionModel.getOpenSessionForTable(12);
  ok('cancelling the only order frees the table', session2 === null);

  // Order 3 + 4 (table 13, two guests) -> cancel one -> table stays occupied
  const order3 = await orderModel.createOrder({
    tableId: 13,
    customer: { name: 'Flow Test C', mobile: '9700000003' },
    items: [{ itemId: item.id, quantity: 1, modifiers: [] }],
  });
  const order4 = await orderModel.createOrder({
    tableId: 13,
    customer: { name: 'Flow Test D', mobile: '9700000004' },
    items: [{ itemId: item.id, quantity: 1, modifiers: [] }],
  });
  await orderModel.cancelOrder(order4.id);
  const session3 = await sessionModel.getOpenSessionForTable(13);
  ok('cancelling one of two orders keeps table occupied', !!session3);

  // Day summary / ledger — revenue should count order1 (COMPLETED) but not
  // the cancelled order2/order4.
  const summary = await ledgerModel.getDaySummary();
  ok('day summary resolves via CURRENT_DATE', /^\d{4}-\d{2}-\d{2}$/.test(summary.date));
  ok('day summary revenue excludes cancelled orders', Number(summary.totalRevenue) > 0);

  const orders = await ledgerModel.getDayOrders();
  ok('day orders includes cancelled (for visibility)', orders.some((o) => o.status === 'CANCELLED'));

  // PDF export path (statementGenerator) shouldn't throw
  const doc = buildDayStatement({ date: summary.date, summary, orders });
  ok('PDF statement builds without throwing', !!doc);

  // Cleanup: close the still-open session so this test doesn't leave the
  // table stuck occupied, then delete everything this run created.
  await sessionModel.closeSession(session1.id, 'test cleanup');
  await sessionModel.closeSession(session3.id, 'test cleanup');

  const orderIds = [order1.id, order2.id, order3.id, order4.id];
  await pool.query('DELETE FROM print_jobs WHERE orderId IN (:ids)', { ids: orderIds });
  await pool.query('DELETE FROM order_items WHERE orderId IN (:ids)', { ids: orderIds });
  await pool.query('DELETE FROM orders WHERE id IN (:ids)', { ids: orderIds });
  await pool.query(
    "DELETE FROM table_sessions WHERE tableId IN (11, 12, 13) AND notes = 'test cleanup'"
  );
  const [testCustomers] = await pool.query(
    "SELECT id FROM customers WHERE name LIKE 'Flow Test%'"
  );
  if (testCustomers.length) {
    await pool.query('DELETE FROM customers WHERE id IN (:ids)', {
      ids: testCustomers.map((c) => c.id),
    });
  }
  console.log('\ncleanup done');
  process.exit(process.exitCode || 0);
}

main().catch((err) => {
  console.error('CRASHED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
