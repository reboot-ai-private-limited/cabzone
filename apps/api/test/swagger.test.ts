import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '@/app.js';

interface ExpressLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
  };
  name?: string;
  regexp?: RegExp;
  handle?: {
    stack?: ExpressLayer[];
  };
}

function extractMountPrefix(regexp: RegExp | undefined): string {
  if (!regexp) return '';
  const src = regexp.source;
  if (src === '^\\/?$' || src === '^\\/?(?=\\/|$)') return '';
  const cleaned = src
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\(\?=\\\/\|\$\)$/, '')
    .replace(/\\\//g, '/')
    .replace(/\$$/, '');
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
}

function normalizeToOpenApiPath(fullExpressPath: string): string {
  const withoutApi = fullExpressPath.replace(/^\/api(?=\/|$)/, '') || '/';
  const collapsed = withoutApi.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  return collapsed.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function collectExpressEndpoints(app: Express): Set<string> {
  const endpoints = new Set<string>();
  const rootStack: ExpressLayer[] =
    (app as unknown as { _router?: { stack?: ExpressLayer[] } })._router?.stack ?? [];

  function walk(stack: ExpressLayer[], prefix: string): void {
    for (const layer of stack) {
      if (layer.route) {
        const routePath =
          layer.route.path === '/' ? prefix || '/' : `${prefix}${layer.route.path}`;
        const normalized = normalizeToOpenApiPath(routePath);
        if (normalized === '/docs' || normalized.startsWith('/docs/')) continue;
        for (const [method, enabled] of Object.entries(layer.route.methods)) {
          if (enabled && method !== '_all') {
            endpoints.add(`${method.toUpperCase()} ${normalized}`);
          }
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        const subPrefix = extractMountPrefix(layer.regexp);
        walk(layer.handle.stack, `${prefix}${subPrefix}`);
      }
    }
  }

  walk(rootStack, '');
  return endpoints;
}

describe('Swagger & OpenAPI Documentation', () => {
  it('serves OpenAPI 3.0 specification JSON at /api/docs/json', async () => {
    const app = createApp();
    const res = await request(app).get('/api/docs/json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.0');
    expect(res.body.info.title).toContain('Cabzonee API');
    expect(res.body.paths).toHaveProperty('/health');
    expect(res.body.paths).toHaveProperty('/v1/zones/resolve');
    expect(res.body.paths).toHaveProperty('/v1/admin/zones');
    expect(res.body.paths).toHaveProperty('/v1/rides');
    expect(res.body.paths).toHaveProperty('/v1/pricing/quotes');
    expect(res.body.paths).toHaveProperty('/v1/admin/dispatch/fleet');
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

  it('maintains 100% parity between mounted Express HTTP routes and OpenAPI paths', async () => {
    const app = createApp();
    const res = await request(app).get('/api/docs/json');
    expect(res.status).toBe(200);

    const mountedEndpoints = collectExpressEndpoints(app);
    expect(mountedEndpoints.size).toBeGreaterThanOrEqual(75);
    const documentedEndpoints = new Set<string>();
    const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

    for (const [openApiPath, pathItem] of Object.entries(
      res.body.paths as Record<string, Record<string, unknown>>,
    )) {
      for (const method of Object.keys(pathItem)) {
        if (httpMethods.has(method.toLowerCase())) {
          documentedEndpoints.add(`${method.toUpperCase()} ${openApiPath}`);
        }
      }
    }

    const missingInOpenApi = [...mountedEndpoints].filter((e) => !documentedEndpoints.has(e)).sort();
    const staleInOpenApi = [...documentedEndpoints].filter((e) => !mountedEndpoints.has(e)).sort();

    expect({ missingInOpenApi, staleInOpenApi }).toEqual({
      missingInOpenApi: [],
      staleInOpenApi: [],
    });
  });
});
