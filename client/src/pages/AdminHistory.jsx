import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import Spinner from '../components/Spinner.jsx';
import { roleHome } from '../roleHome.js';

function money(n) {
  return `₹${Number(n).toFixed(2)}`;
}

function clock(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ORDER_TAG = {
  CONFIRMED: 'In kitchen',
  READY: 'Ready',
  COMPLETED: 'Served',
  CANCELLED: 'Cancelled',
};

function Visit({ visit }) {
  const [open, setOpen] = useState(false);
  const live = visit.orders.filter((o) => o.status !== 'CANCELLED');
  const settled = visit.sessionStatus === 'CLOSED';

  return (
    <div className={`hist-visit ${open ? 'open' : ''}`}>
      <button className="hist-visit-head" onClick={() => setOpen((v) => !v)}>
        <span className="hist-table">Table {visit.tableId}</span>
        <span className="hist-guest">{visit.guest}</span>
        <span className="hist-time">
          {clock(visit.openedAt)}
          {visit.closedAt ? ` – ${clock(visit.closedAt)}` : ''}
        </span>
        <span className={`hist-state ${settled ? 'settled' : 'open'}`}>
          {settled ? 'Settled' : 'Still open'}
        </span>
        <span className="hist-count">
          {live.length} order{live.length === 1 ? '' : 's'}
        </span>
        <span className="hist-amount">{money(visit.total)}</span>
      </button>

      {open && (
        <div className="hist-orders">
          {visit.orders.map((o) => (
            <div className={`hist-order ${o.status === 'CANCELLED' ? 'void' : ''}`} key={o.id}>
              <span className="hist-order-id">{o.id}</span>
              <span className="hist-order-time">{clock(o.createdAt)}</span>
              <span className="hist-order-guest">{o.customerName}</span>
              <span className={`hist-order-tag ${o.status.toLowerCase()}`}>
                {ORDER_TAG[o.status] || o.status}
              </span>
              <span className="hist-order-amount">{money(o.grandTotal)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminHistory() {
  const navigate = useNavigate();
  const [token] = useState(() => localStorage.getItem('fp_admin_token'));
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setData(null);
    try {
      const res = await api.dayHistory(token, date);
      setData(res);
      setError('');
    } catch (e) {
      setError(e.message);
      if (/unauthorized|invalid/i.test(e.message)) {
        localStorage.removeItem('fp_admin_token');
        localStorage.removeItem('fp_admin_role');
        navigate('/admin');
      }
    }
  }, [token, date, navigate]);

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
  }, [token, load, navigate]);

  async function exportPdf() {
    setExporting(true);
    try {
      await api.downloadDayStatement(token, date);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }

  const isToday = date === todayStr();
  const summary = data?.summary;
  const topCategory = summary?.breakdown?.byCategory?.[0];

  return (
    <div className="admin-shell wide">
      <div className="admin-topbar">
        <div className="admin-brand-group">
          <h1>Day book</h1>
          {isToday && <span className="live-pill">Today</span>}
        </div>
        <div className="admin-topbar-right">
          <input
            className="admin-search"
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
          />
          <button className="export-btn" onClick={exportPdf} disabled={exporting || !data}>
            {exporting ? (
              <Spinner />
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M8 1.5v9m0 0L4.5 7M8 10.5L11.5 7M2 13.5h12"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {exporting ? 'Preparing…' : 'Export PDF'}
          </button>
          <Link to="/admin/dashboard" className="topbar-link">
            Tables
          </Link>
          <Link to="/admin/menu" className="topbar-link">
            Today's menu
          </Link>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!data && !error && (
        <div className="center-note">
          <Spinner />
          Loading the day…
        </div>
      )}

      {data && (
        <>
          <div className="hist-cards">
            <div className="hist-card money">
              <span className="hist-card-label">Total money of the day</span>
              <span className="hist-card-value">{money(summary.totalRevenue)}</span>
              <span className="hist-card-sub">incl. {money(summary.totalTax)} tax</span>
            </div>
            <div className="hist-card">
              <span className="hist-card-label">Orders taken</span>
              <span className="hist-card-value">{summary.totalOrders}</span>
              <span className="hist-card-sub">
                {data.cancelledCount > 0 ? `${data.cancelledCount} cancelled` : 'none cancelled'}
              </span>
            </div>
            <div className="hist-card">
              <span className="hist-card-label">Tables served</span>
              <span className="hist-card-value">{data.visits.length}</span>
              <span className="hist-card-sub">
                {data.visits.filter((v) => v.sessionStatus === 'OPEN').length} still open
              </span>
            </div>
            <div className="hist-card">
              <span className="hist-card-label">Best category</span>
              <span className="hist-card-value small">{topCategory ? topCategory.category : '—'}</span>
              <span className="hist-card-sub">
                {topCategory ? `${money(topCategory.revenue)} · ${topCategory.quantity} sold` : 'no sales yet'}
              </span>
            </div>
          </div>

          {summary.breakdown.byCategory.length > 0 && (
            <div className="hist-section">
              <div className="hist-section-title">Where the money came from</div>
              <div className="hist-bars">
                {summary.breakdown.byCategory.map((c) => (
                  <div className="hist-bar-row" key={c.category}>
                    <span className="hist-bar-name">{c.category}</span>
                    <div className="hist-bar-track">
                      <div
                        className="hist-bar-fill"
                        style={{
                          width: `${Math.max(
                            2,
                            (Number(c.revenue) / Number(topCategory.revenue)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="hist-bar-qty">{c.quantity}</span>
                    <span className="hist-bar-value">{money(c.revenue)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="hist-section">
            <div className="hist-section-title">
              Table history {isToday ? 'today' : `on ${date}`}
            </div>
            {data.visits.length === 0 ? (
              <div className="empty-note">No orders were taken on this day.</div>
            ) : (
              data.visits.map((v) => <Visit key={v.sessionId} visit={v} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}
