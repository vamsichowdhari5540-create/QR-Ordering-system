// v1: no physical printer connection from the cloud backend. This renders the
// KOT as a formatted 40-column preview (matching 80mm thermal output) and
// queues the same content as a print_jobs row for the local print-agent.
const WIDTH = 40;

function center(text) {
  const pad = Math.max(0, Math.floor((WIDTH - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function line(char = '-') {
  return char.repeat(WIDTH);
}

function renderKot(order) {
  const rows = [];
  rows.push(center(`ORDER #${order.id}`));
  rows.push(center(`TABLE: ${order.tableId}`));
  rows.push(center(new Date(order.createdAt).toLocaleTimeString('en-IN')));
  rows.push(line());
  rows.push('ITEMS');
  rows.push('');

  for (const item of order.items) {
    rows.push(`${item.quantity}x ${item.itemName}${item.variantName ? ` (${item.variantName})` : ''}`);
    const mods = Array.isArray(item.selectedModifiers) ? item.selectedModifiers : [];
    if (mods.length) rows.push(`   > ${mods.join(', ')}`);
    if (item.specialNotes) rows.push(`   NOTE: ${item.specialNotes}`);
  }

  rows.push(line());
  rows.push(center('PLEASE PREPARE'));
  return rows.join('\n');
}

function buildKotPayload(order) {
  return {
    orderId: order.id,
    tableId: order.tableId,
    createdAt: order.createdAt,
    items: order.items.map((i) => ({
      quantity: i.quantity,
      itemName: i.itemName,
      variantName: i.variantName,
      selectedModifiers: i.selectedModifiers,
      specialNotes: i.specialNotes,
    })),
    preview: renderKot(order),
  };
}

module.exports = { renderKot, buildKotPayload };
