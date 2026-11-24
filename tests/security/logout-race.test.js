import { expect, it, vi } from 'vitest';
import { api, configureSession, logout } from '../../src/lib/api.js';
import { auth } from '../../src/lib/auth.js';
import { queryClient } from '../../src/lib/queryClient.js';

const USER = { id: 'u1', role: 'STUDENT', mustChangePassword: false };
const json = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

it('logout khi refresh đang chạy: phiên không được hồi sinh sau logout', async () => {
  auth.setSession({ accessToken: 'old', user: USER });
  configureSession({ onExpired: vi.fn(), onLogout: vi.fn() });
  let releaseRefresh;
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    if (url === '/api/auth/refresh') {
      await new Promise((r) => { releaseRefresh = r; });
      return json(200, { accessToken: 'new', user: USER });
    }
    if (url === '/api/auth/logout') return new Response(null, { status: 204 });
    const a = init.headers.get('Authorization');
    if (a === 'Bearer new') return json(200, { secret: 'du lieu ca nhan' });
    return json(401, { error: { code: 'UNAUTHORIZED' } });
  }));
  // Một query đang chạy nhận 401 → refresh bắt đầu (chậm, Render khởi động)
  const pending = api('/topics/mine').then((d) => queryClient.setQueryData(['topics'], d)).catch(() => {});
  await new Promise((r) => setTimeout(r, 0));
  // Logout dùng token 'old' (với /auth/logout server vẫn trả 204 vì không cần token hợp lệ ở mock)
  await logout();
  expect(auth.get().user).toBeNull();
  releaseRefresh();
  await pending;
  // Kỳ vọng an toàn: sau logout không còn token/user/cache
  expect(auth.get().accessToken).toBeNull();
  expect(auth.get().user).toBeNull();
  expect(queryClient.getQueryData(['topics'])).toBeUndefined();
});
