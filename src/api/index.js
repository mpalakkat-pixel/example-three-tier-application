const express = require('express');
const db = require('./db');
const {
  parsePaginationParams,
  buildPaginatedQuery,
  getPaginationParams,
  buildPaginationMeta
} = require('./pagination');

const app = express();
const PORT = process.env.PORT || 3001;

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

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/healthz', (_req, res) => {
  res.json({ service: 'api' });
});

// GET /readyz — check database readiness
app.get('/readyz', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ready', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'unavailable', database: 'disconnected', error: error.message });
  }
});

// GET /tasks — list all tasks with pagination
app.get('/tasks', async (req, res) => {
  try {
    const { offset, limit } = parsePaginationParams(req.query);
    
    // Get total count
    const countResult = await db.query('SELECT COUNT(*) as count FROM tasks');
    const total = parseInt(countResult.rows[0].count, 10);
    
    // Get paginated results
    const paginatedQuery = buildPaginatedQuery(
      'SELECT * FROM tasks ORDER BY created_at ASC',
      offset,
      limit
    );
    const params = getPaginationParams(offset, limit);
    const { rows } = await db.query(paginatedQuery, params);
    
    // Build response with pagination metadata
    const pagination = buildPaginationMeta(offset, limit, total);
    res.json({
      data: rows,
      pagination
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /tasks — create a task
app.post('/tasks', async (req, res) => {
  const { title } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  const { rows } = await db.query(
    'INSERT INTO tasks (title) VALUES ($1) RETURNING *',
    [title.trim()]
  );
  res.status(201).json(rows[0]);
});

// PATCH /tasks/:id — update a task (complete/uncomplete or rename)
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
  res.json(updated[0]);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`API listening on port ${PORT}`);
  });
}

module.exports = app;
