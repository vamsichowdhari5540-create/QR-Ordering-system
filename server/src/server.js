const http = require('http');
const app = require('./app');
const { initSockets } = require('./sockets');

// Fail loudly at boot rather than crashing customers' first order with a
// generic 500 the moment a phone number needs hashing/encrypting.
const REQUIRED_ENV = ['JWT_SECRET', 'MOBILE_INDEX_KEY', 'ENCRYPTION_KEY'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) {
  console.error(`Missing required environment variable(s): ${missing.join(', ')}`);
  process.exit(1);
}
if (!/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY.trim())) {
  console.error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes) for AES-256-GCM.');
  process.exit(1);
}

const port = process.env.PORT || 4000;
const httpServer = http.createServer(app);

initSockets(httpServer);

httpServer.listen(port, () => {
  console.log(`Food Politics server listening on port ${port}`);
});
