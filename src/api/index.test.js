const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const sinon = require('sinon');
const app = require('./index');
const db = require('./db');

test('GET /healthz', async (t) => {
  await t.test('should return HTTP 200 with service name', async () => {
    const response = await request(app)
      .get('/healthz')
      .expect(200);

    assert.deepStrictEqual(response.body, { service: 'api' });
  });

  await t.test('should return JSON content type', async () => {
    const response = await request(app)
      .get('/healthz')
      .expect('Content-Type', /json/);

    assert.strictEqual(response.status, 200);
  });
});

test('GET /readyz', async (t) => {
  let sandbox;

  t.beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(db, 'query');
  });

  t.afterEach(() => {
    sandbox.restore();
  });

  await t.test('should return HTTP 200 when database is available', async () => {
    db.query.resolves({ rows: [{ '?column?': 1 }] });

    const response = await request(app)
      .get('/readyz')
      .expect(200);

    assert.deepStrictEqual(response.body, { status: 'ready', database: 'connected' });
    assert(db.query.calledWith('SELECT 1'));
  });

  await t.test('should return HTTP 503 when database is unavailable', async () => {
    const dbError = new Error('Connection refused');
    db.query.rejects(dbError);

    const response = await request(app)
      .get('/readyz')
      .expect(503);

    assert.deepStrictEqual(response.body, {
      status: 'unavailable',
      database: 'disconnected',
      error: 'Connection refused'
    });
    assert(db.query.calledWith('SELECT 1'));
  });

  await t.test('should return JSON content type', async () => {
    db.query.resolves({ rows: [{ '?column?': 1 }] });

    const response = await request(app)
      .get('/readyz')
      .expect('Content-Type', /json/);

    assert.strictEqual(response.status, 200);
  });

  await t.test('should return 503 with error message when database query fails', async () => {
    const dbError = new Error('ECONNREFUSED: Connection refused');
    db.query.rejects(dbError);

    const response = await request(app)
      .get('/readyz')
      .expect(503);

    assert.strictEqual(response.body.status, 'unavailable');
    assert.strictEqual(response.body.database, 'disconnected');
    assert.strictEqual(response.body.error, 'ECONNREFUSED: Connection refused');
  });
});

test('Request logging middleware', async (t) => {
  let sandbox;
  let consoleLogSpy;

  t.beforeEach(() => {
    sandbox = sinon.createSandbox();
    consoleLogSpy = sandbox.spy(console, 'log');
    sandbox.stub(db, 'query');
  });

  t.afterEach(() => {
    sandbox.restore();
  });

  await t.test('should log request with method, path, statusCode, and duration', async () => {
    await request(app)
      .get('/healthz')
      .expect(200);

    assert(consoleLogSpy.called);
    const logCall = consoleLogSpy.getCalls().find(call => {
      try {
        JSON.parse(call.args[0]);
        return true;
      } catch {
        return false;
      }
    });

    assert(logCall, 'Should have a JSON log call');
    const logEntry = JSON.parse(logCall.args[0]);
    
    assert(logEntry.hasOwnProperty('method'));
    assert(logEntry.hasOwnProperty('path'));
    assert(logEntry.hasOwnProperty('statusCode'));
    assert(logEntry.hasOwnProperty('duration'));
  });

  await t.test('should log correct method and path', async () => {
    await request(app)
      .get('/healthz')
      .expect(200);

    const logCall = consoleLogSpy.getCalls().find(call => {
      try {
        const parsed = JSON.parse(call.args[0]);
        return parsed.path === '/healthz';
      } catch {
        return false;
      }
    });

    const logEntry = JSON.parse(logCall.args[0]);
    assert.strictEqual(logEntry.method, 'GET');
    assert.strictEqual(logEntry.path, '/healthz');
  });

  await t.test('should log correct status code for successful request', async () => {
    await request(app)
      .get('/healthz')
      .expect(200);

    const logCall = consoleLogSpy.getCalls().find(call => {
      try {
        const parsed = JSON.parse(call.args[0]);
        return parsed.path === '/healthz';
      } catch {
        return false;
      }
    });

    const logEntry = JSON.parse(logCall.args[0]);
    assert.strictEqual(logEntry.statusCode, 200);
  });

  await t.test('should log correct status code for error request', async () => {
    db.query.rejects(new Error('Connection refused'));

    await request(app)
      .get('/readyz')
      .expect(503);

    const logCall = consoleLogSpy.getCalls().find(call => {
      try {
        const parsed = JSON.parse(call.args[0]);
        return parsed.path === '/readyz' && parsed.statusCode === 503;
      } catch {
        return false;
      }
    });

    const logEntry = JSON.parse(logCall.args[0]);
    assert.strictEqual(logEntry.statusCode, 503);
  });

  await t.test('should log duration as a number', async () => {
    await request(app)
      .get('/healthz')
      .expect(200);

    const logCall = consoleLogSpy.getCalls().find(call => {
      try {
        JSON.parse(call.args[0]);
        return true;
      } catch {
        return false;
      }
    });

    const logEntry = JSON.parse(logCall.args[0]);
    assert.strictEqual(typeof logEntry.duration, 'number');
    assert(logEntry.duration >= 0);
  });

  await t.test('should log as valid JSON', async () => {
    await request(app)
      .get('/healthz')
      .expect(200);

    const logCall = consoleLogSpy.getCalls().find(call => {
      try {
        JSON.parse(call.args[0]);
        return true;
      } catch {
        return false;
      }
    });

    assert(logCall, 'Should have a JSON log call');
    assert.doesNotThrow(() => JSON.parse(logCall.args[0]));
  });

  await t.test('should log POST request with correct method', async () => {
    db.query.resolves({ rows: [{ id: 1, title: 'Test', completed: false }] });

    await request(app)
      .post('/tasks')
      .send({ title: 'Test Task' })
      .expect(201);

    const logCall = consoleLogSpy.getCalls().find(call => {
      try {
        const parsed = JSON.parse(call.args[0]);
        return parsed.path === '/tasks' && parsed.method === 'POST';
      } catch {
        return false;
      }
    });

    const logEntry = JSON.parse(logCall.args[0]);
    assert.strictEqual(logEntry.method, 'POST');
    assert.strictEqual(logEntry.statusCode, 201);
  });
});

test('GET /metrics', async (t) => {
  let sandbox;
  let consoleLogSpy;

  t.beforeEach(() => {
    sandbox = sinon.createSandbox();
    consoleLogSpy = sandbox.spy(console, 'log');
    sandbox.stub(db, 'query');
  });

  t.afterEach(() => {
    sandbox.restore();
  });

  await t.test('should return HTTP 200 with JSON content type', async () => {
    const response = await request(app)
      .get('/metrics')
      .expect(200)
      .expect('Content-Type', /json/);

    assert.strictEqual(response.status, 200);
  });

  await t.test('should return an object with request counts', async () => {
    // Make some requests to populate the counts
    await request(app).get('/healthz').expect(200);
    await request(app).get('/healthz').expect(200);

    const response = await request(app)
      .get('/metrics')
      .expect(200);

    assert.strictEqual(typeof response.body, 'object');
    assert(response.body !== null);
  });

  await t.test('should track GET /healthz requests', async () => {
    // Make a request to /healthz
    await request(app).get('/healthz').expect(200);

    const response = await request(app)
      .get('/metrics')
      .expect(200);

    assert(response.body['GET /healthz'] >= 1);
  });

  await t.test('should increment count for multiple requests to same endpoint', async () => {
    // Make multiple requests to /healthz
    await request(app).get('/healthz').expect(200);
    await request(app).get('/healthz').expect(200);
    await request(app).get('/healthz').expect(200);

    const response = await request(app)
      .get('/metrics')
      .expect(200);

    assert(response.body['GET /healthz'] >= 3);
  });

  await t.test('should track different endpoints separately', async () => {
    // Make requests to different endpoints
    await request(app).get('/healthz').expect(200);
    db.query.resolves({ rows: [{ '?column?': 1 }] });
    await request(app).get('/readyz').expect(200);

    const response = await request(app)
      .get('/metrics')
      .expect(200);

    assert(response.body['GET /healthz'] >= 1);
    assert(response.body['GET /readyz'] >= 1);
  });

  await t.test('should track POST requests', async () => {
    db.query.resolves({ rows: [{ id: 1, title: 'Test', completed: false }] });
    await request(app)
      .post('/tasks')
      .send({ title: 'Test Task' })
      .expect(201);

    const response = await request(app)
      .get('/metrics')
      .expect(200);

    assert(response.body['POST /tasks'] >= 1);
  });

  await t.test('should include /metrics endpoint itself in counts', async () => {
    await request(app).get('/metrics').expect(200);

    const response = await request(app)
      .get('/metrics')
      .expect(200);

    // The /metrics endpoint should be counted
    assert(response.body['GET /metrics'] >= 1);
  });
});
