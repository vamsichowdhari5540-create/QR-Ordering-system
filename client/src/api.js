// Set VITE_API_URL in production (Vercel/Netlify env var) to point at the
// deployed API — falls back to the local dev server otherwise.
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  getCustomerMenu: () => request('/api/menu/full'),
  createOrder: (body) => request('/api/orders', { method: 'POST', body: JSON.stringify(body) }),
  getOrder: (orderId) => request(`/api/orders/${orderId}`),
  getSession: (sessionId) => request(`/api/sessions/${sessionId}`),

  adminLogin: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  adminDashboard: (token) => request('/api/admin/dashboard', { headers: authHeader(token) }),
  printKot: (token, orderId) =>
    request(`/api/admin/print/kot/${orderId}`, { method: 'POST', headers: authHeader(token) }),
  printReceipt: (token, orderId) =>
    request(`/api/admin/print/receipt/${orderId}`, { method: 'POST', headers: authHeader(token) }),
  completeOrder: (token, orderId) =>
    request(`/api/admin/orders/${orderId}/complete`, { method: 'POST', headers: authHeader(token) }),
  cancelOrder: (token, orderId) =>
    request(`/api/admin/orders/${orderId}/cancel`, { method: 'POST', headers: authHeader(token) }),
  pendingPrintJobs: (token) => request('/api/admin/print-jobs/pending', { headers: authHeader(token) }),
  closeSession: (token, sessionId) =>
    request(`/api/admin/sessions/${sessionId}/close`, { method: 'POST', headers: authHeader(token) }),
  settleGuest: (token, sessionId, customerId) =>
    request(`/api/admin/sessions/${sessionId}/settle-guest`, {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ customerId }),
    }),
  completePrintJob: (token, id, status) =>
    request(`/api/admin/print-jobs/${id}/complete`, {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ status }),
    }),
  kitchenQueue: (token) => request('/api/admin/kitchen/orders', { headers: authHeader(token) }),
  markOrderReady: (token, orderId) =>
    request(`/api/admin/kitchen/orders/${orderId}/ready`, { method: 'POST', headers: authHeader(token) }),
  dayHistory: (token, date) =>
    request(`/api/admin/history${date ? `?date=${date}` : ''}`, { headers: authHeader(token) }),
  // The PDF endpoint needs the auth header, so a plain <a href> won't do — pull it
  // as a blob and hand the browser an object URL to save.
  downloadDayStatement: async (token, date) => {
    const res = await fetch(`${BASE}/api/admin/history/export?date=${date}`, {
      headers: authHeader(token),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Export failed (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `food-politics-statement-${date}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  getFullMenu: (token) => request('/api/admin/menu', { headers: authHeader(token) }),
  setItemAvailability: (token, itemId, available) =>
    request(`/api/admin/items/${itemId}/availability`, {
      method: 'PUT',
      headers: authHeader(token),
      body: JSON.stringify({ available }),
    }),
};

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}
