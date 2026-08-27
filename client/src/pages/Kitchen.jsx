import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Spinner from '../components/Spinner.jsx';
import { useInstallPrompt } from '../useInstallPrompt.js';

function elapsedMinutes(createdAt) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function urgency(minutes) {
  if (minutes >= 10) return 'urgent';
  if (minutes >= 5) return 'warn';
  return 'fresh';
}

function OrderTicket({ order, onReady, busy }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  const minutes = elapsedMinutes(order.createdAt);

  return (
    <div className={`kt-card ${urgency(minutes)}`}>
      <div className="kt-head">
        <span className="kt-table">{order.id}</span>
        <span className="kt-time">{minutes < 1 ? 'just now' : `${minutes} min`}</span>
      </div>

      <div className="kt-items">
        {order.items.map((item) => (
          <div className="kt-item" key={item.id}>
            <div className="kt-item-main">
              <span className="kt-qty">{item.quantity}×</span>
              <span className="kt-name">
                {item.itemName}
                {item.variantName ? ` (${item.variantName})` : ''}
              </span>
            </div>
            {item.selectedModifiers?.length > 0 && (
              <div className="kt-mods">{item.selectedModifiers.join(', ')}</div>
            )}
            {item.specialNotes && <div className="kt-note">{item.specialNotes}</div>}
          </div>
        ))}
      </div>

      <button className="kt-ready-btn" disabled={busy} onClick={() => onReady(order.id)}>
        {busy ? (
          <Spinner />
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {busy ? 'Completing…' : 'Complete'}
      </button>
    </div>
  );
}

function KitchenLogin({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, admin } = await api.adminLogin(email.trim(), password);
      localStorage.setItem('fp_admin_token', token);
      localStorage.setItem('fp_admin_role', admin.role);
      onSignedIn(token);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="kt-shell">
      <div className="kt-signin">
        <h1>Kitchen display</h1>
        <p>Sign in once on this tablet — it'll stay signed in.</p>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={submit}>
          <div className="field-group">
            <span className="label">Email</span>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="kitchen@foodpolitics.local"
              autoFocus
            />
          </div>
          <div className="field-group">
            <span className="label">Password</span>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button className="primary-btn" disabled={loading} type="submit">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function Kitchen() {
  const [token, setToken] = useState(() => localStorage.getItem('fp_admin_token'));
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const { canInstall, promptInstall } = useInstallPrompt();

  const load = useCallback(async () => {
    try {
      const { orders } = await api.kitchenQueue(token);
      setOrders(orders);
      setError('');
    } catch (e) {
      setError(e.message);
      if (/unauthorized|invalid/i.test(e.message)) {
        localStorage.removeItem('fp_admin_token');
        localStorage.removeItem('fp_admin_role');
        setToken(null);
      }
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [token, load]);

  if (!token) {
    return <KitchenLogin onSignedIn={setToken} />;
  }

  function logout() {
    localStorage.removeItem('fp_admin_token');
    localStorage.removeItem('fp_admin_role');
    setToken(null);
  }

  async function markReady(orderId) {
    setBusyId(orderId);
    try {
      await api.markOrderReady(token, orderId);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="kt-shell">
      <div className="kt-header">
        <div className="kt-brand">Vijay's Food Politics — Kitchen</div>
        <div className="kt-header-right">
          <div className="kt-count">
            {orders ? `${orders.length} order${orders.length === 1 ? '' : 's'} to prepare` : ''}
          </div>
          {canInstall && (
            <button className="kt-signout" onClick={promptInstall}>
              Install app
            </button>
          )}
          <button className="kt-signout" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>

      {error && <div className="error-banner" style={{ margin: '0 1.5rem 1rem' }}>{error}</div>}

      {orders === null ? (
        <div className="kt-empty">
          <Spinner dark />
        </div>
      ) : orders.length === 0 ? (
        <div className="kt-empty">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true" style={{ display: 'block', margin: '0 auto 1rem' }}>
            <circle cx="20" cy="20" r="18" stroke="#3f6b4a" strokeWidth="2" opacity="0.5" />
            <path d="M12 20.5L17 25.5L28 14.5" stroke="#3f6b4a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Kitchen's clear — no orders waiting.
        </div>
      ) : (
        <div className="kt-grid">
          {orders.map((order) => (
            <OrderTicket key={order.id} order={order} onReady={markReady} busy={busyId === order.id} />
          ))}
        </div>
      )}
    </div>
  );
}
