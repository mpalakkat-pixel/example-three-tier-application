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

describe('Caching middleware', () => {
  let consoleLogSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('should cache GET /tasks responses', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Task 1', completed: false }] });

    // First request should hit the database
    const response1 = await request(app)
      .get('/tasks')
      .expect(200);

    expect(response1.body).toEqual([{ id: 1, title: 'Task 1', completed: false }]);
    expect(db.query).toHaveBeenCalledTimes(1);

    // Second request should be served from cache
    const response2 = await request(app)
      .get('/tasks')
      .expect(200);

    expect(response2.body).toEqual([{ id: 1, title: 'Task 1', completed: false }]);
    expect(db.query).toHaveBeenCalledTimes(1); // Still 1, not 2
  });

  it('should cache GET /health responses', async () => {
    // First request
    const response1 = await request(app)
      .get('/health')
      .expect(200);

    expect(response1.body).toEqual({ status: 'ok' });

    // Second request should be served from cache
    const response2 = await request(app)
      .get('/health')
      .expect(200);

    expect(response2.body).toEqual({ status: 'ok' });
  });

  it('should cache GET /healthz responses', async () => {
    // First request
    const response1 = await request(app)
      .get('/healthz')
      .expect(200);

    expect(response1.body).toEqual({ service: 'api' });

    // Second request should be served from cache
    const response2 = await request(app)
      .get('/healthz')
      .expect(200);

    expect(response2.body).toEqual({ service: 'api' });
  });

  it('should invalidate cache on POST /tasks', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Task 1', completed: false }] });

    // First GET request to populate cache
    await request(app)
      .get('/tasks')
      .expect(200);

    expect(db.query).toHaveBeenCalledTimes(1);

    // POST request should invalidate cache
    db.query.mockResolvedValueOnce({ rows: [{ id: 2, title: 'New Task', completed: false }] });
    await request(app)
      .post('/tasks')
      .send({ title: 'New Task' })
      .expect(201);

    // Next GET request should hit the database again
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Task 1', completed: false }, { id: 2, title: 'New Task', completed: false }] });
    await request(app)
      .get('/tasks')
      .expect(200);

    expect(db.query).toHaveBeenCalledTimes(3); // Initial GET + POST + new GET
  });

  it('should invalidate cache on PATCH /tasks/:id', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Task 1', completed: false }] });

    // First GET request to populate cache
    await request(app)
      .get('/tasks')
      .expect(200);

    expect(db.query).toHaveBeenCalledTimes(1);

    // PATCH request should invalidate cache
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Task 1', completed: false }] });
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Updated Task', completed: true }] });
    await request(app)
      .patch('/tasks/1')
      .send({ title: 'Updated Task', completed: true })
      .expect(200);

    // Next GET request should hit the database again
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Updated Task', completed: true }] });
    await request(app)
      .get('/tasks')
      .expect(200);

    expect(db.query).toHaveBeenCalledTimes(4); // Initial GET + PATCH (2 queries) + new GET
  });

  it('should not cache POST requests', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Task 1', completed: false }] });

    const response = await request(app)
      .post('/tasks')
      .send({ title: 'Task 1' })
      .expect(201);

    expect(response.body).toEqual({ id: 1, title: 'Task 1', completed: false });
  });

  it('should not cache PATCH requests', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Task 1', completed: false }] });
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Updated', completed: true }] });

    const response = await request(app)
      .patch('/tasks/1')
      .send({ title: 'Updated', completed: true })
      .expect(200);

    expect(response.body).toEqual({ id: 1, title: 'Updated', completed: true });
  });
});
