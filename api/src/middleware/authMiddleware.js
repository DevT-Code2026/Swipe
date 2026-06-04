const { verifyToken, extractToken } = require('../services/tokenService');

/**
 * Middleware: Require a valid Creator JWT
 */
function requireCreator(request) {
  const token = extractToken(request);
  if (!token) {
    return { status: 401, body: JSON.stringify({ error: 'Authentication required' }) };
  }

  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== 'creator') {
    return { status: 403, body: JSON.stringify({ error: 'Creator access required' }) };
  }

  return { valid: true, creator: decoded };
}

/**
 * Middleware: Require a valid Reviewer JWT scoped to a specific session
 */
function requireReviewer(request, sessionId) {
  const token = extractToken(request);
  if (!token) {
    return { status: 401, body: JSON.stringify({ error: 'Authentication required' }) };
  }

  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== 'reviewer') {
    return { status: 403, body: JSON.stringify({ error: 'Reviewer access required' }) };
  }

  if (decoded.sessionId !== sessionId) {
    return { status: 403, body: JSON.stringify({ error: 'Token not valid for this session' }) };
  }

  return { valid: true, reviewer: decoded };
}

/**
 * Middleware: Require either Creator or Reviewer JWT
 */
function requireAuth(request) {
  const token = extractToken(request);
  if (!token) {
    return { status: 401, body: JSON.stringify({ error: 'Authentication required' }) };
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return { status: 401, body: JSON.stringify({ error: 'Invalid or expired token' }) };
  }

  return { valid: true, user: decoded };
}

/**
 * Standard JSON response helper
 */
function jsonResponse(status, body) {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

module.exports = { requireCreator, requireReviewer, requireAuth, jsonResponse };
