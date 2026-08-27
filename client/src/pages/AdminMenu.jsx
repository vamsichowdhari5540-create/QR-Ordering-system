import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import Spinner from '../components/Spinner.jsx';
import { roleHome } from '../roleHome.js';

function money(n) {
  return `₹${Number(n).toFixed(0)}`;
}

export default function AdminMenu() {
  const navigate = useNavigate();
  const [token] = useState(() => localStorage.getItem('fp_admin_token'));
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const { categories } = await api.getFullMenu(token);
      setCategories(categories);
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
  }, [token, load, navigate]);

  async function toggle(item) {
    setBusyId(item.id);
    try {
      await api.setItemAvailability(token, item.id, !item.available);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  function logout() {
    localStorage.removeItem('fp_admin_token');
    navigate('/admin');
  }

  if (!categories) {
    return (
      <div className="admin-shell center-note">
        {error || (
          <>
            <Spinner />
            Loading today's menu…
          </>
        )}
      </div>
    );
  }

  const outCount = categories.reduce(
    (n, c) => n + c.items.filter((i) => !i.available).length,
    0
  );

  const q = search.trim().toLowerCase();
  const visibleCategories = q
    ? categories
        .map((c) => ({ ...c, items: c.items.filter((i) => i.name.toLowerCase().includes(q)) }))
        .filter((c) => c.items.length > 0)
    : categories;
  const matchCount = q ? visibleCategories.reduce((n, c) => n + c.items.length, 0) : null;

  return (
    <div className="admin-shell wide">
      <div className="admin-topbar">
        <div className="admin-brand-group">
          <h1>Today's Menu</h1>
          <span className="live-pill">Live</span>
        </div>
        <div className="admin-topbar-right">
          <input
            className="admin-search"
            type="text"
            placeholder="Search item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Link to="/admin/dashboard" className="topbar-link">
            Dashboard
          </Link>
          <button className="topbar-link signout" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>

      <p className="menu-sub">
        Everything here is on the menu by default. Mark an item unavailable when you run out —
        customers stop seeing it immediately, and it comes back on its own tomorrow.
        {outCount > 0 && ` ${outCount} item${outCount > 1 ? 's are' : ' is'} unavailable today.`}
        {q && ` ${matchCount} item${matchCount === 1 ? '' : 's'} match "${search.trim()}".`}
      </p>

      {error && <div className="error-banner">{error}</div>}

      {q && visibleCategories.length === 0 && (
        <div className="empty-note">No items match "{search.trim()}".</div>
      )}

      {visibleCategories.map((category) => (
        <div className="menu-category" key={category.id}>
          <div className="menu-category-title">{category.name}</div>
          <div className="menu-item-list">
            {category.items.map((item) => (
              <div className={`menu-item-row ${item.available ? '' : 'out'}`} key={item.id}>
                <div className="menu-item-info">
                  <div className="menu-item-name">{item.name}</div>
                  <div className="menu-item-price">{money(item.basePrice)}</div>
                </div>
                <button
                  className={`avail-toggle ${item.available ? 'available' : 'unavailable'}`}
                  disabled={busyId === item.id}
                  onClick={() => toggle(item)}
                >
                  {busyId === item.id
                    ? '…'
                    : item.available
                      ? 'Mark unavailable'
                      : 'Unavailable today · tap to restore'}
                </button>
              </div>
            ))}
            {category.items.length === 0 && (
              <div className="empty-note">No items in this category.</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
