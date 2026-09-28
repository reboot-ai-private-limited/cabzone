import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app.js';

describe('Swagger & OpenAPI Documentation', () => {
  it('serves OpenAPI 3.0 specification JSON at /api/docs/json', async () => {
    const app = createApp();
    const res = await request(app).get('/api/docs/json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.0');
    expect(res.body.info.title).toContain('Cabzon API');
    expect(res.body.paths).toHaveProperty('/health');
    expect(res.body.paths).toHaveProperty('/v1/zones/resolve');
    expect(res.body.paths).toHaveProperty('/v1/admin/zones');
  });

  it('serves Swagger UI HTML at /api/docs/', async () => {
    const app = createApp();
    const res = await request(app).get('/api/docs/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });

  it('registers bearerAuth security scheme', async () => {
    const app = createApp();
    const res = await request(app).get('/api/docs/json');

    expect(res.status).toBe(200);
    expect(res.body.components.securitySchemes).toHaveProperty('bearerAuth');
  });
});
