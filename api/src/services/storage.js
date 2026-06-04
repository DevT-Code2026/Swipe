const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const {
  initDatabase,
  saveBlobData,
  getBlobData: getDatabaseBlobData,
  deleteBlobData,
} = require('./database');

const inMemoryBlobs = new Map();
const USE_MEMORY = !(
  process.env.DATABASE_URL ||
  process.env.HOSTINGER_DB_HOST ||
  process.env.MYSQL_HOST ||
  process.env.DB_HOST
);

async function initStorage() {
  if (USE_MEMORY) {
    console.log('[Storage] Using in-memory media store (no MySQL database configured)');
    return;
  }

  await initDatabase();
  console.log('[Storage] MySQL media storage initialized');
}

function createBlobName(sessionId, fileName) {
  const ext = path.extname(fileName) || '.jpg';
  return `${sessionId}/${uuidv4()}${ext}`;
}

function publicBlobUrl(blobName) {
  return `/api/images/blob/${blobName}`;
}

async function saveBlob(blobName, buffer, contentType) {
  if (USE_MEMORY) {
    inMemoryBlobs.set(blobName, { data: buffer, contentType });
    return;
  }

  await saveBlobData(blobName, buffer, contentType);
}

async function uploadImage(sessionId, fileName, buffer, contentType) {
  const blobName = createBlobName(sessionId, fileName);
  await saveBlob(blobName, buffer, contentType);

  return {
    blobUrl: publicBlobUrl(blobName),
    blobName,
  };
}

async function uploadImageFile(sessionId, fileName, filePath, contentType) {
  const buffer = await fs.promises.readFile(filePath);
  return uploadImage(sessionId, fileName, buffer, contentType);
}

function generateSignedUrl(blobName) {
  return publicBlobUrl(blobName);
}

async function deleteBlob(blobName) {
  if (USE_MEMORY) {
    inMemoryBlobs.delete(blobName);
    return;
  }

  await deleteBlobData(blobName);
}

async function getBlobData(blobName) {
  if (USE_MEMORY) {
    return inMemoryBlobs.get(blobName) || null;
  }

  return getDatabaseBlobData(blobName);
}

module.exports = {
  initStorage,
  uploadImage,
  uploadImageFile,
  generateSignedUrl,
  deleteBlob,
  getBlobData,
};
