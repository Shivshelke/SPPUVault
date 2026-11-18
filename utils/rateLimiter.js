/**
 * utils/rateLimiter.js
 * Cloudflare Workers & Node.js compatible in-memory rate limiter.
 * Avoids setInterval() in global scope which is disallowed in Cloudflare Workers.
 */
function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 100, message = 'Too many requests' } = {}) {
  const store = new Map();

  return function rateLimiterMiddleware(req, res, next) {
    const ip = (req.headers && req.headers['cf-connecting-ip']) ||
               (req.headers && req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].split(',')[0].trim()) ||
               req.ip ||
               'unknown';

    const now = Date.now();
    const clientData = store.get(ip);

    if (!clientData || now > clientData.resetTime) {
      store.set(ip, { count: 1, resetTime: now + windowMs });
      // Occasional lazy cleanup without using background setInterval timers
      if (store.size > 2000) {
        for (const [k, v] of store.entries()) {
          if (now > v.resetTime) store.delete(k);
        }
      }
      return next();
    }

    clientData.count++;
    if (clientData.count > max) {
      const payload = typeof message === 'string' ? { error: message } : message;
      return res.status(429).json(payload);
    }

    next();
  };
}

module.exports = createRateLimiter;
