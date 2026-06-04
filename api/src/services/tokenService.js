const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-min-32-chars';
const CREATOR_EXPIRY = process.env.JWT_CREATOR_EXPIRY || '8h';
const REVIEWER_EXPIRY = process.env.JWT_REVIEWER_EXPIRY || '4h';

/**
 * Generate a Creator JWT token
 */
function generateCreatorToken(creatorId, email) {
  return jwt.sign(
    {
      sub: creatorId,
      email,
      role: 'creator',
      scopes: ['sessions:*', 'images:*', 'reports:read'],
    },
    JWT_SECRET,
    { expiresIn: CREATOR_EXPIRY }
  );
}

/**
 * Generate a Reviewer JWT token (scoped to a single session)
 */
function generateReviewerToken(sessionId, reviewerName, reviewerEmail = null) {
  return jwt.sign(
    {
      sessionId,
      reviewerName,
      reviewerEmail,
      role: 'reviewer',
      scopes: [`sessions:review:${sessionId}`],
    },
    JWT_SECRET,
    { expiresIn: REVIEWER_EXPIRY }
  );
}

function generateReviewerAccountToken(reviewerId, email, name) {
  return jwt.sign(
    {
      sub: reviewerId,
      email,
      name,
      role: 'reviewerAccount',
      scopes: ['reviewer:sessions:read', 'reviewer:sessions:claim'],
    },
    JWT_SECRET,
    { expiresIn: CREATOR_EXPIRY }
  );
}

/**
 * Verify and decode a JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Extract token from Authorization header
 */
function extractToken(request) {
  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return null;
}

module.exports = {
  generateCreatorToken,
  generateReviewerToken,
  generateReviewerAccountToken,
  verifyToken,
  extractToken,
};
