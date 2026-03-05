/**
 * Simple in-memory rate limiter
 * Production-ready for single-instance deployments
 */

const limits = new Map();

function rateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  // Get or create entry
  let entry = limits.get(key);
  if (!entry) {
    entry = { requests: [] };
    limits.set(key, entry);
  }
  
  // Remove old requests outside window
  entry.requests = entry.requests.filter(t => t > windowStart);
  
  // Check limit
  if (entry.requests.length >= maxRequests) {
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.requests[0] + windowMs - now) / 1000)
    };
  }
  
  // Add this request
  entry.requests.push(now);
  
  return { allowed: true, remaining: maxRequests - entry.requests.length };
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour
  for (const [key, entry] of limits) {
    if (entry.requests.every(t => t < cutoff)) {
      limits.delete(key);
    }
  }
}, 5 * 60 * 1000);

module.exports = { rateLimit };
