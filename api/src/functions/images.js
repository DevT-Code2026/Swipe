const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const {
  initDatabase,
  createItem,
  getItem,
  updateItem,
  getImagesBySession,
} = require('../services/database');
const { initStorage, uploadImage, generateSignedUrl, getBlobData } = require('../services/storage');
const { requireCreator, requireReviewer, jsonResponse } = require('../middleware/authMiddleware');

let initialized = false;

async function ensureInit() {
  if (!initialized) {
    await initDatabase();
    await initStorage();
    initialized = true;
  }
}

// POST /api/sessions/{id}/images — Creator uploads images
app.http('imagesUpload', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sessions/{id}/images',
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

      // Parse multipart form data manually
      const contentType = request.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        // Handle base64 encoded images
        const body = await request.json();
        const { images } = body; // [{fileName, data (base64), contentType}]

        if (!images || !images.length) {
          return jsonResponse(400, { error: 'No images provided' });
        }

        // Check limit
        const existingImages = await getImagesBySession(sessionId);
        if (existingImages.length + images.length > 100) {
          return jsonResponse(400, { error: 'Maximum 100 images per session' });
        }

        const uploaded = [];
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const buffer = Buffer.from(img.data, 'base64');

          // Check file size (25MB)
          if (buffer.length > 25 * 1024 * 1024) {
            continue; // Skip oversized files
          }

          const { blobUrl, blobName } = await uploadImage(
            sessionId,
            img.fileName,
            buffer,
            img.contentType || 'image/jpeg'
          );

          const imageDoc = {
            id: uuidv4(),
            sessionId,
            blobUrl,
            blobName,
            fileName: img.fileName,
            contentType: img.contentType || 'image/jpeg',
            fileSize: buffer.length,
            order: existingImages.length + i,
            uploadedAt: new Date().toISOString(),
          };

          await createItem('images', imageDoc);
          uploaded.push(imageDoc);
        }

        // Update session image count
        const totalImages = existingImages.length + uploaded.length;
        await updateItem('sessions', sessionId, auth.creator.sub, {
          imageCount: totalImages,
          updatedAt: new Date().toISOString(),
        });

        return jsonResponse(201, {
          uploaded: uploaded.length,
          total: totalImages,
          images: uploaded.map((img) => ({
            id: img.id,
            fileName: img.fileName,
            order: img.order,
          })),
        });
      }

      // Handle raw binary upload (single file)
      const buffer = Buffer.from(await request.arrayBuffer());
      const fileName = request.query.get('fileName') || `image-${Date.now()}.jpg`;
      const fileContentType = contentType.split(';')[0] || 'image/jpeg';

      if (buffer.length > 25 * 1024 * 1024) {
        return jsonResponse(400, { error: 'File too large. Maximum 25MB per image.' });
      }

      const existingImages = await getImagesBySession(sessionId);
      if (existingImages.length >= 100) {
        return jsonResponse(400, { error: 'Maximum 100 images per session' });
      }

      const { blobUrl, blobName } = await uploadImage(sessionId, fileName, buffer, fileContentType);

      const imageDoc = {
        id: uuidv4(),
        sessionId,
        blobUrl,
        blobName,
        fileName,
        contentType: fileContentType,
        fileSize: buffer.length,
        order: existingImages.length,
        uploadedAt: new Date().toISOString(),
      };

      await createItem('images', imageDoc);
      await updateItem('sessions', sessionId, auth.creator.sub, {
        imageCount: existingImages.length + 1,
        updatedAt: new Date().toISOString(),
      });

      return jsonResponse(201, {
        image: {
          id: imageDoc.id,
          fileName: imageDoc.fileName,
          order: imageDoc.order,
        },
      });
    } catch (err) {
      context.error('Image upload error:', err);
      return jsonResponse(500, { error: 'Failed to upload image' });
    }
  },
});

// GET /api/sessions/{id}/images — Get session images (with signed URLs)
app.http('imagesGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sessions/{id}/images',
  handler: async (request, context) => {
    await ensureInit();

    const sessionId = request.params.id;

    // Allow both creator and reviewer access
    const { verifyToken, extractToken } = require('../services/tokenService');
    const token = extractToken(request);
    if (!token) {
      return jsonResponse(401, { error: 'Authentication required' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return jsonResponse(401, { error: 'Invalid or expired token' });
    }

    // If reviewer, verify session scope
    if (decoded.role === 'reviewer' && decoded.sessionId !== sessionId) {
      return jsonResponse(403, { error: 'Not authorized for this session' });
    }

    try {
      const images = await getImagesBySession(sessionId);

      // Generate signed URLs for each image
      const imagesWithUrls = images.map((img) => ({
        id: img.id,
        fileName: img.fileName,
        order: img.order,
        url: generateSignedUrl(img.blobName),
        uploadedAt: img.uploadedAt,
      }));

      return jsonResponse(200, { images: imagesWithUrls });
    } catch (err) {
      context.error('Images get error:', err);
      return jsonResponse(500, { error: 'Failed to get images' });
    }
  },
});

// GET /api/images/blob/{sessionId}/{blobId} - Serve media from database storage
app.http('imagesBlobGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'images/blob/{sessionId}/{blobId}',
  handler: async (request, context) => {
    await ensureInit();

    const blobName = `${request.params.sessionId}/${request.params.blobId}`;

    try {
      const blob = await getBlobData(blobName);
      if (!blob) {
        return jsonResponse(404, { error: 'Image not found' });
      }

      return {
        status: 200,
        headers: {
          'Content-Type': blob.contentType || 'application/octet-stream',
          'Cache-Control': 'private, max-age=900',
        },
        body: blob.data,
      };
    } catch (err) {
      context.error('Blob get error:', err);
      return jsonResponse(500, { error: 'Failed to load image' });
    }
  },
});
