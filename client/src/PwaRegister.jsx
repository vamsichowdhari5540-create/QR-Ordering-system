import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
// A static import so Vite's plugin can resolve the virtual module reliably —
// importing this only pulls in the registerSW function, it doesn't register
// anything by itself. The actual registration below is what's gated by route.
import { registerSW } from 'virtual:pwa-register';

const STAFF_PREFIXES = ['/admin', '/server', '/kitchen'];
let registered = false;

// Only ever registers the service worker once a staff route is actually
// visited — a customer's phone only ever hits /t/:tableId, so it never
// registers the SW and never sees an install prompt for this app.
export default function PwaRegister() {
  const location = useLocation();

  useEffect(() => {
    if (registered) return;
    if (!STAFF_PREFIXES.some((p) => location.pathname.startsWith(p))) return;

    registered = true;
    registerSW({ immediate: true });
  }, [location.pathname]);

  return null;
}
