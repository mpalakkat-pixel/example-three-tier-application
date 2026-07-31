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

describe('GET /tasks with pagination', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return paginated tasks with default page and limit', async () => {
    const mockTasks = [
      { id: 1, title: 'Task 1', completed: false, created_at: '2024-01-01' },
      { id: 2, title: 'Task 2', completed: false, created_at: '2024-01-02' }
    ];

    db.query
      .mockResolvedValueOnce({ rows: [{ total: '15' }] }) // count query
      .mockResolvedValueOnce({ rows: mockTasks }); // data query

    const response = await request(app)
      .get('/tasks')
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('pagination');
    expect(response.body.data).toEqual(mockTasks);
    expect(response.body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 15,
      totalPages: 2
    });
  });

  it('should accept custom page and limit parameters', async () => {
    const mockTasks = [
      { id: 11, title: 'Task 11', completed: false, created_at: '2024-01-11' },
      { id: 12, title: 'Task 12', completed: false, created_at: '2024-01-12' }
    ];

    db.query
      .mockResolvedValueOnce({ rows: [{ total: '25' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks?page=2&limit=5')
      .expect(200);

    expect(response.body.pagination).toEqual({
      page: 2,
      limit: 5,
      total: 25,
      totalPages: 5
    });

    // Verify the query was called with correct offset
    expect(db.query).toHaveBeenCalledWith(
      'SELECT * FROM tasks ORDER BY created_at ASC LIMIT $1 OFFSET $2',
      [5, 5] // limit=5, offset=(2-1)*5=5
    );
  });

  it('should cap limit at 100', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: '200' }] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/tasks?limit=500')
      .expect(200);

    expect(db.query).toHaveBeenCalledWith(
      'SELECT * FROM tasks ORDER BY created_at ASC LIMIT $1 OFFSET $2',
      [100, 0] // limit capped at 100
    );
  });

  it('should default to page 1 if page is less than 1', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: '10' }] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/tasks?page=0')
      .expect(200);

    expect(db.query).toHaveBeenCalledWith(
      'SELECT * FROM tasks ORDER BY created_at ASC LIMIT $1 OFFSET $2',
      [10, 0] // offset should be 0 for page 1
    );
  });

  it('should default to limit 10 if limit is less than 1', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: '10' }] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/tasks?limit=0')
      .expect(200);

    expect(db.query).toHaveBeenCalledWith(
      'SELECT * FROM tasks ORDER BY created_at ASC LIMIT $1 OFFSET $2',
      [10, 0] // limit should default to 10
    );
  });

  it('should handle non-numeric page and limit gracefully', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: '10' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/tasks?page=abc&limit=xyz')
      .expect(200);

    expect(response.body.pagination.page).toBe(1);
    expect(response.body.pagination.limit).toBe(10);
  });

  it('should calculate totalPages correctly', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: '23' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/tasks?limit=5')
      .expect(200);

    // 23 items with limit 5 = 5 pages (5+5+5+5+3)
    expect(response.body.pagination.totalPages).toBe(5);
  });

  it('should return empty data array when no tasks exist', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/tasks')
      .expect(200);

    expect(response.body.data).toEqual([]);
    expect(response.body.pagination.total).toBe(0);
    expect(response.body.pagination.totalPages).toBe(0);
  });

  it('should handle database errors gracefully', async () => {
    const dbError = new Error('Database connection failed');
    db.query.mockRejectedValueOnce(dbError);

    const response = await request(app)
      .get('/tasks')
      .expect(500);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toBe('Failed to fetch tasks');
    expect(response.body).toHaveProperty('details');
  });

  it('should return correct pagination for last page with partial results', async () => {
    const mockTasks = [
      { id: 21, title: 'Task 21', completed: false, created_at: '2024-01-21' },
      { id: 22, title: 'Task 22', completed: false, created_at: '2024-01-22' },
      { id: 23, title: 'Task 23', completed: false, created_at: '2024-01-23' }
    ];

    db.query
      .mockResolvedValueOnce({ rows: [{ total: '23' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks?page=5&limit=5')
      .expect(200);

    expect(response.body.data).toHaveLength(3);
    expect(response.body.pagination).toEqual({
      page: 5,
      limit: 5,
      total: 23,
      totalPages: 5
    });
  });
});
