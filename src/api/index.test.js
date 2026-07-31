const request = require('supertest');
const app = require('./index');
const db = require('./db');

jest.mock('./db');

describe('GET /healthz', () => {
  it('should return HTTP 200 with service name', async () => {
    const response = await request(app)
      .get('/healthz')
      .expect(200);

    expect(response.body).toEqual({ service: 'api' });
  });

  it('should return JSON content type', async () => {
    const response = await request(app)
      .get('/healthz')
      .expect('Content-Type', /json/);

    expect(response.status).toBe(200);
  });
});

describe('GET /readyz', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return HTTP 200 when database is available', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    const response = await request(app)
      .get('/readyz')
      .expect(200);

    expect(response.body).toEqual({ status: 'ready', database: 'connected' });
    expect(db.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('should return HTTP 503 when database is unavailable', async () => {
    const dbError = new Error('Connection refused');
    db.query.mockRejectedValueOnce(dbError);

    const response = await request(app)
      .get('/readyz')
      .expect(503);

    expect(response.body).toEqual({
      status: 'unavailable',
      database: 'disconnected',
      error: 'Connection refused'
    });
    expect(db.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('should return JSON content type', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    const response = await request(app)
      .get('/readyz')
      .expect('Content-Type', /json/);

    expect(response.status).toBe(200);
  });

  it('should return 503 with error message when database query fails', async () => {
    const dbError = new Error('ECONNREFUSED: Connection refused');
    db.query.mockRejectedValueOnce(dbError);

    const response = await request(app)
      .get('/readyz')
      .expect(503);

    expect(response.body.status).toBe('unavailable');
    expect(response.body.database).toBe('disconnected');
    expect(response.body.error).toBe('ECONNREFUSED: Connection refused');
  });
});

describe('Request logging middleware', () => {
  let consoleLogSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('should log request with method, path, statusCode, and duration', async () => {
    await request(app)
      .get('/healthz')
      .expect(200);

    expect(consoleLogSpy).toHaveBeenCalled();
    const logCall = consoleLogSpy.mock.calls.find(call => {
      try {
        JSON.parse(call[0]);
        return true;
      } catch {
        return false;
      }
    });

    expect(logCall).toBeDefined();
    const logEntry = JSON.parse(logCall[0]);
    
    expect(logEntry).toHaveProperty('method');
    expect(logEntry).toHaveProperty('path');
    expect(logEntry).toHaveProperty('statusCode');
    expect(logEntry).toHaveProperty('duration');
  });

  it('should log correct method and path', async () => {
    await request(app)
      .get('/healthz')
      .expect(200);

    const logCall = consoleLogSpy.mock.calls.find(call => {
      try {
        const parsed = JSON.parse(call[0]);
        return parsed.path === '/healthz';
      } catch {
        return false;
      }
    });

    const logEntry = JSON.parse(logCall[0]);
    expect(logEntry.method).toBe('GET');
    expect(logEntry.path).toBe('/healthz');
  });

  it('should log correct status code for successful request', async () => {
    await request(app)
      .get('/healthz')
      .expect(200);

    const logCall = consoleLogSpy.mock.calls.find(call => {
      try {
        const parsed = JSON.parse(call[0]);
        return parsed.path === '/healthz';
      } catch {
        return false;
      }
    });

    const logEntry = JSON.parse(logCall[0]);
    expect(logEntry.statusCode).toBe(200);
  });

  it('should log correct status code for error request', async () => {
    db.query.mockRejectedValueOnce(new Error('Connection refused'));

    await request(app)
      .get('/readyz')
      .expect(503);

    const logCall = consoleLogSpy.mock.calls.find(call => {
      try {
        const parsed = JSON.parse(call[0]);
        return parsed.path === '/readyz' && parsed.statusCode === 503;
      } catch {
        return false;
      }
    });

    const logEntry = JSON.parse(logCall[0]);
    expect(logEntry.statusCode).toBe(503);
  });

  it('should log duration as a number', async () => {
    await request(app)
      .get('/healthz')
      .expect(200);

    const logCall = consoleLogSpy.mock.calls.find(call => {
      try {
        JSON.parse(call[0]);
        return true;
      } catch {
        return false;
      }
    });

    const logEntry = JSON.parse(logCall[0]);
    expect(typeof logEntry.duration).toBe('number');
    expect(logEntry.duration).toBeGreaterThanOrEqual(0);
  });

  it('should log as valid JSON', async () => {
    await request(app)
      .get('/healthz')
      .expect(200);

    const logCall = consoleLogSpy.mock.calls.find(call => {
      try {
        JSON.parse(call[0]);
        return true;
      } catch {
        return false;
      }
    });

    expect(logCall).toBeDefined();
    expect(() => JSON.parse(logCall[0])).not.toThrow();
  });

  it('should log POST request with correct method', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Test', completed: false }] });

    await request(app)
      .post('/tasks')
      .send({ title: 'Test Task' })
      .expect(201);

    const logCall = consoleLogSpy.mock.calls.find(call => {
      try {
        const parsed = JSON.parse(call[0]);
        return parsed.path === '/tasks' && parsed.method === 'POST';
      } catch {
        return false;
      }
    });

    const logEntry = JSON.parse(logCall[0]);
    expect(logEntry.method).toBe('POST');
    expect(logEntry.statusCode).toBe(201);
  });
});

describe('GET /tasks - Pagination', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return paginated tasks with default offset and limit', async () => {
    const mockTasks = [
      { id: 1, title: 'Task 1', completed: false, created_at: '2024-01-01' },
      { id: 2, title: 'Task 2', completed: false, created_at: '2024-01-02' }
    ];

    db.query
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks')
      .expect(200);

    expect(response.body).toHaveProperty('items');
    expect(response.body).toHaveProperty('pagination');
    expect(response.body.items).toEqual(mockTasks);
    expect(response.body.pagination).toEqual({
      offset: 0,
      limit: 20,
      total: 50,
      hasMore: true
    });
  });

  it('should use default limit of 20 when not specified', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '100' }] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/tasks')
      .expect(200);

    expect(db.query).toHaveBeenCalledWith(
      'SELECT * FROM tasks ORDER BY created_at ASC LIMIT $1 OFFSET $2',
      [20, 0]
    );
  });

  it('should use default offset of 0 when not specified', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '100' }] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/tasks?limit=10')
      .expect(200);

    expect(db.query).toHaveBeenCalledWith(
      'SELECT * FROM tasks ORDER BY created_at ASC LIMIT $1 OFFSET $2',
      [10, 0]
    );
  });

  it('should accept custom offset and limit', async () => {
    const mockTasks = [
      { id: 21, title: 'Task 21', completed: false, created_at: '2024-01-21' }
    ];

    db.query
      .mockResolvedValueOnce({ rows: [{ count: '100' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks?offset=20&limit=10')
      .expect(200);

    expect(response.body.pagination).toEqual({
      offset: 20,
      limit: 10,
      total: 100,
      hasMore: true
    });

    expect(db.query).toHaveBeenCalledWith(
      'SELECT * FROM tasks ORDER BY created_at ASC LIMIT $1 OFFSET $2',
      [10, 20]
    );
  });

  it('should enforce maximum limit of 100', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '500' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/tasks?limit=200')
      .expect(200);

    expect(response.body.pagination.limit).toBe(100);

    expect(db.query).toHaveBeenCalledWith(
      'SELECT * FROM tasks ORDER BY created_at ASC LIMIT $1 OFFSET $2',
      [100, 0]
    );
  });

  it('should handle limit exactly at maximum (100)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '500' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/tasks?limit=100')
      .expect(200);

    expect(response.body.pagination.limit).toBe(100);
  });

  it('should handle invalid offset (non-numeric)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/tasks?offset=abc')
      .expect(200);

    expect(response.body.pagination.offset).toBe(0);
  });

  it('should handle invalid limit (non-numeric)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/tasks?limit=xyz')
      .expect(200);

    expect(response.body.pagination.limit).toBe(20);
  });

  it('should handle negative offset by using 0', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/tasks?offset=-5')
      .expect(200);

    expect(response.body.pagination.offset).toBe(0);
  });

  it('should handle negative limit by using default', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/tasks?limit=-10')
      .expect(200);

    expect(response.body.pagination.limit).toBe(20);
  });

  it('should handle zero limit by using default', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/tasks?limit=0')
      .expect(200);

    expect(response.body.pagination.limit).toBe(20);
  });

  it('should correctly calculate hasMore when at end of results', async () => {
    const mockTasks = [
      { id: 41, title: 'Task 41', completed: false, created_at: '2024-01-41' },
      { id: 42, title: 'Task 42', completed: false, created_at: '2024-01-42' }
    ];

    db.query
      .mockResolvedValueOnce({ rows: [{ count: '42' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks?offset=40&limit=10')
      .expect(200);

    expect(response.body.pagination.hasMore).toBe(false);
  });

  it('should correctly calculate hasMore when more results exist', async () => {
    const mockTasks = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      title: `Task ${i + 1}`,
      completed: false,
      created_at: `2024-01-${String(i + 1).padStart(2, '0')}`
    }));

    db.query
      .mockResolvedValueOnce({ rows: [{ count: '100' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks?offset=0&limit=20')
      .expect(200);

    expect(response.body.pagination.hasMore).toBe(true);
  });

  it('should handle empty result set', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/tasks')
      .expect(200);

    expect(response.body.items).toEqual([]);
    expect(response.body.pagination).toEqual({
      offset: 0,
      limit: 20,
      total: 0,
      hasMore: false
    });
  });

  it('should handle database error gracefully', async () => {
    db.query.mockRejectedValueOnce(new Error('Database connection failed'));

    const response = await request(app)
      .get('/tasks')
      .expect(500);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toBe('Failed to fetch tasks');
    expect(response.body).toHaveProperty('details');
  });

  it('should return correct response structure', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '10' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/tasks')
      .expect(200);

    expect(response.body).toHaveProperty('items');
    expect(response.body).toHaveProperty('pagination');
    expect(response.body.pagination).toHaveProperty('offset');
    expect(response.body.pagination).toHaveProperty('limit');
    expect(response.body.pagination).toHaveProperty('total');
    expect(response.body.pagination).toHaveProperty('hasMore');
  });

  it('should handle large offset beyond total count', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/tasks?offset=1000&limit=20')
      .expect(200);

    expect(response.body.items).toEqual([]);
    expect(response.body.pagination.offset).toBe(1000);
    expect(response.body.pagination.hasMore).toBe(false);
  });

  it('should handle float values for offset and limit', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '100' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/tasks?offset=10.5&limit=15.7')
      .expect(200);

    expect(response.body.pagination.offset).toBe(10);
    expect(response.body.pagination.limit).toBe(15);
  });

  it('should maintain order by created_at ASC', async () => {
    const mockTasks = [
      { id: 1, title: 'Task 1', completed: false, created_at: '2024-01-01' },
      { id: 2, title: 'Task 2', completed: false, created_at: '2024-01-02' },
      { id: 3, title: 'Task 3', completed: false, created_at: '2024-01-03' }
    ];

    db.query
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks')
      .expect(200);

    expect(response.body.items).toEqual(mockTasks);
    expect(db.query).toHaveBeenCalledWith(
      'SELECT * FROM tasks ORDER BY created_at ASC LIMIT $1 OFFSET $2',
      [20, 0]
    );
  });
});
