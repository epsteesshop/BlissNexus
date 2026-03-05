/**
 * Input sanitization middleware
 */

// Sanitize strings to prevent XSS
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Recursively sanitize object
function sanitizeObject(obj) {
  if (typeof obj === 'string') return sanitizeString(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (obj && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[sanitizeString(key)] = sanitizeObject(value);
    }
    return sanitized;
  }
  return obj;
}

// Middleware
function sanitizeMiddleware(req, res, next) {
  // Skip sanitization for base64 data fields (attachments)
  if (req.body && typeof req.body === 'object') {
    const dataField = req.body.data;
    req.body = sanitizeObject(req.body);
    // Restore base64 data field if it was present
    if (dataField) req.body.data = dataField;
  }
  next();
}

// Validate Solana address format
function isValidSolanaAddress(address) {
  if (!address || typeof address !== 'string') return false;
  // Base58 characters only, 32-44 chars
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

// Validate task input
function validateTaskInput(task) {
  const errors = [];
  
  if (!task.title || task.title.length < 3) {
    errors.push('Title must be at least 3 characters');
  }
  if (!task.description || task.description.length < 10) {
    errors.push('Description must be at least 10 characters');
  }
  if (task.maxBudget && (isNaN(task.maxBudget) || task.maxBudget <= 0)) {
    errors.push('Budget must be a positive number');
  }
  if (task.requester && !isValidSolanaAddress(task.requester)) {
    errors.push('Invalid requester wallet address');
  }
  
  return errors;
}

module.exports = { 
  sanitizeMiddleware, 
  sanitizeString, 
  sanitizeObject,
  isValidSolanaAddress,
  validateTaskInput
};
