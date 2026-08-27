import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles.css';
import Menu from './pages/Menu.jsx';
import OrderStatus from './pages/OrderStatus.jsx';
import AdminLogin from './pages/AdminLogin.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AdminMenu from './pages/AdminMenu.jsx';
import AdminHistory from './pages/AdminHistory.jsx';
import Kitchen from './pages/Kitchen.jsx';
import ServerDashboard from './pages/ServerDashboard.jsx';
import PwaRegister from './PwaRegister.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <PwaRegister />
      <Routes>
        <Route path="/" element={<Navigate to="/t/1" replace />} />
        <Route path="/t/:tableId" element={<Menu />} />
        <Route path="/order/:orderId" element={<OrderStatus />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/menu" element={<AdminMenu />} />
        <Route path="/admin/history" element={<AdminHistory />} />
        <Route path="/kitchen" element={<Kitchen />} />
        <Route path="/server" element={<ServerDashboard />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
