const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const { parse: parseUrl } = require('url');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const {
  generateCreatorToken,
  generateReviewerToken,
  generateReviewerAccountToken,
  verifyToken,
  extractToken: extractTokenSvc,
} = require('./api/src/services/tokenService');
const db = require('./api/src/services/database');
const storage = require('./api/src/services/storage');
const { generateExport } = require('./api/src/services/exportService');

const app = express();
const PORT = process.env.PORT || 8080;
const MAX_ACCOUNT_STORAGE_BYTES = 500 * 1024 * 1024;
const uploadTempDir = path.join(os.tmpdir(), 'creativeswipe-uploads');
fs.mkdirSync(uploadTempDir, { recursive: true });
const uploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadTempDir),
    filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname || '') || '.bin'}`),
  }),
  limits: {
    fileSize: MAX_ACCOUNT_STORAGE_BYTES,
  },
});
app.set('trust proxy', true);

// ── Middleware ──
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${new Date().toISOString()} | ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

app.use((req, res, next) => {
  const forwardedHost = req.headers['x-forwarded-host'];
  const originalHost = req.headers['x-original-host'];
  const directHost = req.headers.host;
  const candidate = [forwardedHost, originalHost, directHost, req.hostname].find(Boolean);
  const host = String(candidate || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .split(':')[0];

  if (host === 'www.giggidy.work') {
    const target = `https://giggidy.work${req.originalUrl || '/'}`;
    return res.redirect(301, target);
  }

  return next();
});

// ── Auth helpers ──
function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

function requireCreator(req) {
  const token = extractToken(req);
  if (!token) return { valid: false, status: 401, error: 'Authentication required' };
  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== 'creator')
    return { valid: false, status: 403, error: 'Creator access required' };
  return { valid: true, creator: decoded };
}

function requireReviewer(req, sessionId) {
  const token = extractToken(req);
  if (!token) return { valid: false, status: 401, error: 'Authentication required' };
  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== 'reviewer')
    return { valid: false, status: 403, error: 'Reviewer access required' };
  if (decoded.sessionId !== sessionId)
    return { valid: false, status: 403, error: 'Token not valid for this session' };
  return { valid: true, reviewer: decoded };
}

function requireReviewerAccount(req) {
  const token = extractToken(req);
  if (!token) return { valid: false, status: 401, error: 'Authentication required' };
  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== 'reviewerAccount') {
    return { valid: false, status: 403, error: 'Reviewer account access required' };
  }
  return { valid: true, reviewer: decoded };
}

function makeScopedId(prefix, source = '') {
  const slug = (source || 'default')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20) || 'default';
  return `${prefix}_${slug}_${uuidv4().slice(0, 8)}`;
}

function normalizeEmail(value = '') {
  return String(value || '').toLowerCase().trim();
}

function toReviewerContact(input = {}) {
  const email = normalizeEmail(input.email || input.reviewerEmail);
  const name = String(input.name || input.reviewerName || '').trim();
  if (!email) return null;
  return { email, name: name || email.split('@')[0] };
}

function mergeReviewerContacts(...lists) {
  const merged = new Map();
  lists.flat().forEach((item) => {
    const contact = toReviewerContact(item);
    if (!contact) return;
    if (!merged.has(contact.email)) {
      merged.set(contact.email, contact);
      return;
    }
    const existing = merged.get(contact.email);
    if (!existing.name && contact.name) {
      merged.set(contact.email, contact);
    }
  });
  return Array.from(merged.values());
}

async function getReviewerOrCreatorById(userId) {
  const reviewer = await db.getItem('reviewers', userId, userId);
  if (reviewer) {
    return {
      id: reviewer.id,
      email: reviewer.email,
      name: reviewer.name,
      source: 'reviewer',
      passwordHash: reviewer.passwordHash,
    };
  }

  const creator = await db.getItem('creators', userId, userId);
  if (creator) {
    return {
      id: creator.id,
      email: creator.email,
      name: creator.name,
      source: 'creator',
      passwordHash: creator.passwordHash,
    };
  }

  return null;
}

async function getReviewerOrCreatorByEmail(email) {
  const reviewer = await db.getReviewerByEmail(email);
  if (reviewer) {
    return {
      id: reviewer.id,
      email: reviewer.email,
      name: reviewer.name,
      source: 'reviewer',
      passwordHash: reviewer.passwordHash,
    };
  }

  const creator = await db.getCreatorByEmail(email);
  if (creator) {
    return {
      id: creator.id,
      email: creator.email,
      name: creator.name,
      source: 'creator',
      passwordHash: creator.passwordHash,
    };
  }

  return null;
}

async function getReviewerById(reviewerId) {
  return db.getItem('reviewers', reviewerId, reviewerId);
}

async function getCreatorStorageUsageBytes(creatorId) {
  const sessions = await db.getSessionsByCreator(creatorId);
  let total = 0;

  for (const session of sessions) {
    const images = await db.getImagesBySession(session.id);
    total += images.reduce((sum, image) => sum + (Number(image.fileSize) || 0), 0);
  }

  return total;
}

async function getCreatorCapabilities(creator) {
  if (!creator?.email) {
    return { hasReceiverAccess: false };
  }
  const reviewer = await db.getReviewerByEmail(creator.email.toLowerCase().trim());
  return { hasReceiverAccess: !!reviewer };
}

async function getReviewerCapabilities(reviewer) {
  if (!reviewer?.email) {
    return { hasSenderAccess: false };
  }
  const creator = await db.getCreatorByEmail(reviewer.email.toLowerCase().trim());
  return { hasSenderAccess: !!creator };
}

async function deleteSessionCascade(sessionId, creatorId) {
  const [images, submissions, assignments] = await Promise.all([
    db.getImagesBySession(sessionId),
    db.getSubmissionsBySession(sessionId),
    db.queryItems(
      'reviewerAssignments',
      'SELECT * FROM c WHERE c.sessionId = @sessionId',
      [{ name: '@sessionId', value: sessionId }]
    ),
  ]);

  await Promise.all([
    ...images.map(async (img) => {
      if (img.blobName) {
        await storage.deleteBlob(img.blobName);
      }
      return db.deleteItem('images', img.id, img.sessionId);
    }),
    ...submissions.map((sub) => db.deleteItem('submissions', sub.id, sub.sessionId)),
    ...assignments.map((item) => db.deleteItem('reviewerAssignments', item.id, item.reviewerId)),
    db.deleteItem('sessions', sessionId, creatorId),
  ]);

  return {
    sessionId,
    imageCount: images.length,
    submissionCount: submissions.length,
    assignmentCount: assignments.length,
  };
}

// ── Init ──
let initialized = false;
async function ensureInit() {
  if (!initialized) {
    await db.initDatabase();
    await storage.initStorage();
    initialized = true;
    console.log('✓ Database & Storage initialized');
  }
}

// ═══════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  await ensureInit();
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const existing = await db.getCreatorByEmail(email.toLowerCase().trim());
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const passwordHash = await bcrypt.hash(password, 12);
    const creator = {
      id: uuidv4(),
      email: email.toLowerCase().trim(),
      passwordHash,
      name: name || email.split('@')[0],
      createdAt: new Date().toISOString(),
    };
    await db.createItem('creators', creator);
    const token = generateCreatorToken(creator.id, creator.email);
    const capabilities = await getCreatorCapabilities(creator);
    res.status(201).json({
      token,
      creator: {
        id: creator.id,
        email: creator.email,
        name: creator.name,
        ...capabilities,
      },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  await ensureInit();
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const creator = await db.getCreatorByEmail(email.toLowerCase().trim());
    if (!creator) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, creator.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = generateCreatorToken(creator.id, creator.email);
    const capabilities = await getCreatorCapabilities(creator);
    res.json({
      token,
      creator: {
        id: creator.id,
        email: creator.email,
        name: creator.name,
        ...capabilities,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/reviewer/register
app.post('/api/reviewer/register', async (req, res) => {
  await ensureInit();
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await db.getReviewerByEmail(normalizedEmail);
    if (existing) {
      const samePassword = await bcrypt.compare(password, existing.passwordHash);
      if (!samePassword) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      const token = generateReviewerAccountToken(existing.id, existing.email, existing.name);
      const capabilities = await getReviewerCapabilities(existing);
      return res.status(200).json({
        token,
        reviewer: { id: existing.id, email: existing.email, name: existing.name, ...capabilities },
      });
    }

    const reviewer = {
      id: uuidv4(),
      email: normalizedEmail,
      name: name.trim(),
      passwordHash: await bcrypt.hash(password, 12),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.createItem('reviewers', reviewer);
    const token = generateReviewerAccountToken(reviewer.id, reviewer.email, reviewer.name);

    const capabilities = await getReviewerCapabilities(reviewer);
    return res.status(201).json({
      token,
      reviewer: { id: reviewer.id, email: reviewer.email, name: reviewer.name, ...capabilities },
    });
  } catch (err) {
    console.error('Reviewer registration error:', err);
    return res.status(500).json({ error: 'Reviewer registration failed' });
  }
});

// POST /api/reviewer/login
app.post('/api/reviewer/login', async (req, res) => {
  await ensureInit();
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const account = await db.getReviewerByEmail(normalizedEmail);
    if (!account) {
      return res.status(404).json({
        error: 'Receiver account not found for this email',
        code: 'RECEIVER_ACCOUNT_NOT_FOUND',
      });
    }

    const ok = await bcrypt.compare(password, account.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const token = generateReviewerAccountToken(account.id, account.email, account.name);
    const capabilities = await getReviewerCapabilities(account);
    return res.json({
      token,
      reviewer: { id: account.id, email: account.email, name: account.name, ...capabilities },
    });
  } catch (err) {
    console.error('Reviewer login error:', err);
    return res.status(500).json({ error: 'Reviewer login failed' });
  }
});

// GET /api/reviewer/me
app.get('/api/reviewer/me', async (req, res) => {
  await ensureInit();
  const auth = requireReviewerAccount(req);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  try {
    const user = await getReviewerById(auth.reviewer.sub);
    if (!user) return res.status(404).json({ error: 'Reviewer not found' });
    const capabilities = await getReviewerCapabilities(user);
    return res.json({ id: user.id, email: user.email, name: user.name, ...capabilities });
  } catch (err) {
    console.error('Reviewer profile error:', err);
    return res.status(500).json({ error: 'Failed to get reviewer profile' });
  }
});

// POST /api/auth/establish-receiver
app.post('/api/auth/establish-receiver', async (req, res) => {
  await ensureInit();
  const auth = requireCreator(req);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  try {
    const creator = await db.getItem('creators', auth.creator.sub, auth.creator.sub);
    if (!creator) return res.status(404).json({ error: 'Creator not found' });

    const reviewer = await db.getReviewerByEmail(creator.email.toLowerCase().trim());
    if (!reviewer) {
      return res.status(403).json({ error: 'Receiver access is not enabled for this account' });
    }

    const token = generateReviewerAccountToken(reviewer.id, reviewer.email, reviewer.name);
    const capabilities = await getReviewerCapabilities(reviewer);
    return res.json({
      token,
      reviewer: { id: reviewer.id, email: reviewer.email, name: reviewer.name, ...capabilities },
    });
  } catch (err) {
    console.error('Establish receiver access error:', err);
    return res.status(500).json({ error: 'Failed to establish receiver access' });
  }
});

// POST /api/reviewer/establish-sender
app.post('/api/reviewer/establish-sender', async (req, res) => {
  await ensureInit();
  const auth = requireReviewerAccount(req);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  try {
    const reviewer = await getReviewerById(auth.reviewer.sub);
    if (!reviewer) return res.status(404).json({ error: 'Reviewer not found' });

    const creator = await db.getCreatorByEmail(reviewer.email.toLowerCase().trim());
    if (!creator) {
      return res.status(403).json({ error: 'Sender access is not enabled for this account' });
    }

    const token = generateCreatorToken(creator.id, creator.email);
    const capabilities = await getCreatorCapabilities(creator);
    return res.json({
      token,
      creator: { id: creator.id, email: creator.email, name: creator.name, ...capabilities },
    });
  } catch (err) {
    console.error('Establish sender access error:', err);
    return res.status(500).json({ error: 'Failed to establish sender access' });
  }
});

// POST /api/reviewer/sessions/:id/claim
app.post('/api/reviewer/sessions/:id/claim', async (req, res) => {
  await ensureInit();
  const auth = requireReviewerAccount(req);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  const sessionId = req.params.id;
  try {
    const sessions = await db.queryItems('sessions', 'SELECT * FROM c WHERE c.id = @id', [{ name: '@id', value: sessionId }]);
    const session = sessions[0];
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const existing = await db.getReviewerAssignment(auth.reviewer.sub, sessionId);
    if (!existing) {
      await db.createItem('reviewerAssignments', {
        id: uuidv4(),
        reviewerId: auth.reviewer.sub,
        sessionId,
        creatorId: session.creatorId,
        claimedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return res.json({ message: 'Session linked to reviewer account', sessionId });
  } catch (err) {
    console.error('Claim session error:', err);
    return res.status(500).json({ error: 'Failed to link session' });
  }
});

// GET /api/reviewer/sessions
app.get('/api/reviewer/sessions', async (req, res) => {
  await ensureInit();
  const auth = requireReviewerAccount(req);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  try {
    const reviewerIdentity = await getReviewerById(auth.reviewer.sub);
    const reviewerEmail = normalizeEmail(reviewerIdentity?.email || auth.reviewer.email || '');
    const reviewerName = String(reviewerIdentity?.name || auth.reviewer.name || '').trim();

    const [byEmail, byName] = await Promise.all([
      reviewerEmail ? db.getSubmissionsByReviewerEmail(reviewerEmail) : Promise.resolve([]),
      reviewerEmail ? Promise.resolve([]) : reviewerName ? db.getSubmissionsByReviewerName(reviewerName) : Promise.resolve([]),
    ]);

    const dedupedSubmissionsBySession = new Map();
    [...byEmail, ...byName].forEach((submission) => {
      const sessionId = submission.sessionId;
      if (!sessionId) return;

      const existing = dedupedSubmissionsBySession.get(sessionId);
      if (!existing) {
        dedupedSubmissionsBySession.set(sessionId, submission);
        return;
      }

      const existingTs = new Date(existing.submittedAt || 0).getTime();
      const nextTs = new Date(submission.submittedAt || 0).getTime();
      if (nextTs >= existingTs) {
        dedupedSubmissionsBySession.set(sessionId, submission);
      }
    });

    const sessions = [];
    for (const [sessionId, reviewerSubmission] of dedupedSubmissionsBySession.entries()) {
      const found = await db.queryItems('sessions', 'SELECT * FROM c WHERE c.id = @id', [
        { name: '@id', value: sessionId },
      ]);
      const session = found[0];
      if (!session) continue;

      const images = await db.getImagesBySession(session.id);
      const postCount = new Set(
        images.map((img) => `${img.rowId || ''}-${Number(img.rowOrder) || 0}`).filter((key) => key !== '-0')
      ).size;

      sessions.push({
        id: session.id,
        title: session.title,
        clientId: session.clientId,
        clientName: session.clientName,
        projectId: session.projectId,
        projectName: session.projectName,
        status: session.status,
        imageCount: session.imageCount || 0,
        postCount,
        previewImages: images.slice(0, 8).map((img) => ({
          id: img.id,
          fileName: img.fileName,
          contentType: img.contentType || null,
          rowId: img.rowId || null,
          rowOrder: Number(img.rowOrder) || null,
          url: storage.generateSignedUrl(img.blobName),
          signedUrl: storage.generateSignedUrl(img.blobName),
        })),
        reviewerSubmissionCount: 1,
        reviewerLikeCount: (reviewerSubmission?.decisions || []).filter((item) => item.liked).length,
        reviewerDislikeCount: (reviewerSubmission?.decisions || []).filter((item) => !item.liked).length,
        reviewerDecisionCount: (reviewerSubmission?.decisions || []).length,
        reviewerAnnotationCount: (reviewerSubmission?.annotations || []).length,
        reviewerSubmittedAt: reviewerSubmission?.submittedAt || null,
        reviewerStatus: 'done',
        updatedAt: session.updatedAt || session.createdAt,
      });
    }

    sessions.sort((a, b) => {
      const aTime = new Date(a.reviewerSubmittedAt || a.updatedAt || 0).getTime();
      const bTime = new Date(b.reviewerSubmittedAt || b.updatedAt || 0).getTime();
      return bTime - aTime;
    });
    return res.json({ sessions });
  } catch (err) {
    console.error('Reviewer sessions error:', err);
    return res.status(500).json({ error: 'Failed to load reviewer sessions' });
  }
});

// GET /api/reviewer/sessions/:id/history
app.get('/api/reviewer/sessions/:id/history', async (req, res) => {
  await ensureInit();
  const auth = requireReviewerAccount(req);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  const sessionId = req.params.id;
  try {
    const reviewerIdentity = await getReviewerById(auth.reviewer.sub);
    const reviewerEmail = normalizeEmail(reviewerIdentity?.email || auth.reviewer.email || '');
    const reviewerName = String(reviewerIdentity?.name || auth.reviewer.name || '').trim();

    const sessions = await db.queryItems('sessions', 'SELECT * FROM c WHERE c.id = @id', [
      { name: '@id', value: sessionId },
    ]);
    const session = sessions[0];
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const submissions = await db.getSubmissionsBySession(sessionId);
    const reviewerSubmission = submissions
      .filter((submission) => {
        const submissionEmail = normalizeEmail(submission.reviewerEmail);
        if (reviewerEmail && submissionEmail) {
          return submissionEmail === reviewerEmail;
        }
        if (reviewerEmail) {
          return false;
        }
        return String(submission.reviewerName || '').trim() === reviewerName;
      })
      .sort((a, b) => {
        const aTime = new Date(a.submittedAt || 0).getTime();
        const bTime = new Date(b.submittedAt || 0).getTime();
        return bTime - aTime;
      })[0];

    if (!reviewerSubmission) {
      return res.status(404).json({ error: 'No submission found for this reviewer in the selected session' });
    }

    const images = await db.getImagesBySession(sessionId);
    const imageById = new Map(images.map((img) => [img.id, img]));

    const decisions = (reviewerSubmission.decisions || []).map((decision) => {
      const image = imageById.get(decision.imageId);
      return {
        imageId: decision.imageId,
        liked: !!decision.liked,
        fileName: image?.fileName || null,
        contentType: image?.contentType || null,
        rowOrder: Number(image?.rowOrder) || null,
        url: image?.blobName ? storage.generateSignedUrl(image.blobName) : null,
      };
    });

    const annotations = (reviewerSubmission.annotations || []).map((annotation) => {
      const image = imageById.get(annotation.imageId);
      return {
        imageId: annotation.imageId,
        comment: annotation.comment || '',
        x: annotation.x,
        y: annotation.y,
        timestampSec: annotation.timestampSec,
        createdAt: annotation.createdAt || reviewerSubmission.submittedAt,
        fileName: image?.fileName || null,
        contentType: image?.contentType || null,
        rowOrder: Number(image?.rowOrder) || null,
        url: image?.blobName ? storage.generateSignedUrl(image.blobName) : null,
      };
    });

    return res.json({
      session: {
        id: session.id,
        title: session.title,
        clientName: session.clientName,
        projectName: session.projectName,
        status: session.status,
      },
      submission: {
        submittedAt: reviewerSubmission.submittedAt || null,
        decisionCount: decisions.length,
        approvedCount: decisions.filter((item) => item.liked).length,
        rejectedCount: decisions.filter((item) => !item.liked).length,
        annotationCount: annotations.length,
      },
      decisions,
      annotations,
    });
  } catch (err) {
    console.error('Reviewer session history error:', err);
    return res.status(500).json({ error: 'Failed to load reviewer session history' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', async (req, res) => {
  await ensureInit();
  const auth = requireCreator(req);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  try {
    const creator = await db.getItem('creators', auth.creator.sub, auth.creator.sub);
    if (!creator) return res.status(404).json({ error: 'Creator not found' });
    const capabilities = await getCreatorCapabilities(creator);
    const usedBytes = await getCreatorStorageUsageBytes(auth.creator.sub); res.json({ id: creator.id, email: creator.email, name: creator.name, usedBytes, ...capabilities });
  } catch (err) {
    console.error('Auth me error:', err);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});


// ── Google OAuth helpers ──
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_CALLBACK_BASE = (process.env.GOOGLE_CALLBACK_BASE || 'https://giggidy.work').replace(/\/$/, '');

function oauthState(role) {
  const data = Buffer.from(JSON.stringify({ role, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev-secret').update(data).digest('base64url');
  return data + '.' + sig;
}

function verifyOAuthState(state) {
  const parts = (state || '').split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev-secret').update(data).digest('base64url');
  if (expected !== sig) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (Date.now() - parsed.iat > 10 * 60 * 1000) return null;
    return parsed;
  } catch { return null; }
}

function httpsPost(url, formData) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(formData).toString();
    const parsed = parseUrl(url);
    const req = https.request(
      { hostname: parsed.hostname, path: parsed.path, method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { let raw = ''; res.on('data', c => { raw += c; }); res.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { reject(e); } }); }
    );
    req.on('error', reject); req.write(body); req.end();
  });
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const parsed = parseUrl(url);
    const fullPath = parsed.path + (parsed.search || '');
    const req = https.request(
      { hostname: parsed.hostname, path: fullPath, method: 'GET' },
      (res) => { let raw = ''; res.on('data', c => { raw += c; }); res.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { reject(e); } }); }
    );
    req.on('error', reject); req.end();
  });
}

// GET /api/auth/google - redirect creator to Google
app.get('/api/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google login not configured' });
  const state = oauthState('creator');
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_CALLBACK_BASE + '/api/auth/google/callback',
    response_type: 'code', scope: 'openid email profile',
    state, access_type: 'online', prompt: 'select_account',
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params);
});

// GET /api/auth/google/callback - creator OAuth callback
app.get('/api/auth/google/callback', async (req, res) => {
  await ensureInit();
  const { code, state, error: oauthError } = req.query;
  const base = GOOGLE_CALLBACK_BASE;
  if (oauthError || !code) return res.redirect(base + '/login?google_error=' + encodeURIComponent(oauthError || 'cancelled'));
  const sd = verifyOAuthState(state);
  if (!sd || sd.role !== 'creator') return res.redirect(base + '/login?google_error=invalid_state');
  try {
    const td = await httpsPost('https://oauth2.googleapis.com/token', {
      code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_CALLBACK_BASE + '/api/auth/google/callback',
      grant_type: 'authorization_code',
    });
    if (!td.access_token) return res.redirect(base + '/login?google_error=token_failed');
    const ui = await httpsGet('https://www.googleapis.com/oauth2/v2/userinfo?access_token=' + td.access_token);
    const email = normalizeEmail(ui.email);
    const name = ui.name || (email ? email.split('@')[0] : 'User');
    if (!email) return res.redirect(base + '/login?google_error=no_email');
    let creator = await db.getCreatorByEmail(email);
    if (!creator) {
      creator = { id: uuidv4(), email, name, passwordHash: null, createdAt: new Date().toISOString(), authProvider: 'google' };
      await db.createItem('creators', creator);
    }
    const token = generateCreatorToken(creator.id, creator.email);
    return res.redirect(base + '/?google_token=' + encodeURIComponent(token) + '&role=creator');
  } catch (err) {
    console.error('Google creator callback error:', err);
    return res.redirect(base + '/login?google_error=server_error');
  }
});

// GET /api/reviewer/auth/google - redirect reviewer to Google
app.get('/api/reviewer/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google login not configured' });
  const state = oauthState('reviewer');
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_CALLBACK_BASE + '/api/reviewer/auth/google/callback',
    response_type: 'code', scope: 'openid email profile',
    state, access_type: 'online', prompt: 'select_account',
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params);
});

// GET /api/reviewer/auth/google/callback - reviewer OAuth callback
app.get('/api/reviewer/auth/google/callback', async (req, res) => {
  await ensureInit();
  const { code, state, error: oauthError } = req.query;
  const base = GOOGLE_CALLBACK_BASE;
  if (oauthError || !code) return res.redirect(base + '/reviewer/login?google_error=' + encodeURIComponent(oauthError || 'cancelled'));
  const sd = verifyOAuthState(state);
  if (!sd || sd.role !== 'reviewer') return res.redirect(base + '/reviewer/login?google_error=invalid_state');
  try {
    const td = await httpsPost('https://oauth2.googleapis.com/token', {
      code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_CALLBACK_BASE + '/api/reviewer/auth/google/callback',
      grant_type: 'authorization_code',
    });
    if (!td.access_token) return res.redirect(base + '/reviewer/login?google_error=token_failed');
    const ui = await httpsGet('https://www.googleapis.com/oauth2/v2/userinfo?access_token=' + td.access_token);
    const email = normalizeEmail(ui.email);
    const name = ui.name || (email ? email.split('@')[0] : 'User');
    if (!email) return res.redirect(base + '/reviewer/login?google_error=no_email');
    let reviewer = await db.getReviewerByEmail(email);
    if (!reviewer) {
      reviewer = { id: uuidv4(), email, name, passwordHash: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), authProvider: 'google' };
      await db.createItem('reviewers', reviewer);
    }
    const token = generateReviewerAccountToken(reviewer.id, reviewer.email, reviewer.name);
    return res.redirect(base + '/reviewer/login?google_token=' + encodeURIComponent(token) + '&role=reviewer');
  } catch (err) {
    console.error('Google reviewer callback error:', err);
    return res.redirect(base + '/reviewer/login?google_error=server_error');
  }
});

// ═══════════════════════════════════════
// SESSION ROUTES
// ═══════════════════════════════════════

// POST /api/sessions
app.post('/api/sessions', async (req, res) => {
  await ensureInit();
  const auth = requireCreator(req);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  try {
    const {
      title,
      deadline,
      password,
      reviewerPassword,
      maxReviewers,
      clientName,
      projectName,
      clientId,
      projectId,
      expectedReviewers = [],
    } = req.body;
    if (!title) return res.status(400).json({ error: 'Session title is required' });
    if (!clientName || !projectName) {
      return res.status(400).json({ error: 'Client and project names are required' });
    }

    const pw = reviewerPassword || password || null;
    const normalizedClientName = String(clientName).trim();
    const normalizedProjectName = String(projectName).trim();
    const session = {
      id: uuidv4(),
      creatorId: auth.creator.sub,
      title,
      clientId: clientId || makeScopedId('clt', normalizedClientName),
      clientName: normalizedClientName,
      projectId: projectId || makeScopedId('prj', `${normalizedClientName}-${normalizedProjectName}`),
      projectName: normalizedProjectName,
      status: 'active',
      imageCount: 0,
      reviewerPassword: pw ? await bcrypt.hash(pw, 10) : null,
      hasPassword: !!pw,
      expectedReviewers: mergeReviewerContacts(expectedReviewers),
      maxReviewers: maxReviewers || 50,
      reviewerCount: 0,
      deadline: deadline || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.createItem('sessions', session);
    res.status(201).json({
      session: { ...session, reviewerPassword: undefined },
      reviewLink: `/r/${session.id}`,
    });
  } catch (err) {
    console.error('Session create error:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// GET /api/sessions
app.get('/api/sessions', async (req, res) => {
  await ensureInit();
  const auth = requireCreator(req);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  try {
    const sessions = await db.getSessionsByCreator(auth.creator.sub);
    const sessionsWithCounts = await Promise.all(
      sessions.map(async (s) => {
        const [submissions, images] = await Promise.all([
          db.getSubmissionsBySession(s.id),
          db.getImagesBySession(s.id),
        ]);

        return {
          ...s,
          reviewerPassword: undefined,
          _submissions: submissions,
          submissionCount: submissions.length,
          likeCount: submissions.reduce((sum, sub) => sum + (sub.decisions || []).filter((item) => item.liked).length, 0),
          dislikeCount: submissions.reduce((sum, sub) => sum + (sub.decisions || []).filter((item) => !item.liked).length, 0),
          annotationCount: submissions.reduce((sum, sub) => sum + (sub.annotations || []).length, 0),
          postCount: new Set(
            images.map((img) => `${img.rowId || ''}-${Number(img.rowOrder) || 0}`).filter((key) => key !== '-0')
          ).size,
          previewImages: images.slice(0, 8).map((img) => ({
            id: img.id,
            fileName: img.fileName,
            rowId: img.rowId || null,
            rowOrder: Number(img.rowOrder) || null,
            url: storage.generateSignedUrl(img.blobName),
          })),
          reviewLink: `/r/${s.id}`,
        };
      })
    );

    const responseSessions = sessionsWithCounts.map((session) => {
      const reviewerProgressMap = new Map();

      (session._submissions || []).forEach((sub) => {
        const contact = toReviewerContact({
          reviewerName: sub.reviewerName,
          reviewerEmail: sub.reviewerEmail,
        });
        if (!contact) return;

        const existing = reviewerProgressMap.get(contact.email) || {
          name: contact.name,
          email: contact.email,
          status: 'done',
          likeCount: 0,
          dislikeCount: 0,
          annotationCount: 0,
          submissionCount: 0,
          submittedAt: null,
        };

        existing.name = existing.name || contact.name;
        existing.likeCount += (sub.decisions || []).filter((item) => item.liked).length;
        existing.dislikeCount += (sub.decisions || []).filter((item) => !item.liked).length;
        existing.annotationCount += (sub.annotations || []).length;
        existing.submissionCount += 1;

        const submittedTime = new Date(sub.submittedAt || 0).getTime();
        const existingTime = new Date(existing.submittedAt || 0).getTime();
        if (submittedTime && submittedTime >= existingTime) {
          existing.submittedAt = sub.submittedAt;
        }

        reviewerProgressMap.set(contact.email, existing);
      });

      const reviewerProgress = Array.from(reviewerProgressMap.values()).sort((left, right) => {
        const rightTime = new Date(right.submittedAt || 0).getTime();
        const leftTime = new Date(left.submittedAt || 0).getTime();
        if (rightTime !== leftTime) return rightTime - leftTime;
        return String(left.name || left.email).localeCompare(String(right.name || right.email));
      });

      const { _submissions, ...sessionView } = session;
      return {
        ...sessionView,
        reviewerProgress,
      };
    });

    res.json({ sessions: responseSessions });
  } catch (err) {
    console.error('Sessions list error:', err);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// GET /api/sessions/:id
app.get('/api/sessions/:id', async (req, res) => {
  await ensureInit();
  const auth = requireCreator(req);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  try {
    const session = await db.getItem('sessions', req.params.id, auth.creator.sub);
    if (!session || session.creatorId !== auth.creator.sub) return res.status(404).json({ error: 'Session not found' });

    const images = await db.getImagesBySession(req.params.id);
    const submissions = await db.getSubmissionsBySession(req.params.id);

    const imageStats = images.map((img) => {
      let likes = 0, dislikes = 0;
      const annotations = [];
      submissions.forEach((sub) => {
        const decision = (sub.decisions || []).find((d) => d.imageId === img.id);
        if (decision) { if (decision.liked) likes++; else dislikes++; }
        (sub.annotations || []).filter((a) => a.imageId === img.id)
          .forEach((a) => annotations.push({ ...a, reviewer: sub.reviewerName }));
      });
      return { ...img, likes, dislikes, netScore: likes - dislikes, annotations, url: storage.generateSignedUrl(img.blobName) };
    });

    res.json({
      session: { ...session, reviewerPassword: undefined, images: imageStats, submissions: submissions.map((s) => ({
        id: s.id, reviewerName: s.reviewerName, submittedAt: s.submittedAt, decisions: s.decisions,
        decisionCount: (s.decisions || []).length, annotationCount: (s.annotations || []).length,
        likeCount: (s.decisions || []).filter((d) => d.liked).length,
        dislikeCount: (s.decisions || []).filter((d) => !d.liked).length,
      })) },
      reviewLink: `/r/${session.id}`,
    });
  } catch (err) {
    console.error('Session get error:', err);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// PATCH /api/sessions/:id
app.patch('/api/sessions/:id', async (req, res) => {
  await ensureInit();
  const auth = requireCreator(req);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  try {
    const session = await db.getItem('sessions', req.params.id, auth.creator.sub);
    if (!session || session.creatorId !== auth.creator.sub) return res.status(404).json({ error: 'Session not found' });

    const allowedUpdates = ['status', 'title', 'maxReviewers', 'deadline'];
    const updates = { updatedAt: new Date().toISOString() };
    allowedUpdates.forEach((key) => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });

    const updated = await db.updateItem('sessions', req.params.id, auth.creator.sub, updates);
    res.json({ session: { ...updated, reviewerPassword: undefined } });
  } catch (err) {
    console.error('Session update error:', err);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// DELETE /api/sessions/:id
app.delete('/api/sessions/:id', async (req, res) => {
  await ensureInit();
  const auth = requireCreator(req);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  try {
    const session = await db.getItem('sessions', req.params.id, auth.creator.sub);
    if (!session || session.creatorId !== auth.creator.sub) return res.status(404).json({ error: 'Session not found' });

    const deleted = await deleteSessionCascade(req.params.id, auth.creator.sub);
    res.json({
      message: 'Session deleted',
      deleted,
    });
  } catch (err) {
    console.error('Session delete error:', err);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// DELETE /api/sessions (scoped bulk delete)
app.delete('/api/sessions', async (req, res) => {
  await ensureInit();
  const auth = requireCreator(req);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  try {
    const scope = (req.query.scope || 'all').toLowerCase();
    const clientId = req.query.clientId;
    const projectId = req.query.projectId;

    const allSessions = await db.getSessionsByCreator(auth.creator.sub);

    let targets = allSessions;
    if (scope === 'client') {
      if (!clientId) return res.status(400).json({ error: 'clientId is required for client scope' });
      targets = allSessions.filter((session) => session.clientId === clientId);
    } else if (scope === 'project') {
      if (!projectId) return res.status(400).json({ error: 'projectId is required for project scope' });
      targets = allSessions.filter((session) => session.projectId === projectId);
    } else if (scope !== 'all') {
      return res.status(400).json({ error: 'Unsupported delete scope' });
    }

    const deleted = [];
    for (const session of targets) {
      const result = await deleteSessionCascade(session.id, auth.creator.sub);
      deleted.push(result);
    }

    const totals = deleted.reduce(
      (acc, item) => {
        acc.sessions += 1;
        acc.images += item.imageCount;
        acc.submissions += item.submissionCount;
        acc.assignments += item.assignmentCount;
        return acc;
      },
      { sessions: 0, images: 0, submissions: 0, assignments: 0 }
    );

    return res.json({
      message: targets.length ? 'Sessions deleted' : 'No sessions matched scope',
      scope,
      deleted,
      totals,
    });
  } catch (err) {
    console.error('Scoped delete error:', err);
    return res.status(500).json({ error: 'Failed to delete sessions' });
  }
});


// POST /api/sessions/:id/join
app.post('/api/sessions/:id/join', async (req, res) => {
  await ensureInit();
  const sessionId = req.params.id;
  const reviewerAccount = requireReviewerAccount(req);

  try {
    const sessions = await db.queryItems('sessions', 'SELECT * FROM c WHERE c.id = @id', [{ name: '@id', value: sessionId }]);
    const session = sessions[0];
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status !== 'active') return res.status(403).json({ error: 'This session is no longer accepting reviews' });
    if (session.deadline && new Date(session.deadline) < new Date()) return res.status(403).json({ error: 'This session has expired' });

    const reviewerAccountUser = reviewerAccount.valid ? await getReviewerById(reviewerAccount.reviewer.sub) : null;
    if (reviewerAccount.valid && !reviewerAccountUser) {
      return res.status(404).json({ error: 'Reviewer account not found' });
    }

    const { reviewerName, reviewerEmail, password } = req.body;
    const cleanedName = reviewerAccountUser
      ? String(reviewerAccountUser.name || '').trim()
      : String(reviewerName || '').trim();
    const cleanedEmail = reviewerAccountUser
      ? normalizeEmail(reviewerAccountUser.email)
      : normalizeEmail(reviewerEmail);
    if (!cleanedName) return res.status(400).json({ error: 'Reviewer name is required' });
    if (!cleanedEmail || !/^\S+@\S+\.\S+$/.test(cleanedEmail)) {
      return res.status(400).json({ error: 'Valid reviewer email is required' });
    }

    if (session.reviewerPassword) {
      if (!password) return res.status(401).json({ error: 'This session requires a password', requiresPassword: true });
      const validPw = await bcrypt.compare(password, session.reviewerPassword);
      if (!validPw) return res.status(401).json({ error: 'Incorrect session password' });
    }

    const existingSub = await db.getSubmissionByReviewerEmail(sessionId, cleanedEmail)
      || await db.getSubmissionByReviewer(sessionId, cleanedName);
    const subs = await db.getSubmissionsBySession(sessionId);
    if (!existingSub && subs.length >= session.maxReviewers) {
      return res.status(403).json({ error: 'Maximum reviewers reached' });
    }

    const token = generateReviewerToken(sessionId, cleanedName, cleanedEmail);

    if (reviewerAccount.valid) {
      const existingAssignment = await db.getReviewerAssignment(reviewerAccount.reviewer.sub, sessionId);
      if (!existingAssignment) {
        await db.createItem('reviewerAssignments', {
          id: uuidv4(),
          reviewerId: reviewerAccount.reviewer.sub,
          sessionId,
          creatorId: session.creatorId,
          claimedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    const currentExpectedReviewers = mergeReviewerContacts(session.expectedReviewers || []);
    const hasReviewer = currentExpectedReviewers.some((contact) => contact.email === cleanedEmail);
    if (!hasReviewer) {
      await db.updateItem('sessions', session.id, session.creatorId, {
        expectedReviewers: mergeReviewerContacts(currentExpectedReviewers, [{ email: cleanedEmail, name: cleanedName }]),
        updatedAt: new Date().toISOString(),
      });
    }

    res.json({ token, session: { id: session.id, title: session.title, imageCount: session.imageCount } });
  } catch (err) {
    console.error('Session join error:', err);
    res.status(500).json({ error: 'Failed to join session' });
  }
});

// GET /api/public/sessions/:id/preview
app.get('/api/public/sessions/:id/preview', async (req, res) => {
  await ensureInit();
  const sessionId = req.params.id;

  try {
    const sessions = await db.queryItems('sessions', 'SELECT * FROM c WHERE c.id = @id', [
      { name: '@id', value: sessionId },
    ]);
    const session = sessions[0];
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const images = await db.getImagesBySession(sessionId);
    const firstImage = images[0] || null;

    return res.json({
      session: {
        id: session.id,
        title: session.title,
        clientName: session.clientName,
        projectName: session.projectName,
      },
      previewImage: firstImage
        ? {
            id: firstImage.id,
            fileName: firstImage.fileName,
            url: storage.generateSignedUrl(firstImage.blobName),
          }
        : null,
      imageCount: session.imageCount || images.length,
    });
  } catch (err) {
    console.error('Public preview error:', err);
    return res.status(500).json({ error: 'Failed to load preview' });
  }
});

// GET /api/sessions/:id/export
app.get('/api/sessions/:id/export', async (req, res) => {
  await ensureInit();
  const auth = requireCreator(req);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  try {
    const session = await db.getItem('sessions', req.params.id, auth.creator.sub);
    if (!session || session.creatorId !== auth.creator.sub) return res.status(404).json({ error: 'Session not found' });

    const images = await db.getImagesBySession(req.params.id);
    const submissions = await db.getSubmissionsBySession(req.params.id);
    const format = req.query.format || 'xlsx';
    const buffer = generateExport(session, images, submissions, format);

    const ext = format === 'csv' ? 'csv' : 'xlsx';
    const ct = format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    res.setHeader('Content-Type', ct);
    res.setHeader('Content-Disposition', `attachment; filename="${session.title.replace(/[^a-zA-Z0-9]/g, '_')}_results.${ext}"`);
    res.send(buffer);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Failed to export' });
  }
});

// ═══════════════════════════════════════
// IMAGE ROUTES
// ═══════════════════════════════════════

// POST /api/sessions/:id/images
app.post('/api/sessions/:id/images', async (req, res) => {
  await ensureInit();
  const auth = requireCreator(req);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  const sessionId = req.params.id;
  try {
    const session = await db.getItem('sessions', sessionId, auth.creator.sub);
    if (!session || session.creatorId !== auth.creator.sub) return res.status(404).json({ error: 'Session not found' });
    const existingImages = await db.getImagesBySession(sessionId);
    const currentUsageBytes = await getCreatorStorageUsageBytes(auth.creator.sub);
    const uploaded = [];

    if (req.is('multipart/form-data')) {
      await new Promise((resolve, reject) => {
        uploadMiddleware.single('file')(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const uploadedFile = req.file;
      if (!uploadedFile) {
        return res.status(400).json({ error: 'No images provided' });
      }

      const incomingSizeBytes = Number(uploadedFile.size) || 0;
      if (currentUsageBytes + incomingSizeBytes > MAX_ACCOUNT_STORAGE_BYTES) {
        await fs.promises.unlink(uploadedFile.path).catch(() => {});
        return res.status(413).json({
          error: 'You have exceeded the upload limit',
          code: 'ACCOUNT_STORAGE_LIMIT_EXCEEDED',
          maxBytes: MAX_ACCOUNT_STORAGE_BYTES,
          usedBytes: currentUsageBytes,
          remainingBytes: Math.max(0, MAX_ACCOUNT_STORAGE_BYTES - currentUsageBytes),
        });
      }

      try {
        const fileName = req.body.fileName || uploadedFile.originalname || 'upload';
        const contentType = req.body.contentType || uploadedFile.mimetype || 'application/octet-stream';
        const { blobUrl, blobName } = await storage.uploadImageFile(sessionId, fileName, uploadedFile.path, contentType);
        const imageDoc = {
          id: uuidv4(),
          sessionId,
          blobUrl,
          blobName,
          fileName,
          contentType,
          templateChannel: req.body.templateChannel || null,
          templateText: req.body.templateText || '',
          rowId: req.body.rowId || null,
          rowOrder: Number(req.body.rowOrder) || existingImages.length + 1,
          fileSize: incomingSizeBytes,
          order: existingImages.length,
          uploadedAt: new Date().toISOString(),
        };
        await db.createItem('images', imageDoc);
        uploaded.push(imageDoc);
      } finally {
        await fs.promises.unlink(uploadedFile.path).catch(() => {});
      }
    } else {
      const { images } = req.body;
      if (!images || !images.length) return res.status(400).json({ error: 'No images provided' });

      const incomingSizeBytes = images.reduce((sum, image) => {
        const size = Buffer.byteLength(String(image?.data || ''), 'base64');
        return sum + size;
      }, 0);

      if (currentUsageBytes + incomingSizeBytes > MAX_ACCOUNT_STORAGE_BYTES) {
        return res.status(413).json({
          error: 'You have exceeded the upload limit',
          code: 'ACCOUNT_STORAGE_LIMIT_EXCEEDED',
          maxBytes: MAX_ACCOUNT_STORAGE_BYTES,
          usedBytes: currentUsageBytes,
          remainingBytes: Math.max(0, MAX_ACCOUNT_STORAGE_BYTES - currentUsageBytes),
        });
      }

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (!img?.data || !img?.fileName) continue;
        const buffer = Buffer.from(img.data, 'base64');
        if (!buffer.length) continue;

        const { blobUrl, blobName } = await storage.uploadImage(sessionId, img.fileName, buffer, img.contentType || 'application/octet-stream');
        const imageDoc = {
          id: uuidv4(), sessionId, blobUrl, blobName,
          fileName: img.fileName, contentType: img.contentType || 'application/octet-stream',
          templateChannel: img.templateChannel || null,
          templateText: img.templateText || '',
          rowId: img.rowId || null,
          rowOrder: Number(img.rowOrder) || existingImages.length + i + 1,
          fileSize: buffer.length, order: existingImages.length + i,
          uploadedAt: new Date().toISOString(),
        };
        await db.createItem('images', imageDoc);
        uploaded.push(imageDoc);
      }
    }

    const totalImages = existingImages.length + uploaded.length;
    await db.updateItem('sessions', sessionId, auth.creator.sub, { imageCount: totalImages, updatedAt: new Date().toISOString() });

    const updatedUsageBytes = currentUsageBytes + uploaded.reduce((sum, image) => sum + (Number(image.fileSize) || 0), 0);
    res.status(201).json({
      uploaded: uploaded.length,
      total: totalImages,
      images: uploaded.map((img) => ({ id: img.id, fileName: img.fileName, order: img.order })),
      storage: {
        usedBytes: updatedUsageBytes,
        remainingBytes: Math.max(0, MAX_ACCOUNT_STORAGE_BYTES - updatedUsageBytes),
        maxBytes: MAX_ACCOUNT_STORAGE_BYTES,
      },
    });
  } catch (err) {
    console.error('Image upload error:', err);
    if (err && (err.code === 'LIMIT_FILE_SIZE' || err.status === 413)) {
      return res.status(413).json({
        error: 'You have exceeded the upload limit',
        code: 'ACCOUNT_STORAGE_LIMIT_EXCEEDED',
      });
    }
    res.status(500).json({ error: 'Failed to upload images' });
  }
});

// DELETE /api/sessions/:id/images/:imageId
app.delete('/api/sessions/:id/images/:imageId', async (req, res) => {
  await ensureInit();
  const auth = requireCreator(req);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  const { id: sessionId, imageId } = req.params;
  try {
    const session = await db.getItem('sessions', sessionId, auth.creator.sub);
    if (!session || session.creatorId !== auth.creator.sub) return res.status(404).json({ error: 'Session not found' });

    const image = await db.getItem('images', imageId, sessionId);
    if (!image) return res.status(404).json({ error: 'Image not found' });

    // Delete blob from storage and document from DB
    await storage.deleteBlob(image.blobName);
    await db.deleteItem('images', imageId, sessionId);

    // Update session image count
    const remaining = await db.getImagesBySession(sessionId);
    await db.updateItem('sessions', sessionId, auth.creator.sub, {
      imageCount: remaining.length,
      updatedAt: new Date().toISOString(),
    });

    const usageBytes = await getCreatorStorageUsageBytes(auth.creator.sub);
    res.json({
      message: 'Image deleted',
      remaining: remaining.length,
      storage: {
        usedBytes: usageBytes,
        remainingBytes: Math.max(0, MAX_ACCOUNT_STORAGE_BYTES - usageBytes),
        maxBytes: MAX_ACCOUNT_STORAGE_BYTES,
      },
    });
  } catch (err) {
    console.error('Image delete error:', err);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// GET /api/sessions/:id/images
app.get('/api/sessions/:id/images', async (req, res) => {
  await ensureInit();
  const sessionId = req.params.id;
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid or expired token' });
  if (decoded.role === 'reviewer' && decoded.sessionId !== sessionId) return res.status(403).json({ error: 'Not authorized for this session' });

  try {
    const images = await db.getImagesBySession(sessionId);
    const imagesWithUrls = images.map((img) => ({
      id: img.id, fileName: img.fileName, order: img.order,
      templateChannel: img.templateChannel || null,
      templateText: img.templateText || '',
      rowId: img.rowId || null,
      rowOrder: img.rowOrder || null,
      url: storage.generateSignedUrl(img.blobName), uploadedAt: img.uploadedAt,
    }));
    res.json({ images: imagesWithUrls });
  } catch (err) {
    console.error('Images get error:', err);
    res.status(500).json({ error: 'Failed to get images' });
  }
});

// ═══════════════════════════════════════
// REVIEW ROUTES
// ═══════════════════════════════════════

// POST /api/sessions/:id/submit
app.post('/api/sessions/:id/submit', async (req, res) => {
  await ensureInit();
  const sessionId = req.params.id;
  const auth = requireReviewer(req, sessionId);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  try {
    const reviewerEmail = normalizeEmail(auth.reviewer.reviewerEmail);
    const existing = await db.getSubmissionByReviewerEmail(sessionId, reviewerEmail)
      || await db.getSubmissionByReviewer(sessionId, auth.reviewer.reviewerName);

    const { decisions, annotations } = req.body;
    if (!decisions || !Array.isArray(decisions)) return res.status(400).json({ error: 'Decisions array is required' });

    const mappedDecisions = decisions.map((d) => ({ imageId: d.imageId, liked: !!d.liked }));
    const mappedAnnotations = (annotations || []).map((a) => ({
      imageId: a.imageId,
      x: a.x,
      y: a.y,
      timestampSec: a.timestampSec,
      comment: a.comment || '',
      author: auth.reviewer.reviewerName,
      createdAt: a.createdAt || new Date().toISOString(),
    }));

    if (existing) {
      await db.updateItem('submissions', existing.id, sessionId, {
        decisions: mappedDecisions,
        annotations: mappedAnnotations,
        reviewerEmail: reviewerEmail || existing.reviewerEmail || null,
        reviewerName: auth.reviewer.reviewerName || existing.reviewerName,
        submittedAt: new Date().toISOString(),
      });
    } else {
      const submission = {
        id: uuidv4(), sessionId,
        reviewerName: auth.reviewer.reviewerName,
        reviewerEmail: reviewerEmail || null,
        decisions: mappedDecisions,
        annotations: mappedAnnotations,
        submittedAt: new Date().toISOString(),
      };
      await db.createItem('submissions', submission);
    }

    res.status(201).json({
      message: existing ? 'Review updated successfully' : 'Review submitted successfully',
      summary: {
        total: decisions.length, liked: decisions.filter((d) => d.liked).length,
        disliked: decisions.filter((d) => !d.liked).length, annotations: (annotations || []).length,
      },
    });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// GET /api/sessions/:id/reviewer-history
app.get('/api/sessions/:id/reviewer-history', async (req, res) => {
  await ensureInit();
  const sessionId = req.params.id;
  const auth = requireReviewer(req, sessionId);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  try {
    const sessions = await db.queryItems('sessions', 'SELECT * FROM c WHERE c.id = @id', [
      { name: '@id', value: sessionId },
    ]);
    const session = sessions[0];
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const reviewerEmail = normalizeEmail(auth.reviewer.reviewerEmail);
    const reviewerName = String(auth.reviewer.reviewerName || '').trim();

    const creatorSessions = await db.getSessionsByCreator(session.creatorId);
    const relatedSessions = creatorSessions.filter(
      (item) => item.clientId === session.clientId && item.projectId === session.projectId
    );

    const historyEntries = [];
    for (const related of relatedSessions) {
      const submissions = await db.getSubmissionsBySession(related.id);
      const matchedSubmission = submissions.find((sub) => {
        const submissionEmail = normalizeEmail(sub.reviewerEmail);
        if (reviewerEmail && submissionEmail) {
          return submissionEmail === reviewerEmail;
        }
        return String(sub.reviewerName || '').trim() === reviewerName;
      });

      if (!matchedSubmission) continue;

      const liked = (matchedSubmission.decisions || []).filter((decision) => decision.liked).length;
      const disliked = (matchedSubmission.decisions || []).filter((decision) => !decision.liked).length;
      historyEntries.push({
        sessionId: related.id,
        sessionTitle: related.title,
        submittedAt: matchedSubmission.submittedAt,
        liked,
        disliked,
        annotationCount: (matchedSubmission.annotations || []).length,
        totalImagesReviewed: (matchedSubmission.decisions || []).length,
        isCurrentSession: related.id === sessionId,
      });
    }

    historyEntries.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    return res.json({
      session: {
        id: session.id,
        title: session.title,
        clientId: session.clientId,
        clientName: session.clientName,
        projectId: session.projectId,
        projectName: session.projectName,
      },
      reviewer: {
        name: reviewerName,
        email: reviewerEmail || null,
      },
      history: historyEntries,
    });
  } catch (err) {
    console.error('Reviewer history error:', err);
    return res.status(500).json({ error: 'Failed to load reviewer history' });
  }
});

// GET /api/sessions/:id/submissions
app.get('/api/sessions/:id/submissions', async (req, res) => {
  await ensureInit();
  const auth = requireCreator(req);
  if (!auth.valid) return res.status(auth.status).json({ error: auth.error });

  try {
    const submissions = await db.getSubmissionsBySession(req.params.id);
    res.json({
      submissions: submissions.map((s) => ({
        id: s.id, reviewerName: s.reviewerName, reviewerEmail: s.reviewerEmail || null, submittedAt: s.submittedAt,
        decisions: s.decisions, annotations: s.annotations,
        likeCount: (s.decisions || []).filter((d) => d.liked).length,
        dislikeCount: (s.decisions || []).filter((d) => !d.liked).length,
      })),
    });
  } catch (err) {
    console.error('Submissions list error:', err);
    res.status(500).json({ error: 'Failed to list submissions' });
  }
});

// ═══════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV || 'development' });
});

// ═══════════════════════════════════════
// SERVE STATIC FRONTEND
// ═══════════════════════════════════════

const clientDist = path.join(__dirname, 'client', 'dist');

app.use(express.static(clientDist));

// SPA fallback: all non-API routes serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ═══════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   CreativeSwipe Server                   ║
║   Port: ${PORT}                            ║
║   Mode: ${process.env.NODE_ENV || 'development'}                   ║
╚══════════════════════════════════════════╝
  `);
});

