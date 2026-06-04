const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const db = require('./api/src/services/database');
const storage = require('./api/src/services/storage');
const {
  generateCreatorToken,
  generateReviewerToken,
  generateReviewerAccountToken,
  verifyToken,
} = require('./api/src/services/tokenService');
const { generateExport } = require('./api/src/services/exportService');

const app = express();
const PORT = process.env.PORT || 8080;
const CLIENT_DIST = path.join(__dirname, 'client', 'dist');

let initialized = false;

app.use(cors());
app.use(express.json({ limit: '35mb' }));
app.use(express.raw({ limit: '25mb', type: ['image/*', 'video/*', 'application/octet-stream'] }));

async function ensureInit() {
  if (initialized) return;
  await db.initDatabase();
  await storage.initStorage();
  initialized = true;
}

function normalizeEmail(value) {
  return String(value || '').toLowerCase().trim();
}

function publicCreator(creator) {
  return {
    id: creator.id,
    email: creator.email,
    name: creator.name,
    hasReceiverAccess: true,
  };
}

function publicReviewer(reviewer) {
  return {
    id: reviewer.id,
    email: reviewer.email,
    name: reviewer.name,
    hasSenderAccess: true,
  };
}

function makeScopedId(prefix, source = '') {
  const slug = (source || 'default')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20) || 'default';
  return `${prefix}_${slug}_${uuidv4().slice(0, 8)}`;
}

function getToken(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

function requireRole(req, role) {
  const decoded = verifyToken(getToken(req));
  if (!decoded) return null;
  return decoded.role === role ? decoded : null;
}

function asyncRoute(handler) {
  return async (req, res) => {
    try {
      await ensureInit();
      await handler(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  };
}

app.get('/api/health', asyncRoute(async (req, res) => {
  res.json({ ok: true, service: 'creativeswipe' });
}));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const { email, password, name } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (await db.getCreatorByEmail(normalizedEmail)) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const creator = {
    id: uuidv4(),
    email: normalizedEmail,
    passwordHash: await bcrypt.hash(password, 12),
    name: name || normalizedEmail.split('@')[0],
    createdAt: new Date().toISOString(),
  };

  await db.createItem('creators', creator);
  const token = generateCreatorToken(creator.id, creator.email);
  res.status(201).json({ token, creator: publicCreator(creator) });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body || {};
  const creator = await db.getCreatorByEmail(normalizeEmail(email));

  if (!creator || !(await bcrypt.compare(password || '', creator.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = generateCreatorToken(creator.id, creator.email);
  res.json({ token, creator: publicCreator(creator) });
}));

app.get('/api/auth/me', asyncRoute(async (req, res) => {
  const auth = requireRole(req, 'creator');
  if (!auth) return res.status(403).json({ error: 'Creator access required' });

  const creator = await db.getItem('creators', auth.sub);
  if (!creator) return res.status(404).json({ error: 'Creator not found' });
  res.json(publicCreator(creator));
}));

app.post('/api/reviewer/register', asyncRoute(async (req, res) => {
  const { name, email, password } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (await db.getReviewerByEmail(normalizedEmail)) {
    return res.status(409).json({ error: 'A receiver account with this email already exists' });
  }

  const reviewer = {
    id: uuidv4(),
    email: normalizedEmail,
    passwordHash: await bcrypt.hash(password, 12),
    name: name || normalizedEmail.split('@')[0],
    createdAt: new Date().toISOString(),
  };

  await db.createItem('reviewers', reviewer);
  const token = generateReviewerAccountToken(reviewer.id, reviewer.email, reviewer.name);
  res.status(201).json({ token, reviewer: publicReviewer(reviewer) });
}));

app.post('/api/reviewer/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body || {};
  const reviewer = await db.getReviewerByEmail(normalizeEmail(email));

  if (!reviewer || !(await bcrypt.compare(password || '', reviewer.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = generateReviewerAccountToken(reviewer.id, reviewer.email, reviewer.name);
  res.json({ token, reviewer: publicReviewer(reviewer) });
}));

app.get('/api/reviewer/me', asyncRoute(async (req, res) => {
  const auth = requireRole(req, 'reviewerAccount');
  if (!auth) return res.status(403).json({ error: 'Receiver access required' });

  const reviewer = await db.getItem('reviewers', auth.sub);
  if (!reviewer) return res.status(404).json({ error: 'Receiver not found' });
  res.json(publicReviewer(reviewer));
}));

app.post('/api/sessions', asyncRoute(async (req, res) => {
  const auth = requireRole(req, 'creator');
  if (!auth) return res.status(403).json({ error: 'Creator access required' });

  const { title, deadline, reviewerPassword, maxReviewers, clientName, projectName, clientId, projectId } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Session title is required' });
  if (!clientName || !projectName) return res.status(400).json({ error: 'Client and project names are required' });

  const normalizedClientName = String(clientName).trim();
  const normalizedProjectName = String(projectName).trim();
  const session = {
    id: uuidv4(),
    creatorId: auth.sub,
    title,
    clientId: clientId || makeScopedId('clt', normalizedClientName),
    clientName: normalizedClientName,
    projectId: projectId || makeScopedId('prj', `${normalizedClientName}-${normalizedProjectName}`),
    projectName: normalizedProjectName,
    status: 'active',
    imageCount: 0,
    reviewerPassword: reviewerPassword ? await bcrypt.hash(reviewerPassword, 10) : null,
    hasPassword: !!reviewerPassword,
    maxReviewers: maxReviewers || 50,
    reviewerCount: 0,
    deadline: deadline || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.createItem('sessions', session);
  res.status(201).json({ session: { ...session, reviewerPassword: undefined }, reviewLink: `/r/${session.id}` });
}));

app.get('/api/sessions', asyncRoute(async (req, res) => {
  const auth = requireRole(req, 'creator');
  if (!auth) return res.status(403).json({ error: 'Creator access required' });

  const sessions = await db.getSessionsByCreator(auth.sub);
  const sessionsWithCounts = await Promise.all(sessions.map(async (session) => {
    const submissions = await db.getSubmissionsBySession(session.id);
    return { ...session, reviewerPassword: undefined, reviewerCount: submissions.length, reviewLink: `/r/${session.id}` };
  }));

  res.json({ sessions: sessionsWithCounts });
}));

app.get('/api/sessions/:id', asyncRoute(async (req, res) => {
  const auth = requireRole(req, 'creator');
  if (!auth) return res.status(403).json({ error: 'Creator access required' });

  const session = await db.getItem('sessions', req.params.id);
  if (!session || session.creatorId !== auth.sub) return res.status(404).json({ error: 'Session not found' });

  const images = await db.getImagesBySession(session.id);
  const submissions = await db.getSubmissionsBySession(session.id);
  const imageStats = images.map((img) => {
    let likes = 0;
    let dislikes = 0;
    const annotations = [];

    submissions.forEach((sub) => {
      const decision = (sub.decisions || []).find((d) => d.imageId === img.id);
      if (decision) decision.liked ? likes++ : dislikes++;
      (sub.annotations || []).filter((a) => a.imageId === img.id).forEach((a) => {
        annotations.push({ ...a, reviewer: sub.reviewerName });
      });
    });

    return { ...img, likes, dislikes, netScore: likes - dislikes, annotations };
  });

  res.json({
    session: { ...session, reviewerPassword: undefined },
    images: imageStats,
    submissions: submissions.map((sub) => ({
      id: sub.id,
      reviewerName: sub.reviewerName,
      submittedAt: sub.submittedAt,
      decisionCount: (sub.decisions || []).length,
      annotationCount: (sub.annotations || []).length,
      likeCount: (sub.decisions || []).filter((d) => d.liked).length,
      dislikeCount: (sub.decisions || []).filter((d) => !d.liked).length,
    })),
    reviewLink: `/r/${session.id}`,
  });
}));

app.patch('/api/sessions/:id', asyncRoute(async (req, res) => {
  const auth = requireRole(req, 'creator');
  if (!auth) return res.status(403).json({ error: 'Creator access required' });

  const session = await db.getItem('sessions', req.params.id);
  if (!session || session.creatorId !== auth.sub) return res.status(404).json({ error: 'Session not found' });

  const updates = { updatedAt: new Date().toISOString() };
  ['status', 'title', 'maxReviewers', 'deadline'].forEach((key) => {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  });

  const updated = await db.updateItem('sessions', session.id, auth.sub, updates);
  res.json({ session: { ...updated, reviewerPassword: undefined } });
}));

app.delete('/api/sessions/:id', asyncRoute(async (req, res) => {
  const auth = requireRole(req, 'creator');
  if (!auth) return res.status(403).json({ error: 'Creator access required' });

  const session = await db.getItem('sessions', req.params.id);
  if (!session || session.creatorId !== auth.sub) return res.status(404).json({ error: 'Session not found' });

  await db.deleteItem('sessions', session.id);
  res.json({ message: 'Session deleted' });
}));

app.post('/api/sessions/:id/join', asyncRoute(async (req, res) => {
  const session = await db.getItem('sessions', req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.status !== 'active') return res.status(403).json({ error: 'This session is no longer accepting reviews' });
  if (session.deadline && new Date(session.deadline) < new Date()) {
    return res.status(403).json({ error: 'This session has expired' });
  }

  const { reviewerName, reviewerEmail, password } = req.body || {};
  const name = String(reviewerName || '').trim();
  const email = normalizeEmail(reviewerEmail);
  if (!name) return res.status(400).json({ error: 'Reviewer name is required' });

  if (session.reviewerPassword) {
    if (!password) return res.status(401).json({ error: 'This session requires a password', requiresPassword: true });
    if (!(await bcrypt.compare(password, session.reviewerPassword))) {
      return res.status(401).json({ error: 'Incorrect session password' });
    }
  }

  const existingSub = email
    ? await db.getSubmissionByReviewerEmail(session.id, email)
    : await db.getSubmissionByReviewer(session.id, name);
  if (existingSub) return res.status(409).json({ error: 'You have already submitted a review for this session' });

  const subs = await db.getSubmissionsBySession(session.id);
  if (subs.length >= session.maxReviewers) {
    return res.status(403).json({ error: 'This session has reached its maximum number of reviewers' });
  }

  res.json({
    token: generateReviewerToken(session.id, name, email || null),
    session: { id: session.id, title: session.title, imageCount: session.imageCount },
  });
}));

app.post('/api/sessions/:id/images', asyncRoute(async (req, res) => {
  const auth = requireRole(req, 'creator');
  if (!auth) return res.status(403).json({ error: 'Creator access required' });

  const session = await db.getItem('sessions', req.params.id);
  if (!session || session.creatorId !== auth.sub) return res.status(404).json({ error: 'Session not found' });

  const images = (req.body && req.body.images) || [];
  if (!images.length) return res.status(400).json({ error: 'No images provided' });

  const existingImages = await db.getImagesBySession(session.id);
  if (existingImages.length + images.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 images per session' });
  }

  const uploaded = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const buffer = Buffer.from(img.data, 'base64');
    if (buffer.length > 25 * 1024 * 1024) continue;

    const { blobUrl, blobName } = await storage.uploadImage(session.id, img.fileName, buffer, img.contentType || 'image/jpeg');
    const imageDoc = {
      id: uuidv4(),
      sessionId: session.id,
      blobUrl,
      blobName,
      fileName: img.fileName,
      contentType: img.contentType || 'image/jpeg',
      fileSize: buffer.length,
      order: existingImages.length + i,
      uploadedAt: new Date().toISOString(),
    };

    await db.createItem('images', imageDoc);
    uploaded.push(imageDoc);
  }

  await db.updateItem('sessions', session.id, auth.sub, {
    imageCount: existingImages.length + uploaded.length,
    updatedAt: new Date().toISOString(),
  });

  res.status(201).json({
    uploaded: uploaded.length,
    total: existingImages.length + uploaded.length,
    images: uploaded.map((img) => ({ id: img.id, fileName: img.fileName, order: img.order })),
  });
}));

app.get('/api/sessions/:id/images', asyncRoute(async (req, res) => {
  const decoded = verifyToken(getToken(req));
  if (!decoded) return res.status(401).json({ error: 'Invalid or expired token' });
  if (decoded.role === 'reviewer' && decoded.sessionId !== req.params.id) {
    return res.status(403).json({ error: 'Not authorized for this session' });
  }

  const images = await db.getImagesBySession(req.params.id);
  res.json({
    images: images.map((img) => ({
      id: img.id,
      fileName: img.fileName,
      order: img.order,
      url: storage.generateSignedUrl(img.blobName),
      uploadedAt: img.uploadedAt,
    })),
  });
}));

app.get('/api/images/blob/:sessionId/:blobId', asyncRoute(async (req, res) => {
  const blob = await storage.getBlobData(`${req.params.sessionId}/${req.params.blobId}`);
  if (!blob) return res.status(404).json({ error: 'Image not found' });

  res.set('Content-Type', blob.contentType || 'application/octet-stream');
  res.set('Cache-Control', 'private, max-age=900');
  res.send(blob.data);
}));

app.post('/api/sessions/:id/submit', asyncRoute(async (req, res) => {
  const auth = requireRole(req, 'reviewer');
  if (!auth || auth.sessionId !== req.params.id) return res.status(403).json({ error: 'Reviewer access required' });

  const existing = auth.reviewerEmail
    ? await db.getSubmissionByReviewerEmail(req.params.id, auth.reviewerEmail)
    : await db.getSubmissionByReviewer(req.params.id, auth.reviewerName);
  if (existing) return res.status(409).json({ error: 'You have already submitted your review' });

  const { decisions, annotations } = req.body || {};
  if (!Array.isArray(decisions)) return res.status(400).json({ error: 'Decisions array is required' });

  const submission = {
    id: uuidv4(),
    sessionId: req.params.id,
    reviewerName: auth.reviewerName,
    reviewerEmail: auth.reviewerEmail || null,
    decisions: decisions.map((d) => ({ imageId: d.imageId, liked: !!d.liked })),
    annotations: (annotations || []).map((a) => ({
      imageId: a.imageId,
      x: a.x,
      y: a.y,
      timestampSec: a.timestampSec,
      comment: a.comment || '',
      author: auth.reviewerName,
      createdAt: a.createdAt || new Date().toISOString(),
    })),
    submittedAt: new Date().toISOString(),
  };

  await db.createItem('submissions', submission);
  res.status(201).json({
    message: 'Review submitted successfully',
    summary: {
      total: decisions.length,
      liked: decisions.filter((d) => d.liked).length,
      disliked: decisions.filter((d) => !d.liked).length,
      annotations: (annotations || []).length,
    },
  });
}));

app.get('/api/sessions/:id/submissions', asyncRoute(async (req, res) => {
  const auth = requireRole(req, 'creator');
  if (!auth) return res.status(403).json({ error: 'Creator access required' });

  const submissions = await db.getSubmissionsBySession(req.params.id);
  res.json({ submissions });
}));

app.get('/api/sessions/:id/export', asyncRoute(async (req, res) => {
  const auth = requireRole(req, 'creator');
  if (!auth) return res.status(403).json({ error: 'Creator access required' });

  const session = await db.getItem('sessions', req.params.id);
  if (!session || session.creatorId !== auth.sub) return res.status(404).json({ error: 'Session not found' });

  const format = req.query.format || 'xlsx';
  const buffer = generateExport(
    session,
    await db.getImagesBySession(session.id),
    await db.getSubmissionsBySession(session.id),
    format
  );

  const ext = format === 'csv' ? 'csv' : 'xlsx';
  res.set('Content-Type', format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="${session.title.replace(/[^a-zA-Z0-9]/g, '_')}_results.${ext}"`);
  res.send(buffer);
}));

app.get('/api/public/sessions/:id/preview', asyncRoute(async (req, res) => {
  const session = await db.getItem('sessions', req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({
    session: {
      id: session.id,
      title: session.title,
      clientName: session.clientName,
      projectName: session.projectName,
      imageCount: session.imageCount,
      hasPassword: session.hasPassword,
      status: session.status,
      deadline: session.deadline,
    },
  });
}));

app.get('/api/reviewer/sessions', asyncRoute(async (req, res) => {
  const auth = requireRole(req, 'reviewerAccount');
  if (!auth) return res.status(403).json({ error: 'Receiver access required' });

  const submissions = await db.getSubmissionsByReviewerEmail(auth.email);
  const sessions = await Promise.all(submissions.map(async (sub) => {
    const session = await db.getItem('sessions', sub.sessionId);
    return session ? { ...session, reviewerPassword: undefined, submittedAt: sub.submittedAt } : null;
  }));

  res.json({ sessions: sessions.filter(Boolean) });
}));

app.get('/api/reviewer/sessions/:id/history', asyncRoute(async (req, res) => {
  const auth = requireRole(req, 'reviewerAccount');
  if (!auth) return res.status(403).json({ error: 'Receiver access required' });

  const session = await db.getItem('sessions', req.params.id);
  const submission = await db.getSubmissionByReviewerEmail(req.params.id, auth.email);
  if (!session || !submission) return res.status(404).json({ error: 'Review history not found' });

  const images = await db.getImagesBySession(req.params.id);
  const imageById = Object.fromEntries(images.map((img) => [img.id, img]));
  const attachImage = (item) => ({ ...item, ...(imageById[item.imageId] || {}) });

  res.json({
    session: { ...session, reviewerPassword: undefined },
    submission: {
      approvedCount: (submission.decisions || []).filter((d) => d.liked).length,
      rejectedCount: (submission.decisions || []).filter((d) => !d.liked).length,
      annotationCount: (submission.annotations || []).length,
      submittedAt: submission.submittedAt,
    },
    decisions: (submission.decisions || []).map(attachImage),
    annotations: (submission.annotations || []).map(attachImage),
  });
}));

app.use(express.static(CLIENT_DIST));
app.get('*', (req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

ensureInit()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`CreativeSwipe listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Startup failed:', err);
    process.exit(1);
  });
