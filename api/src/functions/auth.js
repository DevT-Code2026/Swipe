const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { generateCreatorToken } = require('../services/tokenService');
const { initDatabase, createItem, getCreatorByEmail } = require('../services/database');
const { initStorage } = require('../services/storage');
const { jsonResponse } = require('../middleware/authMiddleware');

let initialized = false;

async function ensureInit() {
  if (!initialized) {
    await initDatabase();
    await initStorage();
    initialized = true;
  }
}

// POST /api/auth/register — Creator registration
app.http('authRegister', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/register',
  handler: async (request, context) => {
    await ensureInit();

    try {
      const body = await request.json();
      const { email, password, name } = body;

      if (!email || !password) {
        return jsonResponse(400, { error: 'Email and password are required' });
      }

      // Check if creator already exists
      const existing = await getCreatorByEmail(email);
      if (existing) {
        return jsonResponse(409, { error: 'An account with this email already exists' });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      const creator = {
        id: uuidv4(),
        email: email.toLowerCase().trim(),
        passwordHash,
        name: name || email.split('@')[0],
        createdAt: new Date().toISOString(),
      };

      await createItem('creators', creator);

      // Generate JWT
      const token = generateCreatorToken(creator.id, creator.email);

      return jsonResponse(201, {
        token,
        creator: {
          id: creator.id,
          email: creator.email,
          name: creator.name,
        },
      });
    } catch (err) {
      context.error('Registration error:', err);
      return jsonResponse(500, { error: 'Registration failed' });
    }
  },
});

// POST /api/auth/login — Creator login
app.http('authLogin', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/login',
  handler: async (request, context) => {
    await ensureInit();

    try {
      const body = await request.json();
      const { email, password } = body;

      if (!email || !password) {
        return jsonResponse(400, { error: 'Email and password are required' });
      }

      const creator = await getCreatorByEmail(email.toLowerCase().trim());
      if (!creator) {
        return jsonResponse(401, { error: 'Invalid email or password' });
      }

      const validPassword = await bcrypt.compare(password, creator.passwordHash);
      if (!validPassword) {
        return jsonResponse(401, { error: 'Invalid email or password' });
      }

      const token = generateCreatorToken(creator.id, creator.email);

      return jsonResponse(200, {
        token,
        creator: {
          id: creator.id,
          email: creator.email,
          name: creator.name,
        },
      });
    } catch (err) {
      context.error('Login error:', err);
      return jsonResponse(500, { error: 'Login failed' });
    }
  },
});

// GET /api/auth/me — Get current creator profile
app.http('authMe', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/me',
  handler: async (request, context) => {
    await ensureInit();
    const { requireCreator } = require('../middleware/authMiddleware');
    const auth = requireCreator(request);
    if (!auth.valid) return auth;

    try {
      const { getItem } = require('../services/database');
      const creator = await getItem('creators', auth.creator.sub, auth.creator.sub);
      if (!creator) {
        return jsonResponse(404, { error: 'Creator not found' });
      }

      return jsonResponse(200, {
        id: creator.id,
        email: creator.email,
        name: creator.name,
      });
    } catch (err) {
      context.error('Auth me error:', err);
      return jsonResponse(500, { error: 'Failed to get profile' });
    }
  },
});
