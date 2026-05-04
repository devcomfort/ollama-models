import { describe, it, expect } from 'vitest';
import { app } from '../../index';

describe('GET /openapi.json', () => {
  it('returns a valid OpenAPI spec', async () => {
    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.openapi).toBe('3.0.0');
    expect((body as { info: { title: string } }).info.title).toBe('Ollama Models API');
  });
});
