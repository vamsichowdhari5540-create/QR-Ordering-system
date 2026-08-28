const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts, try again later' },
});

const orderCreateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many orders from this device, slow down' },
});

// The client already enforces a cooldown after a successful call — this just
// stops one phone from flooding the floor with false alarms.
const callServerLimiter = rateLimit({
  windowMs: 2 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Already called — the server has been notified' },
});

// The order-status page polls this every 4s while open (~75 req/5min for one
// genuine customer) — generous headroom above that, since the access token
// is the real defense here; this just blocks a fast enumeration/brute-force sweep.
const orderLookupLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, slow down' },
});

module.exports = { loginLimiter, orderCreateLimiter, callServerLimiter, orderLookupLimiter };
