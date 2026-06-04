const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { generateReviewerToken } = require('../services/tokenService');
const {
  initDatabase,
  createItem,
  getItem,
  updateItem,
  deleteItem,
  getSessionsByCreator,
  getImagesBySession,
  getSubmissionsBySession,
} = require('../services/database');
const { initStorage } = require('../services/storage');
const { requireCreator, jsonResponse } = require('../middleware/authMiddleware');
const { generateExport } = require('../services/exportService');

let initialized = false;

async function ensureInit() {
  if (!initialized) {
    await initDatabase();
    await initStorage();
    initialized = true;
  }
}

function makeScopedId(prefix, source = '') {
  const slug = (source || 'default')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20) || 'default';
  return `${prefix}_${slug}_${uuidv4().slice(0, 8)}`;
}

// POST /api/sessions — Creator creates a new session
app.http('sessionsCreate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sessions',
  handler: async (request, context) => {
    await ensureInit();
    const auth = requireCreator(request);
    if (!auth.valid) return auth;

    try {
      const body = await request.json();
      const { title, deadline, reviewerPassword, maxReviewers, clientName, projectName, clientId, projectId } = body;

      if (!title) {
        return jsonResponse(400, { error: 'Session title is required' });
      }

      if (!clientName || !projectName) {
        return jsonResponse(400, { error: 'Client and project names are required' });
      }

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
        status: 'active', // draft | active | closed | expired
        imageCount: 0,
        reviewerPassword: reviewerPassword ? await bcrypt.hash(reviewerPassword, 10) : null,
        hasPassword: !!reviewerPassword,
        maxReviewers: maxReviewers || 50,
        reviewerCount: 0,
        deadline: deadline || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await createItem('sessions', session);

      // Generate the short review link
      const reviewLink = `/r/${session.id}`;

      return jsonResponse(201, {
        session: {
          ...session,
          reviewerPassword: undefined, // Don't return the hash
        },
        reviewLink,
      });
    } catch (err) {
      context.error('Session create error:', err);
      return jsonResponse(500, { error: 'Failed to create session' });
    }
  },
});

// GET /api/sessions — Creator lists their sessions
app.http('sessionsList', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sessions',
  handler: async (request, context) => {
    await ensureInit();
    const auth = requireCreator(request);
    if (!auth.valid) return auth;

    try {
      const sessions = await getSessionsByCreator(auth.creator.sub);

      // Get submission counts for each session
      const sessionsWithCounts = await Promise.all(
        sessions.map(async (s) => {
          const submissions = await getSubmissionsBySession(s.id);
          return {
            ...s,
            reviewerPassword: undefined,
            reviewerCount: submissions.length,
            reviewLink: `/r/${s.id}`,
          };
        })
      );

      return jsonResponse(200, { sessions: sessionsWithCounts });
    } catch (err) {
      context.error('Sessions list error:', err);
      return jsonResponse(500, { error: 'Failed to list sessions' });
    }
  },
});

// GET /api/sessions/{id} — Creator views full session results
app.http('sessionsGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sessions/{id}',
  handler: async (request, context) => {
    await ensureInit();
    const auth = requireCreator(request);
    if (!auth.valid) return auth;

    const sessionId = request.params.id;

    try {
      const session = await getItem('sessions', sessionId, auth.creator.sub);
      if (!session) {
        return jsonResponse(404, { error: 'Session not found' });
      }

      if (session.creatorId !== auth.creator.sub) {
        return jsonResponse(403, { error: 'Access denied' });
      }

      const images = await getImagesBySession(sessionId);
      const submissions = await getSubmissionsBySession(sessionId);

      // Build per-image stats
      const imageStats = images.map((img) => {
        let likes = 0, dislikes = 0;
        const annotations = [];

        submissions.forEach((sub) => {
          const decision = (sub.decisions || []).find((d) => d.imageId === img.id);
          if (decision) {
            if (decision.liked) likes++;
            else dislikes++;
          }
          (sub.annotations || [])
            .filter((a) => a.imageId === img.id)
            .forEach((a) => {
              annotations.push({ ...a, reviewer: sub.reviewerName });
            });
        });

        return {
          ...img,
          likes,
          dislikes,
          netScore: likes - dislikes,
          annotations,
        };
      });

      return jsonResponse(200, {
        session: { ...session, reviewerPassword: undefined },
        images: imageStats,
        submissions: submissions.map((s) => ({
          id: s.id,
          reviewerName: s.reviewerName,
          submittedAt: s.submittedAt,
          decisionCount: (s.decisions || []).length,
          annotationCount: (s.annotations || []).length,
          likeCount: (s.decisions || []).filter((d) => d.liked).length,
          dislikeCount: (s.decisions || []).filter((d) => !d.liked).length,
        })),
        reviewLink: `/r/${session.id}`,
      });
    } catch (err) {
      context.error('Session get error:', err);
      return jsonResponse(500, { error: 'Failed to get session' });
    }
  },
});

// PATCH /api/sessions/{id} — Update session status
app.http('sessionsUpdate', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'sessions/{id}',
  handler: async (request, context) => {
    await ensureInit();
    const auth = requireCreator(request);
    if (!auth.valid) return auth;

    const sessionId = request.params.id;

    try {
      const session = await getItem('sessions', sessionId, auth.creator.sub);
      if (!session || session.creatorId !== auth.creator.sub) {
        return jsonResponse(404, { error: 'Session not found' });
      }

      const body = await request.json();
      const allowedUpdates = ['status', 'title', 'maxReviewers', 'deadline'];
      const updates = { updatedAt: new Date().toISOString() };

      allowedUpdates.forEach((key) => {
        if (body[key] !== undefined) updates[key] = body[key];
      });

      const updated = await updateItem('sessions', sessionId, auth.creator.sub, updates);

      return jsonResponse(200, { session: { ...updated, reviewerPassword: undefined } });
    } catch (err) {
      context.error('Session update error:', err);
      return jsonResponse(500, { error: 'Failed to update session' });
    }
  },
});

// DELETE /api/sessions/{id} — Delete a session
app.http('sessionsDelete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'sessions/{id}',
  handler: async (request, context) => {
    await ensureInit();
    const auth = requireCreator(request);
    if (!auth.valid) return auth;

    const sessionId = request.params.id;

    try {
      const session = await getItem('sessions', sessionId, auth.creator.sub);
      if (!session || session.creatorId !== auth.creator.sub) {
        return jsonResponse(404, { error: 'Session not found' });
      }

      await deleteItem('sessions', sessionId, auth.creator.sub);
      return jsonResponse(200, { message: 'Session deleted' });
    } catch (err) {
      context.error('Session delete error:', err);
      return jsonResponse(500, { error: 'Failed to delete session' });
    }
  },
});

// POST /api/sessions/{id}/join — Reviewer joins session
app.http('sessionsJoin', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sessions/{id}/join',
  handler: async (request, context) => {
    await ensureInit();

    const sessionId = request.params.id;

    try {
      // Find session (need to search without partition key)
      const db = require('../services/database');
      const sessions = await db.queryItems(
        'sessions',
        'SELECT * FROM c WHERE c.id = @id',
        [{ name: '@id', value: sessionId }]
      );
      const session = sessions[0];

      if (!session) {
        return jsonResponse(404, { error: 'Session not found' });
      }

      if (session.status !== 'active') {
        return jsonResponse(403, { error: 'This session is no longer accepting reviews' });
      }

      // Check deadline
      if (session.deadline && new Date(session.deadline) < new Date()) {
        return jsonResponse(403, { error: 'This session has expired' });
      }

      const body = await request.json();
      const { reviewerName, password } = body;

      if (!reviewerName || !reviewerName.trim()) {
        return jsonResponse(400, { error: 'Reviewer name is required' });
      }

      // Check password if set
      if (session.reviewerPassword) {
        if (!password) {
          return jsonResponse(401, { error: 'This session requires a password', requiresPassword: true });
        }
        const validPw = await bcrypt.compare(password, session.reviewerPassword);
        if (!validPw) {
          return jsonResponse(401, { error: 'Incorrect session password' });
        }
      }

      // Check if reviewer already submitted
      const existingSub = await db.getSubmissionByReviewer(sessionId, reviewerName.trim());
      if (existingSub) {
        return jsonResponse(409, { error: 'You have already submitted a review for this session' });
      }

      // Check max reviewers
      const subs = await db.getSubmissionsBySession(sessionId);
      if (subs.length >= session.maxReviewers) {
        return jsonResponse(403, { error: 'This session has reached its maximum number of reviewers' });
      }

      // Generate reviewer JWT
      const token = generateReviewerToken(sessionId, reviewerName.trim());

      return jsonResponse(200, {
        token,
        session: {
          id: session.id,
          title: session.title,
          imageCount: session.imageCount,
        },
      });
    } catch (err) {
      context.error('Session join error:', err);
      return jsonResponse(500, { error: 'Failed to join session' });
    }
  },
});

// GET /api/sessions/{id}/export — Creator exports session data
app.http('sessionsExport', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sessions/{id}/export',
  handler: async (request, context) => {
    await ensureInit();
    const auth = requireCreator(request);
    if (!auth.valid) return auth;

    const sessionId = request.params.id;
    const format = request.query.get('format') || 'xlsx';

    try {
      const session = await getItem('sessions', sessionId, auth.creator.sub);
      if (!session || session.creatorId !== auth.creator.sub) {
        return jsonResponse(404, { error: 'Session not found' });
      }

      const images = await getImagesBySession(sessionId);
      const submissions = await getSubmissionsBySession(sessionId);
      const buffer = generateExport(session, images, submissions, format);

      const contentType = format === 'csv'
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const ext = format === 'csv' ? 'csv' : 'xlsx';
      const filename = `${session.title.replace(/[^a-zA-Z0-9]/g, '_')}_results.${ext}`;

      return {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
        body: buffer,
      };
    } catch (err) {
      context.error('Export error:', err);
      return jsonResponse(500, { error: 'Failed to export session data' });
    }
  },
});
