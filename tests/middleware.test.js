// @vitest-environment node
// T706: middleware Vercel proxy /api/* sang Render kèm header bí mật (giao thức x-middleware-* như rewrite() của @vercel/functions).
import { afterEach, describe, expect, it, vi } from 'vitest';
import middleware, { config } from '../middleware.js';

const SECRET = 's'.repeat(40);
const req = (path, headers = {}) => new Request(`https://nckh.vercel.app${path}`, { headers });

afterEach(() => vi.unstubAllEnvs());

describe('middleware /api', () => {
  it('chỉ áp cho /api', () => expect(config.matcher).toBe('/api/:path*'));

  it('rewrite sang API_ORIGIN, giữ path + query, gắn header bí mật, bỏ host và header giả của client', () => {
    vi.stubEnv('API_ORIGIN', 'https://nckh-api.onrender.com');
    vi.stubEnv('ORIGIN_SECRET', SECRET);
    const res = middleware(
      req('/api/topics?q=ai&page=2', { cookie: 'rt=abc', authorization: 'Bearer t', 'x-nckh-origin': 'gia-mao' }),
    );
    const h = res.headers;
    expect(h.get('x-middleware-rewrite')).toBe('https://nckh-api.onrender.com/api/topics?q=ai&page=2');
    expect(h.get('x-middleware-request-x-nckh-origin')).toBe(SECRET);
    expect(h.get('x-middleware-request-cookie')).toBe('rt=abc');
    expect(h.get('x-middleware-request-authorization')).toBe('Bearer t');
    const keep = h.get('x-middleware-override-headers').split(',');
    expect(keep).toEqual(expect.arrayContaining(['cookie', 'authorization', 'x-nckh-origin']));
    expect(keep).not.toContain('host');
    expect(keep.filter((k) => k === 'x-nckh-origin')).toHaveLength(1);
  });

  it('bỏ mọi header x-middleware-* do client gửi', () => {
    vi.stubEnv('API_ORIGIN', 'https://nckh-api.onrender.com');
    vi.stubEnv('ORIGIN_SECRET', SECRET);
    const res = middleware(req('/api/health', { 'x-middleware-request-evil': '1', 'x-middleware-rewrite': 'https://evil.example' }));
    expect(res.headers.get('x-middleware-rewrite')).toBe('https://nckh-api.onrender.com/api/health');
    expect(res.headers.get('x-middleware-request-evil')).toBeNull();
    expect(res.headers.get('x-middleware-override-headers')).not.toContain('x-middleware');
    expect(res.headers.get('x-middleware-request-x-middleware-request-evil')).toBeNull();
  });

  it.each([
    ['thiếu API_ORIGIN', undefined, SECRET],
    ['API_ORIGIN không phải https gốc', 'http://nckh-api.onrender.com', SECRET],
    ['API_ORIGIN có path', 'https://nckh-api.onrender.com/api', SECRET],
    ['thiếu ORIGIN_SECRET', 'https://nckh-api.onrender.com', undefined],
    ['ORIGIN_SECRET ngắn', 'https://nckh-api.onrender.com', 'ngan'],
  ])('%s → 503, không rewrite', async (_name, origin, secret) => {
    vi.stubEnv('API_ORIGIN', origin);
    vi.stubEnv('ORIGIN_SECRET', secret);
    const res = middleware(req('/api/health'));
    expect(res.status).toBe(503);
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect((await res.json()).error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
