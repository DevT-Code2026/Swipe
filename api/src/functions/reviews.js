const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const {
  initDatabase,
  createItem,
  getSubmissionByReviewer,
  getSubmissionsBySession,
} = require('../services/database');
const { initStorage } = require('../services/storage');
const { requireReviewer, jsonResponse } = require('../middleware/authMiddleware');

let initialized = false;

async function ensureInit() {
  if (!initialized) {
    await initDatabase();
    await initStorage();
    initialized = true;
  }
}

// POST /api/sessions/{id}/submit — Reviewer submits all decisions + annotations
app.http('reviewSubmit', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sessions/{id}/submit',
  handler: async (request, context) => {
    await ensureInit();

    const sessionId = request.params.id;
    const auth = requireReviewer(request, sessionId);
    if (!auth.valid) return auth;

    try {
      // Check if already submitted
      const existing = await getSubmissionByReviewer(sessionId, auth.reviewer.reviewerName);
      if (existing) {
        return jsonResponse(409, { error: 'You have already submitted your review' });
      }

      const body = await request.json();
      const { decisions, annotations } = body;

      if (!decisions || !Array.isArray(decisions)) {
        return jsonResponse(400, { error: 'Decisions array is required' });
      }

      const submission = {
        id: uuidv4(),
        sessionId,
        reviewerName: auth.reviewer.reviewerName,
        decisions: decisions.map((d) => ({
          imageId: d.imageId,
          liked: !!d.liked,
        })),
        annotations: (annotations || []).map((a) => ({
          imageId: a.imageId,
          x: a.x,
          y: a.y,
          comment: a.comment || '',
          author: auth.reviewer.reviewerName,
          createdAt: a.createdAt || new Date().toISOString(),
        })),
        submittedAt: new Date().toISOString(),
      };

      await createItem('submissions', submission);

      return jsonResponse(201, {
        message: 'Review submitted successfully',
        summary: {
          total: decisions.length,
          liked: decisions.filter((d) => d.liked).length,
          disliked: decisions.filter((d) => !d.liked).length,
          annotations: (annotations || []).length,
        },
      });
    } catch (err) {
      context.error('Submit error:', err);
      return jsonResponse(500, { error: 'Failed to submit review' });
    }
  },
});

// GET /api/sessions/{id}/submissions — Creator views submissions
app.http('submissionsList', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sessions/{id}/submissions',
  handler: async (request, context) => {
    await ensureInit();

    const { requireCreator } = require('../middleware/authMiddleware');
    const auth = requireCreator(request);
    if (!auth.valid) return auth;

    const sessionId = request.params.id;

    try {
      const submissions = await getSubmissionsBySession(sessionId);

      return jsonResponse(200, {
        submissions: submissions.map((s) => ({
          id: s.id,
          reviewerName: s.reviewerName,
          submittedAt: s.submittedAt,
          decisions: s.decisions,
          annotations: s.annotations,
          likeCount: (s.decisions || []).filter((d) => d.liked).length,
          dislikeCount: (s.decisions || []).filter((d) => !d.liked).length,
        })),
      });
    } catch (err) {
      context.error('Submissions list error:', err);
      return jsonResponse(500, { error: 'Failed to list submissions' });
    }
  },
});
