import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Spinner from '../components/Spinner.jsx';
import { roleHome } from '../roleHome.js';
import { useInstallPrompt } from '../useInstallPrompt.js';

function money(n) {
  return `₹${Number(n).toFixed(2)}`;
}

function elapsed(since) {
  const mins = Math.floor((Date.now() - new Date(since).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

// On the floor, "ready" outranks "preparing" — that's the table you walk to next.
function tableBadge(orders) {
  if (orders.some((o) => o.status === 'READY')) return { label: 'Ready to serve', tone: 'ready' };
  if (orders.some((o) => o.status === 'CONFIRMED')) return { label: 'In kitchen', tone: 'preparing' };
  return { label: 'All served', tone: 'awaiting' };
}

function TableCard({ session, orders, onOpen }) {
  const badge = tableBadge(orders);
  const readyCount = orders.filter((o) => o.status === 'READY').length;
  const guest = orders[orders.length - 1]?.customerName;

  return (
    <button className={`tcard ${badge.tone === 'ready' ? 'calls' : ''}`} onClick={() => onOpen(session)}>
      <div className="tcard-head">
        <span className="tcard-num">Table {session.tableId}</span>
        <span className={`tcard-badge ${badge.tone}`}>{badge.label}</span>
      </div>
      <div className="tcard-guest">{guest || 'Nothing pending'}</div>
      <div className="tcard-meta">
        <span className="tcard-time">{elapsed(session.openedAt)}</span>
        <span className="tcard-count">
          {readyCount > 0
            ? `${readyCount} to pick up`
            : `${orders.length} order${orders.length === 1 ? '' : 's'}`}
        </span>
      </div>
    </button>
  );
}

function FreeTableCard({ tableId }) {
  return (
    <div className="tcard free">
      <div className="tcard-head">
        <span className="tcard-num">Table {tableId}</span>
        <span className="tcard-badge free">Free</span>
      </div>
      <div className="tcard-guest">Waiting for a scan</div>
    </div>
  );
}

const STATUS_TAG = {
  CONFIRMED: 'In kitchen',
  READY: 'Ready at pass',
  COMPLETED: 'Served',
};

function ServePanel({ session, token, onClose, onChanged }) {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);

  const load = useCallback(async () => {
    try {
      const { orders: sessionOrders } = await api.getSession(session.id);
      const full = await Promise.all(sessionOrders.map((o) => api.getOrder(o.id)));
      setOrders(full.map((r) => r.order));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [session.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(key, fn) {
    setBusy(key);
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
      setConfirmCancel(null);
    }
  }

  async function settleGuest(customerId) {
    setBusy(`settle-${customerId}`);
    try {
      const { tableClosed } = await api.settleGuest(token, session.id, customerId);
      onChanged();
      if (tableClosed) {
        onClose();
      } else {
        await load();
        setBusy(null);
      }
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  }

  // Cancelled orders are off the bill entirely — the session total already excludes them.
  const live = orders?.filter((o) => o.status !== 'CANCELLED') || [];
  const totals = live.reduce(
    (acc, o) => ({
      subtotal: acc.subtotal + Number(o.subtotal),
      tax: acc.tax + Number(o.taxTotal),
    }),
    { subtotal: 0, tax: 0 }
  );

  // Group by customer record, not the typed name — two guests can type the same
  // name, and a repeat order under a slightly different spelling must still land
  // on the same running bill as their earlier round. First-appearance order, so
  // the panel doesn't reshuffle as it reloads.
  const guestGroups = [];
  const byCustomer = new Map();
  for (const order of live) {
    if (!byCustomer.has(order.customerId)) {
      const group = { customerId: order.customerId, customerName: order.customerName, orders: [] };
      byCustomer.set(order.customerId, group);
      guestGroups.push(group);
    }
    byCustomer.get(order.customerId).orders.push(order);
  }
  for (const group of guestGroups) {
    group.grandTotal = group.orders.reduce((s, o) => s + Number(o.grandTotal), 0);
    group.allServed = group.orders.every((o) => o.status === 'COMPLETED');
    group.allPaid = group.orders.every((o) => o.paidAt);
  }

  return (
    <div className="ledger-overlay" onClick={onClose}>
      <div className="ledger-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ledger-head">
          <div>
            <h2>Table {session.tableId}</h2>
            <p className="ledger-sub">Open since {elapsed(session.openedAt)}</p>
          </div>
          <button className="ledger-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {!orders && !error && (
          <div className="empty-note" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Spinner />
            Loading table…
          </div>
        )}

        {orders && live.length === 0 && (
          <div className="empty-note">Nothing on this table — every order was cancelled.</div>
        )}

        {guestGroups.map((group) => (
          <div className="ledger-guest-block" key={group.customerId}>
            <div className="ledger-section-title guest">
              <span>{group.customerName}</span>
              {group.allPaid && <span className="ledger-guest-paid">Paid</span>}
            </div>

            {group.orders.map((order) => (
              <div
                className={`srv-order ${order.status === 'READY' ? 'ready' : ''} ${
                  order.status === 'COMPLETED' ? 'done' : ''
                }`}
                key={order.id}
              >
                <div className="srv-order-head">
                  <span className="srv-order-guest">{order.id}</span>
                  <span
                    className={`srv-order-status ${order.status === 'READY' ? 'ready' : ''} ${
                      order.status === 'COMPLETED' ? 'done' : ''
                    }`}
                  >
                    {STATUS_TAG[order.status] || order.status}
                  </span>
                </div>

                <div className="srv-items">
                  {order.items.map((item) => (
                    <div className="srv-item" key={item.id}>
                      <span className="srv-qty">{item.quantity}×</span>
                      <div>
                        <div className="srv-name">
                          {item.itemName}
                          {item.variantName ? ` (${item.variantName})` : ''}
                        </div>
                        {item.selectedModifiers?.length > 0 && (
                          <div className="srv-sub">{item.selectedModifiers.join(', ')}</div>
                        )}
                        {item.specialNotes && <div className="srv-note">{item.specialNotes}</div>}
                      </div>
                    </div>
                  ))}
                </div>

                {order.status !== 'COMPLETED' && (
                  <div className="srv-actions">
                    <button
                      className="srv-serve-btn"
                      disabled={busy === `serve-${order.id}` || order.status !== 'READY'}
                      onClick={() => act(`serve-${order.id}`, () => api.completeOrder(token, order.id))}
                    >
                      {busy === `serve-${order.id}`
                        ? 'Marking served…'
                        : order.status === 'READY'
                        ? 'Mark served'
                        : 'Waiting on kitchen'}
                    </button>

                    {confirmCancel === order.id ? (
                      <button
                        className="srv-cancel-btn confirm"
                        disabled={busy === `cancel-${order.id}`}
                        onClick={() => act(`cancel-${order.id}`, () => api.cancelOrder(token, order.id))}
                      >
                        {busy === `cancel-${order.id}` ? 'Cancelling…' : 'Tap again to confirm'}
                      </button>
                    ) : (
                      <button className="srv-cancel-btn" onClick={() => setConfirmCancel(order.id)}>
                        Cancel order
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            <div className="ledger-totals guest">
              <div className="ledger-total-row grand">
                <span>{group.customerName}'s total</span>
                <span>{money(group.grandTotal)}</span>
              </div>
            </div>

            {!group.allPaid && (
              <button
                className="ledger-settle-btn"
                disabled={busy === `settle-${group.customerId}` || !group.allServed}
                onClick={() => settleGuest(group.customerId)}
              >
                {busy === `settle-${group.customerId}`
                  ? 'Settling…'
                  : !group.allServed
                  ? 'Still being served'
                  : `Paid — settle ${group.customerName}`}
              </button>
            )}
          </div>
        ))}

        {orders && guestGroups.length > 1 && (
          <div className="ledger-totals">
            <div className="ledger-total-row grand">
              <span>Table total (all guests)</span>
              <span>{money(totals.subtotal + totals.tax)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ServerDashboard() {
  const navigate = useNavigate();
  const [token] = useState(() => localStorage.getItem('fp_admin_token'));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [openSession, setOpenSession] = useState(null);
  const { canInstall, promptInstall } = useInstallPrompt();

  const load = useCallback(async () => {
    try {
      const dash = await api.adminDashboard(token);
      setData(dash);
      setError('');
    } catch (e) {
      setError(e.message);
      if (/unauthorized|invalid/i.test(e.message)) {
        localStorage.removeItem('fp_admin_token');
        localStorage.removeItem('fp_admin_role');
        navigate('/admin');
      }
    }
  }, [token, navigate]);

  useEffect(() => {
    if (!token) {
      navigate('/admin');
      return;
    }
    const role = localStorage.getItem('fp_admin_role');
    if (role === 'KITCHEN') {
      navigate(roleHome(role), { replace: true });
      return;
    }
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [token, load, navigate]);

  function logout() {
    localStorage.removeItem('fp_admin_token');
    localStorage.removeItem('fp_admin_role');
    navigate('/admin');
  }

  if (!data) {
    return (
      <div className="admin-shell center-note">
        {error || (
          <>
            <Spinner />
            Loading floor…
          </>
        )}
      </div>
    );
  }

  const sessionByTable = new Map(data.activeSessions.map((s) => [s.tableId, s]));
  const tableIds = Array.from({ length: data.totalTables }, (_, i) => i + 1);
  const occupiedCount = tableIds.filter((id) => sessionByTable.has(id)).length;
  const cookingCount = data.pendingOrders.filter((o) => o.status === 'CONFIRMED').length;
  const readyCount = data.pendingOrders.filter((o) => o.status === 'READY').length;
  const q = search.trim().toLowerCase();

  const tables = tableIds
    .map((tableId) => {
      const session = sessionByTable.get(tableId);
      const orders = session ? data.pendingOrders.filter((o) => o.sessionId === session.id) : [];
      return { tableId, session, orders };
    })
    .filter(({ tableId, orders }) => {
      if (!q) return true;
      if (String(tableId).includes(q)) return true;
      return orders.some((o) => o.customerName.toLowerCase().includes(q));
    });

  return (
    <div className="admin-shell wide">
      <div className="admin-topbar">
        <div className="admin-brand-group">
          <h1>Vijay's Food Politics — Floor</h1>
          <span className="live-pill">Live</span>
        </div>
        <div className="admin-topbar-right">
          <input
            className="admin-search"
            type="text"
            placeholder="Search table or guest…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {canInstall && (
            <button className="topbar-link" onClick={promptInstall}>
              Install app
            </button>
          )}
          <button className="topbar-link signout" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {tables.length === 0 && <div className="empty-note">No tables match.</div>}

      <div className="tcard-grid">
        {tables.map(({ tableId, session, orders }) =>
          session ? (
            <TableCard key={session.id} session={session} orders={orders} onOpen={setOpenSession} />
          ) : (
            <FreeTableCard key={`free-${tableId}`} tableId={tableId} />
          )
        )}
      </div>

      <div className="admin-statbar">
        <div className="statbar-item">
          <span className="statbar-label">Occupied</span>
          <span className="statbar-value">
            {occupiedCount} / {data.totalTables}
          </span>
        </div>
        <div className="statbar-item">
          <span className="statbar-label">Active KOTs</span>
          <span className="statbar-value">{cookingCount}</span>
        </div>
        <div className="statbar-item">
          <span className="statbar-label">Ready to serve</span>
          <span className="statbar-value">{readyCount}</span>
        </div>
      </div>

      {openSession && (
        <ServePanel
          session={openSession}
          token={token}
          onClose={() => setOpenSession(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
