import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Nothing is auto-registered/prompted — App.jsx only calls the register
      // hook on staff routes, so a customer scanning a table QR never sees an
      // install banner.
      injectRegister: null,
      registerType: 'autoUpdate',
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: "Vijay's Food Politics — Staff",
        short_name: 'FP Staff',
        description: 'Owner, floor server and kitchen tools for Vijay\'s Food Politics.',
        start_url: '/admin',
        scope: '/',
        display: 'standalone',
        background_color: '#f3f5ef',
        theme_color: '#1f241f',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell only. Every /api/* call must hit the network —
        // this app is a live restaurant floor; a cached table or order list is
        // wrong data, not a convenience.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
