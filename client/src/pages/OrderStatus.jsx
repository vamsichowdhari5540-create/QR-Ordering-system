import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import Spinner from '../components/Spinner.jsx';

function money(n) {
  return `₹${Number(n).toFixed(2)}`;
}

const STATUS_COPY = {
  PENDING: { label: 'Awaiting payment', tone: 'pending' },
  CONFIRMED: { label: 'Confirmed · being prepared', tone: 'confirmed' },
  COMPLETED: { label: 'Completed', tone: 'completed' },
};

export default function OrderStatus() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const { order } = await api.getOrder(orderId);
        if (!stop) setOrder(order);
      } catch (e) {
        if (!stop) setError(e.message);
      }
    }
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [orderId]);

  if (error) return <div className="status-page center-note">{error}</div>;
  if (!order)
    return (
      <div className="status-page center-note">
        <Spinner />
        Loading order…
      </div>
    );

  const status = STATUS_COPY[order.status] || { label: order.status, tone: 'pending' };

  return (
    <div className="status-page">
      <div className={`status-badge ${status.tone}`}>{status.label}</div>
      <h1>Thanks, {order.customerName.split(' ')[0]}!</h1>
      <div className="order-id">{order.id} · Table {order.tableId}</div>

      <div className="receipt-lines">
        {order.items.map((item) => (
          <div key={item.id} className="cart-line">
            <div>
              <div className="cl-name">
                {item.quantity}x {item.itemName}
                {item.variantName ? ` (${item.variantName})` : ''}
              </div>
              {item.selectedModifiers?.length > 0 && (
                <div className="cl-meta">{item.selectedModifiers.join(', ')}</div>
              )}
              {item.specialNotes && <div className="cl-meta">Note: {item.specialNotes}</div>}
            </div>
            <div className="cl-price">{money(item.itemTotal)}</div>
          </div>
        ))}

        <div className="summary-row" style={{ marginTop: '0.6rem' }}>
          <span>Subtotal</span>
          <span>{money(order.subtotal)}</span>
        </div>
        <div className="summary-row">
          <span>CGST + SGST</span>
          <span>{money(order.taxTotal)}</span>
        </div>
        <div className="summary-row total">
          <span>Total</span>
          <span>{money(order.grandTotal)}</span>
        </div>
        <div className="summary-row" style={{ marginTop: '0.4rem' }}>
          <span>Payment</span>
          <span>Cash at counter</span>
        </div>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <Link to={`/t/${order.tableId}`} className="secondary-btn" style={{ display: 'block', textDecoration: 'none' }}>
          Order more
        </Link>
      </div>
    </div>
  );
}
