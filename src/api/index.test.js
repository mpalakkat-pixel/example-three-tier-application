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
      .mockResolvedValueOnce({ rows: [{ count: '50' }] }) // count query
      .mockResolvedValueOnce({ rows: mockTasks }); // paginated query

    const response = await request(app)
      .get('/tasks')
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('pagination');
    expect(response.body.data).toEqual(mockTasks);
    expect(response.body.pagination).toEqual({
      offset: 0,
      limit: 20,
      total: 50,
      hasMore: true
    });
  });

  it('should accept custom offset parameter', async () => {
    const mockTasks = [
      { id: 21, title: 'Task 21', completed: false, created_at: '2024-01-21' }
    ];

    db.query
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks?offset=20')
      .expect(200);

    expect(response.body.pagination.offset).toBe(20);
    expect(response.body.pagination.limit).toBe(20);
    expect(response.body.data).toEqual(mockTasks);
    
    // Verify the query was called with correct parameters
    const paginationCall = db.query.mock.calls[1];
    expect(paginationCall[1]).toEqual([20, 20]); // [limit, offset]
  });

  it('should accept custom limit parameter', async () => {
    const mockTasks = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      title: `Task ${i + 1}`,
      completed: false,
      created_at: `2024-01-0${i + 1}`
    }));

    db.query
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks?limit=10')
      .expect(200);

    expect(response.body.pagination.limit).toBe(10);
    expect(response.body.pagination.offset).toBe(0);
    expect(response.body.data).toEqual(mockTasks);
  });

  it('should accept both offset and limit parameters', async () => {
    const mockTasks = [
      { id: 31, title: 'Task 31', completed: false, created_at: '2024-01-31' }
    ];

    db.query
      .mockResolvedValueOnce({ rows: [{ count: '100' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks?offset=30&limit=15')
      .expect(200);

    expect(response.body.pagination.offset).toBe(30);
    expect(response.body.pagination.limit).toBe(15);
    expect(response.body.pagination.total).toBe(100);
    
    const paginationCall = db.query.mock.calls[1];
    expect(paginationCall[1]).toEqual([15, 30]); // [limit, offset]
  });

  it('should enforce maximum limit of 100', async () => {
    const mockTasks = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      title: `Task ${i + 1}`,
      completed: false,
      created_at: `2024-01-01`
    }));

    db.query
      .mockResolvedValueOnce({ rows: [{ count: '500' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks?limit=200')
      .expect(200);

    expect(response.body.pagination.limit).toBe(100);
    
    const paginationCall = db.query.mock.calls[1];
    expect(paginationCall[1][0]).toBe(100); // limit should be capped at 100
  });

  it('should handle negative offset by treating as 0', async () => {
    const mockTasks = [
      { id: 1, title: 'Task 1', completed: false, created_at: '2024-01-01' }
    ];

    db.query
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks?offset=-10')
      .expect(200);

    expect(response.body.pagination.offset).toBe(0);
    
    const paginationCall = db.query.mock.calls[1];
    expect(paginationCall[1][1]).toBe(0); // offset should be 0
  });

  it('should handle negative limit by using default', async () => {
    const mockTasks = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      title: `Task ${i + 1}`,
      completed: false,
      created_at: `2024-01-01`
    }));

    db.query
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks?limit=-5')
      .expect(200);

    expect(response.body.pagination.limit).toBe(20); // default limit
  });

  it('should handle non-numeric offset by treating as 0', async () => {
    const mockTasks = [
      { id: 1, title: 'Task 1', completed: false, created_at: '2024-01-01' }
    ];

    db.query
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks?offset=abc')
      .expect(200);

    expect(response.body.pagination.offset).toBe(0);
  });

  it('should handle non-numeric limit by using default', async () => {
    const mockTasks = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      title: `Task ${i + 1}`,
      completed: false,
      created_at: `2024-01-01`
    }));

    db.query
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks?limit=xyz')
      .expect(200);

    expect(response.body.pagination.limit).toBe(20); // default limit
  });

  it('should correctly set hasMore to true when more records exist', async () => {
    const mockTasks = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      title: `Task ${i + 1}`,
      completed: false,
      created_at: `2024-01-01`
    }));

    db.query
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks?offset=0&limit=20')
      .expect(200);

    expect(response.body.pagination.hasMore).toBe(true);
  });

  it('should correctly set hasMore to false when no more records exist', async () => {
    const mockTasks = [
      { id: 41, title: 'Task 41', completed: false, created_at: '2024-01-41' },
      { id: 42, title: 'Task 42', completed: false, created_at: '2024-01-42' }
    ];

    db.query
      .mockResolvedValueOnce({ rows: [{ count: '42' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks?offset=40&limit=20')
      .expect(200);

    expect(response.body.pagination.hasMore).toBe(false);
  });

  it('should return empty data array when offset exceeds total', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '10' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/tasks?offset=100&limit=20')
      .expect(200);

    expect(response.body.data).toEqual([]);
    expect(response.body.pagination.hasMore).toBe(false);
  });

  it('should return correct pagination metadata for last page', async () => {
    const mockTasks = [
      { id: 91, title: 'Task 91', completed: false, created_at: '2024-01-91' },
      { id: 92, title: 'Task 92', completed: false, created_at: '2024-01-92' },
      { id: 93, title: 'Task 93', completed: false, created_at: '2024-01-93' },
      { id: 94, title: 'Task 94', completed: false, created_at: '2024-01-94' },
      { id: 95, title: 'Task 95', completed: false, created_at: '2024-01-95' }
    ];

    db.query
      .mockResolvedValueOnce({ rows: [{ count: '95' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks?offset=90&limit=20')
      .expect(200);

    expect(response.body.pagination).toEqual({
      offset: 90,
      limit: 20,
      total: 95,
      hasMore: false
    });
  });

  it('should handle zero limit by using default', async () => {
    const mockTasks = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      title: `Task ${i + 1}`,
      completed: false,
      created_at: `2024-01-01`
    }));

    db.query
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: mockTasks });

    const response = await request(app)
      .get('/tasks?limit=0')
      .expect(200);

    expect(response.body.pagination.limit).toBe(20); // default limit
  });

  it('should return JSON content type', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '10' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/tasks')
      .expect('Content-Type', /json/);

    expect(response.status).toBe(200);
  });

  it('should handle database errors gracefully', async () => {
    const dbError = new Error('Database connection failed');
    db.query.mockRejectedValueOnce(dbError);

    const response = await request(app)
      .get('/tasks')
      .expect(500);

    expect(response.body).toEqual({ error: 'Database connection failed' });
  });
});
