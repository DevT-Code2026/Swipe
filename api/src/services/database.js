const mysql = require('mysql2/promise');

let pool = null;
let initialized = false;

const tables = {
  creators: {
    indexes: {
      email: (item) => normalizeEmail(item.email),
    },
  },
  reviewers: {
    indexes: {
      email: (item) => normalizeEmail(item.email),
    },
  },
  reviewerAssignments: {
    indexes: {
      reviewerId: (item) => item.reviewerId || null,
      sessionId: (item) => item.sessionId || null,
    },
  },
  sessions: {
    indexes: {
      creatorId: (item) => item.creatorId || null,
    },
  },
  images: {
    indexes: {
      sessionId: (item) => item.sessionId || null,
      orderNum: (item) => Number.isFinite(Number(item.order)) ? Number(item.order) : 0,
    },
  },
  submissions: {
    indexes: {
      sessionId: (item) => item.sessionId || null,
      reviewerEmail: (item) => normalizeEmail(item.reviewerEmail),
      reviewerName: (item) => normalizeText(item.reviewerName),
    },
  },
};

const inMemoryStore = {
  creators: [],
  reviewers: [],
  reviewerAssignments: [],
  sessions: [],
  images: [],
  submissions: [],
};

function getDatabaseConfig() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.HOSTINGER_DB_HOST || process.env.MYSQL_HOST || process.env.DB_HOST;
  const user = process.env.HOSTINGER_DB_USER || process.env.MYSQL_USER || process.env.DB_USER;
  const password = process.env.HOSTINGER_DB_PASSWORD || process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD;
  const database = process.env.HOSTINGER_DB_NAME || process.env.MYSQL_DATABASE || process.env.DB_NAME;

  if (!host || !user || !database) {
    return null;
  }

  return {
    host,
    user,
    password: password || '',
    database,
    port: Number(process.env.HOSTINGER_DB_PORT || process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    ssl: parseBoolean(process.env.MYSQL_SSL) ? { rejectUnauthorized: true } : undefined,
  };
}

const USE_MEMORY = !getDatabaseConfig();

function normalizeEmail(value) {
  return String(value || '').toLowerCase().trim() || null;
}

function normalizeText(value) {
  return String(value || '').trim() || null;
}

function parseItem(row) {
  if (!row) return null;
  if (typeof row.data === 'object') return row.data;
  return JSON.parse(row.data);
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function assertContainer(containerName) {
  if (!tables[containerName]) {
    throw new Error(`Unknown database container: ${containerName}`);
  }
}

async function initDatabase() {
  if (initialized) return;

  if (USE_MEMORY) {
    console.log('[DB] Using in-memory store (no MySQL database configured)');
    initialized = true;
    return;
  }

  const databaseConfig = getDatabaseConfig();
  const poolConfig = typeof databaseConfig === 'string'
    ? databaseConfig
    : {
        ...databaseConfig,
        waitForConnections: true,
        connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 5),
        queueLimit: 0,
        charset: 'utf8mb4',
      };

  pool = mysql.createPool(poolConfig);

  for (const tableName of Object.keys(tables)) {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS \`${tableName}\` (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        data LONGTEXT NOT NULL,
        email VARCHAR(255) NULL,
        reviewerId VARCHAR(64) NULL,
        sessionId VARCHAR(64) NULL,
        creatorId VARCHAR(64) NULL,
        reviewerEmail VARCHAR(255) NULL,
        reviewerName VARCHAR(255) NULL,
        orderNum INT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_reviewer_id (reviewerId),
        INDEX idx_session_id (sessionId),
        INDEX idx_creator_id (creatorId),
        INDEX idx_reviewer_email (reviewerEmail),
        INDEX idx_reviewer_name (reviewerName),
        INDEX idx_order_num (orderNum)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS media_blobs (
      blobName VARCHAR(255) NOT NULL PRIMARY KEY,
      data LONGBLOB NOT NULL,
      contentType VARCHAR(255) NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  initialized = true;
  console.log('[DB] MySQL database initialized');
}

function buildIndexColumns(containerName, item) {
  const table = tables[containerName];
  const values = {
    email: null,
    reviewerId: null,
    sessionId: null,
    creatorId: null,
    reviewerEmail: null,
    reviewerName: null,
    orderNum: null,
  };

  for (const [column, getter] of Object.entries(table.indexes)) {
    values[column] = getter(item);
  }

  return values;
}

async function createItem(containerName, item) {
  assertContainer(containerName);

  if (USE_MEMORY) {
    inMemoryStore[containerName].push(item);
    return item;
  }

  const indexed = buildIndexColumns(containerName, item);
  await pool.execute(
    `INSERT INTO \`${containerName}\`
      (id, data, email, reviewerId, sessionId, creatorId, reviewerEmail, reviewerName, orderNum)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      JSON.stringify(item),
      indexed.email,
      indexed.reviewerId,
      indexed.sessionId,
      indexed.creatorId,
      indexed.reviewerEmail,
      indexed.reviewerName,
      indexed.orderNum,
    ]
  );

  return item;
}

async function getItem(containerName, id) {
  assertContainer(containerName);

  if (USE_MEMORY) {
    return inMemoryStore[containerName].find((item) => item.id === id) || null;
  }

  const [rows] = await pool.execute(`SELECT data FROM \`${containerName}\` WHERE id = ? LIMIT 1`, [id]);
  return parseItem(rows[0]);
}

function matchesParameters(item, parameters) {
  return parameters.every((param) => {
    const key = param.name.replace('@', '');
    return item[key] === param.value;
  });
}

async function queryItems(containerName, query, parameters = []) {
  assertContainer(containerName);

  if (USE_MEMORY) {
    return inMemoryStore[containerName].filter((item) => matchesParameters(item, parameters));
  }

  const whereParts = [];
  const values = [];
  const columnMap = {
    id: 'id',
    email: 'email',
    reviewerId: 'reviewerId',
    sessionId: 'sessionId',
    creatorId: 'creatorId',
    reviewerEmail: 'reviewerEmail',
    reviewerName: 'reviewerName',
  };

  for (const param of parameters) {
    const key = param.name.replace('@', '');
    const column = columnMap[key];
    if (column) {
      whereParts.push(`${column} = ?`);
      values.push(param.value);
    }
  }

  const orderBy = /ORDER BY/i.test(query) && containerName === 'images' ? ' ORDER BY orderNum ASC' : '';
  const sql = `SELECT data FROM \`${containerName}\`${whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : ''}${orderBy}`;
  const [rows] = await pool.execute(sql, values);
  return rows.map(parseItem);
}

async function updateItem(containerName, id, partitionKey, updates) {
  assertContainer(containerName);

  if (USE_MEMORY) {
    const idx = inMemoryStore[containerName].findIndex((item) => item.id === id);
    if (idx >= 0) {
      inMemoryStore[containerName][idx] = { ...inMemoryStore[containerName][idx], ...updates };
      return inMemoryStore[containerName][idx];
    }
    return null;
  }

  const existing = await getItem(containerName, id, partitionKey);
  if (!existing) return null;

  const updated = { ...existing, ...updates };
  const indexed = buildIndexColumns(containerName, updated);

  await pool.execute(
    `UPDATE \`${containerName}\`
     SET data = ?, email = ?, reviewerId = ?, sessionId = ?, creatorId = ?,
         reviewerEmail = ?, reviewerName = ?, orderNum = ?
     WHERE id = ?`,
    [
      JSON.stringify(updated),
      indexed.email,
      indexed.reviewerId,
      indexed.sessionId,
      indexed.creatorId,
      indexed.reviewerEmail,
      indexed.reviewerName,
      indexed.orderNum,
      id,
    ]
  );

  return updated;
}

async function deleteItem(containerName, id) {
  assertContainer(containerName);

  if (USE_MEMORY) {
    inMemoryStore[containerName] = inMemoryStore[containerName].filter((item) => item.id !== id);
    return true;
  }

  await pool.execute(`DELETE FROM \`${containerName}\` WHERE id = ?`, [id]);
  return true;
}

async function getSessionsByCreator(creatorId) {
  return queryItems('sessions', 'SELECT * FROM c WHERE c.creatorId = @creatorId', [
    { name: '@creatorId', value: creatorId },
  ]);
}

async function getImagesBySession(sessionId) {
  const items = await queryItems('images', 'SELECT * FROM c WHERE c.sessionId = @sessionId ORDER BY c["order"]', [
    { name: '@sessionId', value: sessionId },
  ]);
  return items.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

async function getSubmissionsBySession(sessionId) {
  return queryItems('submissions', 'SELECT * FROM c WHERE c.sessionId = @sessionId', [
    { name: '@sessionId', value: sessionId },
  ]);
}

async function getSubmissionsByReviewerEmail(reviewerEmail) {
  const normalizedEmail = normalizeEmail(reviewerEmail);
  if (!normalizedEmail) return [];
  return queryItems('submissions', 'SELECT * FROM c WHERE c.reviewerEmail = @reviewerEmail', [
    { name: '@reviewerEmail', value: normalizedEmail },
  ]);
}

async function getSubmissionsByReviewerName(reviewerName) {
  const normalizedName = normalizeText(reviewerName);
  if (!normalizedName) return [];
  return queryItems('submissions', 'SELECT * FROM c WHERE c.reviewerName = @reviewerName', [
    { name: '@reviewerName', value: normalizedName },
  ]);
}

async function getSubmissionByReviewer(sessionId, reviewerName) {
  const items = await queryItems(
    'submissions',
    'SELECT * FROM c WHERE c.sessionId = @sessionId AND c.reviewerName = @reviewerName',
    [
      { name: '@sessionId', value: sessionId },
      { name: '@reviewerName', value: normalizeText(reviewerName) },
    ]
  );
  return items[0] || null;
}

async function getSubmissionByReviewerEmail(sessionId, reviewerEmail) {
  const normalizedEmail = normalizeEmail(reviewerEmail);
  if (!normalizedEmail) return null;
  const items = await queryItems(
    'submissions',
    'SELECT * FROM c WHERE c.sessionId = @sessionId AND c.reviewerEmail = @reviewerEmail',
    [
      { name: '@sessionId', value: sessionId },
      { name: '@reviewerEmail', value: normalizedEmail },
    ]
  );
  return items[0] || null;
}

async function getCreatorByEmail(email) {
  const items = await queryItems('creators', 'SELECT * FROM c WHERE c.email = @email', [
    { name: '@email', value: normalizeEmail(email) },
  ]);
  return items[0] || null;
}

async function getReviewerByEmail(email) {
  const items = await queryItems('reviewers', 'SELECT * FROM c WHERE c.email = @email', [
    { name: '@email', value: normalizeEmail(email) },
  ]);
  return items[0] || null;
}

async function getReviewerAssignments(reviewerId) {
  return queryItems('reviewerAssignments', 'SELECT * FROM c WHERE c.reviewerId = @reviewerId', [
    { name: '@reviewerId', value: reviewerId },
  ]);
}

async function getReviewerAssignment(reviewerId, sessionId) {
  const items = await queryItems(
    'reviewerAssignments',
    'SELECT * FROM c WHERE c.reviewerId = @reviewerId AND c.sessionId = @sessionId',
    [
      { name: '@reviewerId', value: reviewerId },
      { name: '@sessionId', value: sessionId },
    ]
  );
  return items[0] || null;
}

async function saveBlobData(blobName, buffer, contentType) {
  if (USE_MEMORY) return null;

  await pool.execute(
    `INSERT INTO media_blobs (blobName, data, contentType)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE data = VALUES(data), contentType = VALUES(contentType)`,
    [blobName, buffer, contentType]
  );

  return { blobName, contentType };
}

async function getBlobData(blobName) {
  if (USE_MEMORY) return null;

  const [rows] = await pool.execute(
    'SELECT data, contentType FROM media_blobs WHERE blobName = ? LIMIT 1',
    [blobName]
  );
  if (!rows[0]) return null;

  return {
    data: rows[0].data,
    contentType: rows[0].contentType,
  };
}

async function deleteBlobData(blobName) {
  if (USE_MEMORY) return;
  await pool.execute('DELETE FROM media_blobs WHERE blobName = ?', [blobName]);
}

module.exports = {
  initDatabase,
  createItem,
  getItem,
  queryItems,
  updateItem,
  deleteItem,
  getSessionsByCreator,
  getImagesBySession,
  getSubmissionsBySession,
  getSubmissionsByReviewerEmail,
  getSubmissionsByReviewerName,
  getSubmissionByReviewer,
  getSubmissionByReviewerEmail,
  getCreatorByEmail,
  getReviewerByEmail,
  getReviewerAssignments,
  getReviewerAssignment,
  saveBlobData,
  getBlobData,
  deleteBlobData,
};
