import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import Spinner from '../components/Spinner.jsx';

function money(n) {
  return `₹${Number(n).toFixed(0)}`;
}

function ItemConfigSheet({ item, onClose, onAdd }) {
  const [variantId, setVariantId] = useState(item.variants?.[0]?.id ?? null);
  const [selectedByGroup, setSelectedByGroup] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [specialNotes, setSpecialNotes] = useState('');

  const variant = item.variants?.find((v) => v.id === variantId);
  const flatSelected = Object.values(selectedByGroup).flat();

  const unitPrice = useMemo(() => {
    let price = Number(item.basePrice) + Number(variant?.priceModifier || 0);
    for (const group of item.modifiers || []) {
      for (const opt of group.options) {
        if (flatSelected.includes(opt.name)) price += Number(opt.priceModifier || 0);
      }
    }
    return price;
  }, [item, variant, flatSelected]);

  function toggleOption(group, option) {
    setSelectedByGroup((prev) => {
      const current = prev[group.id] || [];
      const isSelected = current.includes(option.name);
      if (group.type === 'RADIO') {
        return { ...prev, [group.id]: isSelected ? [] : [option.name] };
      }
      return {
        ...prev,
        [group.id]: isSelected ? current.filter((n) => n !== option.name) : [...current, option.name],
      };
    });
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{item.name}</h2>
        <p className="sheet-sub">{item.description}</p>

        {item.variants?.length > 0 && (
          <div className="field-group">
            <span className="label">Size</span>
            <div className="radio-pill">
              {item.variants.map((v) => (
                <button
                  key={v.id}
                  className={variantId === v.id ? 'selected' : ''}
                  onClick={() => setVariantId(v.id)}
                >
                  {v.name}
                  {v.priceModifier ? ` (+₹${v.priceModifier})` : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        {(item.modifiers || []).map((group) => (
          <div className="field-group" key={group.id}>
            <span className="label">
              {group.name} {group.type === 'RADIO' ? '· choose one' : '· choose any'}
            </span>
            <div className="radio-pill">
              {group.options.map((opt) => (
                <button
                  key={opt.id}
                  className={(selectedByGroup[group.id] || []).includes(opt.name) ? 'selected' : ''}
                  onClick={() => toggleOption(group, opt)}
                >
                  {opt.name}
                  {opt.priceModifier ? ` (+₹${opt.priceModifier})` : ''}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="field-group">
          <span className="label">Special instructions</span>
          <textarea
            rows={2}
            placeholder="e.g. less spicy, no onion"
            value={specialNotes}
            onChange={(e) => setSpecialNotes(e.target.value)}
          />
        </div>

        <div className="field-group">
          <span className="label">Quantity</span>
          <div className="stepper" style={{ width: 'fit-content' }}>
            <button onClick={() => setQuantity((q) => Math.max(1, q - 1))}>–</button>
            <span>{quantity}</span>
            <button onClick={() => setQuantity((q) => Math.min(20, q + 1))}>+</button>
          </div>
        </div>

        <button
          className="primary-btn"
          onClick={() =>
            onAdd({
              key: `${item.id}-${variantId}-${flatSelected.join(',')}-${Date.now()}`,
              itemId: item.id,
              itemName: item.name,
              variantId,
              variantName: variant?.name || null,
              modifiers: flatSelected,
              unitPrice,
              quantity,
              specialNotes,
            })
          }
        >
          Add {quantity} to cart · {money(unitPrice * quantity)}
        </button>
      </div>
    </div>
  );
}

function CartSheet({ cart, setCart, tableId, onClose, onOrderPlaced }) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

  const subtotal = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const cgst = subtotal * 0.025;
  const sgst = subtotal * 0.025;
  const total = subtotal + cgst + sgst;

  function updateQty(key, delta) {
    setCart((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  async function placeOrder() {
    setError('');
    if (!name.trim() || !/^\+?[1-9]\d{7,14}$/.test(mobile.trim())) {
      setError('Enter your name and a valid mobile number.');
      return;
    }
    if (cart.length === 0) {
      setError('Your cart is empty.');
      return;
    }
    setPlacing(true);
    try {
      const body = {
        tableId: Number(tableId),
        customer: { name: name.trim(), mobile: mobile.trim() },
        items: cart.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          variantId: l.variantId || undefined,
          modifiers: l.modifiers,
          specialNotes: l.specialNotes,
        })),
      };
      const { order } = await api.createOrder(body);
      onOrderPlaced(order.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Your order</h2>
        <p className="sheet-sub">Table {tableId}</p>

        {error && <div className="error-banner">{error}</div>}

        {cart.length === 0 && <div className="empty-note">Nothing in your cart yet.</div>}

        {cart.map((l) => (
          <div className="cart-line" key={l.key}>
            <div>
              <div className="cl-name">{l.itemName}</div>
              <div className="cl-meta">
                {l.variantName ? `${l.variantName} · ` : ''}
                {l.modifiers.length ? l.modifiers.join(', ') : ''}
              </div>
              <div className="stepper" style={{ marginTop: '0.4rem' }}>
                <button onClick={() => updateQty(l.key, -1)}>–</button>
                <span>{l.quantity}</span>
                <button onClick={() => updateQty(l.key, 1)}>+</button>
              </div>
            </div>
            <div className="cl-price">{money(l.unitPrice * l.quantity)}</div>
          </div>
        ))}

        {cart.length > 0 && (
          <>
            <div style={{ marginTop: '1rem' }}>
              <div className="summary-row">
                <span>Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>
              <div className="summary-row">
                <span>CGST + SGST (5%)</span>
                <span>{money(cgst + sgst)}</span>
              </div>
              <div className="summary-row total">
                <span>Total</span>
                <span>{money(total)}</span>
              </div>
            </div>

            <div className="field-group" style={{ marginTop: '1.1rem' }}>
              <span className="label">Your name</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            </div>
            <div className="field-group">
              <span className="label">Mobile number</span>
              <input
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="+91 9xxxxxxxxx"
              />
            </div>
            <p className="sheet-sub" style={{ marginTop: '0.3rem', marginBottom: 0 }}>
              Pay at the counter when your order arrives.
            </p>

            <button className="primary-btn" disabled={placing} onClick={placeOrder} style={{ marginTop: '1.1rem' }}>
              {placing ? 'Placing order…' : `Place order · ${money(total)}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function Menu() {
  const { tableId } = useParams();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [configItem, setConfigItem] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');

  // One fetch for the whole menu — tab switching is then instant (no round
  // trip per tab) and search can look across every category at once.
  useEffect(() => {
    api
      .getCustomerMenu()
      .then(({ categories }) => {
        setCategories(categories);
        if (categories.length) setActiveCategory(categories[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const query = search.trim().toLowerCase();
  const items = query
    ? categories.flatMap((c) =>
        c.items
          .filter((i) => i.name.toLowerCase().includes(query))
          .map((i) => ({ ...i, categoryName: c.name }))
      )
    : categories.find((c) => c.id === activeCategory)?.items || [];

  function addSimpleItem(item, delta) {
    setCart((prev) => {
      const key = `${item.id}-plain`;
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        const quantity = existing.quantity + delta;
        if (quantity <= 0) return prev.filter((l) => l.key !== key);
        return prev.map((l) => (l.key === key ? { ...l, quantity } : l));
      }
      if (delta <= 0) return prev;
      return [
        ...prev,
        {
          key,
          itemId: item.id,
          itemName: item.name,
          variantId: null,
          variantName: null,
          modifiers: [],
          unitPrice: Number(item.basePrice),
          quantity: 1,
          specialNotes: '',
        },
      ];
    });
  }

  function quantityOf(itemId) {
    const line = cart.find((l) => l.key === `${itemId}-plain`);
    return line ? line.quantity : 0;
  }

  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);
  const cartTotal = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) * 1.05;

  return (
    <div className="app-shell">
      <div className="brand-bar">
        <div className="brand">
          Vijay's <span>Food Politics</span>
        </div>
        <div className="table-tag">Table {tableId}</div>
      </div>

      {loading && (
        <div className="center-note">
          <Spinner />
          Loading menu…
        </div>
      )}
      {error && <div className="error-banner" style={{ margin: '1rem 1.25rem' }}>{error}</div>}

      {!loading && !error && (
        <>
          <div className="menu-search">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishes…"
            />
            {search && (
              <button className="menu-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
                ×
              </button>
            )}
          </div>

          {!query && (
            <div className="tabs">
              {categories.map((c) => (
                <button
                  key={c.id}
                  className={`tab ${activeCategory === c.id ? 'active' : ''}`}
                  onClick={() => setActiveCategory(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {query && (
            <div className="menu-search-meta">
              {items.length} result{items.length === 1 ? '' : 's'} for "{search.trim()}"
            </div>
          )}

          {query && items.length === 0 && (
            <div className="center-note">No dishes match "{search.trim()}".</div>
          )}

          <div className="item-list">
            {items.map((item) => {
              const hasOptions = item.variants?.length > 0 || item.modifiers?.length > 0;
              const qty = quantityOf(item.id);
              return (
                <div className={`item-card ${item.available ? '' : 'unavailable'}`} key={item.id}>
                  <div className="item-main">
                    {item.categoryName && <div className="item-category-tag">{item.categoryName}</div>}
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    <div className="price">{money(item.basePrice)}</div>
                  </div>
                  <div className="item-side">
                    {!item.available ? (
                      <span className="cl-meta">Sold out</span>
                    ) : hasOptions ? (
                      <button className="add-btn" onClick={() => setConfigItem(item)}>
                        Add
                      </button>
                    ) : qty === 0 ? (
                      <button className="add-btn" onClick={() => addSimpleItem(item, 1)}>
                        Add
                      </button>
                    ) : (
                      <div className="stepper">
                        <button onClick={() => addSimpleItem(item, -1)}>–</button>
                        <span>{qty}</span>
                        <button onClick={() => addSimpleItem(item, 1)}>+</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {cartCount > 0 && (
        <div className="cart-bar" onClick={() => setCartOpen(true)}>
          <div>
            <div className="count">{cartCount} item{cartCount > 1 ? 's' : ''}</div>
            <div className="total">{money(cartTotal)}</div>
          </div>
          <div className="view">View cart →</div>
        </div>
      )}

      {configItem && (
        <ItemConfigSheet
          item={configItem}
          onClose={() => setConfigItem(null)}
          onAdd={(line) => {
            setCart((prev) => [...prev, line]);
            setConfigItem(null);
          }}
        />
      )}

      {cartOpen && (
        <CartSheet
          cart={cart}
          setCart={setCart}
          tableId={tableId}
          onClose={() => setCartOpen(false)}
          onOrderPlaced={(orderId) => navigate(`/order/${orderId}`)}
        />
      )}
    </div>
  );
}
