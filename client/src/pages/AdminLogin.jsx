import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { roleHome } from '../roleHome.js';

export default function AdminLogin() {
  const navigate = useNavigate();
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
      navigate(roleHome(admin.role));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-login">
      <h1>Staff login</h1>
      <p>Vijay's Food Politics — owner &amp; floor servers</p>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={submit}>
        <div className="field-group">
          <span className="label">Email</span>
          <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@foodpolitics.local" />
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
  );
}
