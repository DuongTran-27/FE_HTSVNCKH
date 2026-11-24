import { expect, it, vi } from 'vitest';
import { api, configureSession, logout } from '../../src/lib/api.js';
import { auth } from '../../src/lib/auth.js';
import { queryClient } from '../../src/lib/queryClient.js';

const USER = { id: 'u1', role: 'STUDENT', mustChangePassword: false };
const json = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

// Review T301-bao-mat-v2 #1: sau khi xóa client, một request mới (vd. query còn mount refetch khi auth.clear()
// làm re-render, trước khi onLogout điều hướng) không có token → 401 → refresh bằng cookie mà /auth/logout
// chưa kịp thu hồi → phiên hồi sinh. Mô phỏng server xử lý refresh trước logout (HTTP/2 song song, logout chậm).
it('request mới trong lúc /auth/logout đang bay: không được refresh hồi sinh phiên', async () => {
  auth.setSession({ accessToken: 'old', user: USER });
  configureSession({ onExpired: vi.fn(), onLogout: vi.fn() });
  let releaseLogout;
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    if (url === '/api/auth/logout') {
      await new Promise((r) => { releaseLogout = r; });
      return new Response(null, { status: 204 });
    }
    if (url === '/api/auth/refresh') return json(200, { accessToken: 'new', user: USER });
    if (init.headers.get('Authorization') === 'Bearer new') return json(200, { secret: 'du lieu ca nhan' });
    return json(401, { error: { code: 'UNAUTHORIZED' } });
  }));
  const loggingOut = logout();
  // Query còn mount refetch sau queryClient.clear()
  const refetch = api('/topics/mine').then((d) => queryClient.setQueryData(['topics'], d)).catch(() => {});
  await refetch;
  releaseLogout();
  await loggingOut;
  expect(auth.get().accessToken).toBeNull();
  expect(auth.get().user).toBeNull();
  expect(queryClient.getQueryData(['topics'])).toBeUndefined();
  const urls = fetch.mock.calls.map(([u]) => u);
  expect(urls).not.toContain('/api/auth/refresh');
});
