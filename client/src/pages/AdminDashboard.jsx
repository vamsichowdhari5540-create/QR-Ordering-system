import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import Spinner from '../components/Spinner.jsx';
import { roleHome } from '../roleHome.js';
import { useInstallPrompt } from '../useInstallPrompt.js';
import { useBackGuard } from '../hooks/useBackGuard.js';

function money(n) {
  return `₹${Number(n).toFixed(2)}`;
}

function elapsed(since) {
  const mins = Math.floor((Date.now() - new Date(since).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function tableBadge(orders) {
  // A session can exist with zero orders — a guest tapped "Call server"
  // before ordering anything, which lazily opens the table the same way a
  // first order would.
  if (orders.length === 0) return { label: 'Needs attention', tone: 'calling' };
  if (orders.some((o) => o.status === 'CONFIRMED')) return { label: 'Preparing', tone: 'preparing' };
  if (orders.some((o) => o.status === 'READY')) return { label: 'Ready to serve', tone: 'ready' };
  return { label: 'Awaiting bill', tone: 'awaiting' };
}

function TableCard({ session, orders, onOpen }) {
  const badge = tableBadge(orders);
  const total = Number(session.totalAmount) + Number(session.totalTax);
  const latestGuest = orders[orders.length - 1]?.customerName;
  const calling = !!session.callRequestedAt;

  return (
    <button className={`tcard ${calling ? 'calling' : ''}`} onClick={() => onOpen(session)}>
      {calling && <span className="tcard-call-dot">🔔 Calling</span>}
      <div className="tcard-head">
        <span className="tcard-num">Table {session.tableId}</span>
        <span className={`tcard-badge ${badge.tone}`}>{badge.label}</span>
      </div>
      <div className="tcard-guest">{latestGuest || 'All items served'}</div>
      <div className="tcard-meta">
        <span className="tcard-time">{elapsed(session.openedAt)}</span>
        <span className="tcard-total">{money(total)}</span>
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

function LedgerPanel({ session, token, onClose, onChanged }) {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);
  // session is captured once at open time, so this local flag is what
  // actually hides the banner the moment staff acknowledges — the next poll
  // (up to 5s later) will confirm it server-side.
  const [callAcked, setCallAcked] = useState(false);

  async function acknowledgeCall() {
    setBusy('ack-call');
    try {
      await api.acknowledgeCall(token, session.id);
      setCallAcked(true);
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const load = useCallback(async () => {
    try {
      const { orders: sessionOrders } = await api.getSession(session.id);
      const full = await Promise.all(sessionOrders.map((o) => api.getOrderDetail(token, o.id)));
      // Cancelled orders are off the bill — they must not reach the ledger or its totals.
      setOrders(full.map((r) => r.order).filter((o) => o.status !== 'CANCELLED'));
    } catch (e) {
      setError(e.message);
    }
  }, [session.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function withBusy(key, fn) {
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

  // Group by customer record, not the typed name — two guests can type the same
  // name, and a repeat order under a slightly different spelling must still land
  // on the same running bill as their earlier round. First appearance order, so
  // the display name is whatever they typed on their oldest order, and the panel
  // doesn't reshuffle as it reloads.
  const guestGroups = useMemo(() => {
    if (!orders) return [];
    const byCustomer = new Map();
    for (const order of orders) {
      if (!byCustomer.has(order.customerId)) byCustomer.set(order.customerId, []);
      byCustomer.get(order.customerId).push(order);
    }
    return [...byCustomer.entries()].map(([customerId, guestOrders]) => {
      const subtotal = guestOrders.reduce((s, o) => s + Number(o.subtotal), 0);
      const tax = guestOrders.reduce((s, o) => s + Number(o.taxTotal), 0);
      return {
        customerId,
        customerName: guestOrders[0].customerName,
        orders: guestOrders,
        subtotal,
        tax,
        grandTotal: subtotal + tax,
        allServed: guestOrders.every((o) => o.status === 'COMPLETED'),
        allPaid: guestOrders.every((o) => o.paidAt),
      };
    });
  }, [orders]);

  const totals = useMemo(() => {
    if (!orders) return null;
    const subtotal = orders.reduce((s, o) => s + Number(o.subtotal), 0);
    const tax = orders.reduce((s, o) => s + Number(o.taxTotal), 0);
    return { subtotal, tax, grandTotal: subtotal + tax };
  }, [orders]);

  return (
    <div className="ledger-overlay" onClick={onClose}>
      <div className="ledger-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ledger-head">
          <div>
            <h2>Table {session.tableId} Ledger</h2>
            {orders && (
              <p className="ledger-sub">
                {guestGroups.length > 1
                  ? `${guestGroups.length} guests at this table`
                  : `Guest: ${guestGroups[0]?.customerName || 'walk-in'}`}{' '}
                · Session: {session.id.slice(-10)}
              </p>
            )}
          </div>
          <button className="ledger-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {session.callRequestedAt && !callAcked && (
          <div className="ledger-call-banner">
            <span>🔔 This table asked for the server</span>
            <button disabled={busy === 'ack-call'} onClick={acknowledgeCall}>
              {busy === 'ack-call' ? 'Acknowledging…' : 'Acknowledge'}
            </button>
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}
        {!orders && !error && (
          <div className="empty-note" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Spinner />
            Loading ledger…
          </div>
        )}

        {orders && (
          <>
            {guestGroups.map((group) => (
              <div className="ledger-guest-block" key={group.customerId}>
                <div className="ledger-section-title guest">
                  <span>{group.customerName}</span>
                  {group.allPaid && <span className="ledger-guest-paid">Paid</span>}
                </div>

                <div className="ledger-orders">
                  {group.orders.map((order) => (
                    <div className="ledger-order-group" key={order.id}>
                      {order.items.map((item) => (
                        <div className="ledger-item" key={item.id}>
                          <div>
                            <div className="ledger-item-name">
                              {item.itemName} × {item.quantity}
                            </div>
                            {(item.variantName || item.selectedModifiers?.length > 0) && (
                              <div className="ledger-item-sub">
                                {[item.variantName, ...(item.selectedModifiers || [])].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </div>
                          <div className="ledger-item-price">{money(item.itemTotal)}</div>
                        </div>
                      ))}
                      {order.status !== 'COMPLETED' && (
                        <div className="ledger-order-actions">
                          <span className="ledger-order-tag">
                            {order.id} · {order.status === 'READY' ? 'Ready' : 'Preparing'}
                          </span>
                          <button
                            className="chip-btn"
                            disabled={busy === `kot-${order.id}`}
                            onClick={() => withBusy(`kot-${order.id}`, () => api.printKot(token, order.id))}
                          >
                            {order.kotPrintedAt ? 'Reprint ticket' : 'Print ticket'}
                          </button>
                          <button
                            className="chip-btn done"
                            disabled={busy === `served-${order.id}`}
                            onClick={() => withBusy(`served-${order.id}`, () => api.completeOrder(token, order.id))}
                          >
                            Served
                          </button>
                          {confirmCancel === order.id ? (
                            <button
                              className="chip-btn danger"
                              disabled={busy === `cancel-${order.id}`}
                              onClick={() => withBusy(`cancel-${order.id}`, () => api.cancelOrder(token, order.id))}
                            >
                              {busy === `cancel-${order.id}` ? 'Cancelling…' : 'Confirm cancel'}
                            </button>
                          ) : (
                            <button className="chip-btn danger" onClick={() => setConfirmCancel(order.id)}>
                              Cancel
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

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

            {guestGroups.length > 1 && (
              <div className="ledger-totals">
                <div className="ledger-total-row grand">
                  <span>Table total (all guests)</span>
                  <span>{money(totals.grandTotal)}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [token] = useState(() => localStorage.getItem('fp_admin_token'));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [openSession, setOpenSession] = useState(null);
  const { canInstall, promptInstall } = useInstallPrompt();

  const openSessionRef = useRef(null);
  openSessionRef.current = openSession;
  const { showExitWarning } = useBackGuard({
    isOverlayOpenRef: openSessionRef,
    closeOverlay: () => setOpenSession(null),
  });

  const load = useCallback(async () => {
    try {
      const dash = await api.adminDashboard(token);
      setData(dash);
      setError('');
    } catch (e) {
      setError(e.message);
      if (/unauthorized|invalid/i.test(e.message)) {
        localStorage.removeItem('fp_admin_token');
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
    if (role && role !== 'OWNER') {
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
            Loading dashboard…
          </>
        )}
      </div>
    );
  }

  const cookingCount = data.pendingOrders.filter((o) => o.status === 'CONFIRMED').length;

  const sessionByTable = new Map(data.activeSessions.map((s) => [s.tableId, s]));
  const occupiedCount = Array.from({ length: data.totalTables }, (_, i) => i + 1).filter((id) =>
    sessionByTable.has(id)
  ).length;
  const q = search.trim().toLowerCase();

  const tables = Array.from({ length: data.totalTables }, (_, i) => i + 1)
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
          <h1>Vijay's Food Politics</h1>
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
          <Link to="/admin/history" className="topbar-link">
            Day book
          </Link>
          <Link to="/admin/menu" className="topbar-link">
            Today's menu
          </Link>
          <Link to="/kitchen" className="topbar-link">
            Kitchen display
          </Link>
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
        <Link to="/admin/history" className="statbar-item link">
          <span className="statbar-label">Today's revenue</span>
          <span className="statbar-value">{money(data.dayRevenue)}</span>
          <span className="statbar-hint">View day book →</span>
        </Link>
      </div>

      {openSession && (
        <LedgerPanel
          session={openSession}
          token={token}
          onClose={() => setOpenSession(null)}
          onChanged={load}
        />
      )}

      {showExitWarning && <div className="exit-toast">Press back again to exit</div>}
    </div>
  );
}
