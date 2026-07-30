const express = require('express');
const NodeCache = require('node-cache');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize cache with 30 second TTL (stdTTL)
const cache = new NodeCache({ stdTTL: 30 });

app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Capture the original res.end method
  const originalEnd = res.end;
  
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    const logEntry = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration
    };
    console.log(JSON.stringify(logEntry));
    
    // Call the original end method
    originalEnd.apply(res, args);
  };
  
  next();
});

// Caching middleware for GET requests
const cacheMiddleware = (req, res, next) => {
  // Only cache GET requests
  if (req.method !== 'GET') {
    return next();
  }

  const cacheKey = req.originalUrl || req.url;
  const cachedResponse = cache.get(cacheKey);

  if (cachedResponse) {
    return res.json(cachedResponse);
  }

  // Intercept res.json to cache the response
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    cache.set(cacheKey, data);
    return originalJson(data);
  };

  next();
};

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/healthz', (_req, res) => {
  res.json({ service: 'api' });
});

// GET /readyz — check database readiness (no caching for health checks)
app.get('/readyz', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ready', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'unavailable', database: 'disconnected', error: error.message });
  }
});

// GET /tasks — list all tasks (with caching)
app.get('/tasks', cacheMiddleware, async (_req, res) => {
  const { rows } = await db.query('SELECT * FROM tasks ORDER BY created_at ASC');
  res.json(rows);
});

// POST /tasks — create a task (invalidates cache)
app.post('/tasks', async (req, res) => {
  const { title } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  const { rows } = await db.query(
    'INSERT INTO tasks (title) VALUES ($1) RETURNING *',
    [title.trim()]
  );
  // Invalidate the tasks cache
  cache.del('/tasks');
  res.status(201).json(rows[0]);
});

// PATCH /tasks/:id — update a task (complete/uncomplete or rename, invalidates cache)
app.patch('/tasks/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { completed, title } = req.body;

  const { rows } = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });

  const current = rows[0];
  const newCompleted = completed !== undefined ? Boolean(completed) : current.completed;
  const newTitle = title !== undefined ? title.trim() : current.title;

  const { rows: updated } = await db.query(
    'UPDATE tasks SET completed = $1, title = $2 WHERE id = $3 RETURNING *',
    [newCompleted, newTitle, id]
  );
  // Invalidate the tasks cache
  cache.del('/tasks');
  res.json(updated[0]);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`API listening on port ${PORT}`);
  });
}

module.exports = app;
module.exports.cache = cache;
