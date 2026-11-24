import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureSession, login, refreshSession, startCrossTabSync } from './api.js';
import { auth } from './auth.js';
import { queryClient } from './queryClient.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const X = { id: 'x', role: 'STUDENT', mustChangePassword: false };
const Y = { id: 'y', role: 'STAFF', mustChangePassword: false };

const channels = [];
class FakeChannel { constructor() { channels.push(this); this.sent = []; } postMessage(m) { this.sent.push(m); } }
vi.stubGlobal('BroadcastChannel', FakeChannel);
const onLogout = vi.fn();
configureSession({ onLogout, onExpired: vi.fn() });
startCrossTabSync();

afterEach(() => { onLogout.mockClear(); vi.unstubAllGlobals(); vi.stubGlobal('BroadcastChannel', FakeChannel); });

describe('đổi người dùng giữa các tab (INFO i1 T303)', () => {
  it('refresh trả user khác người cũ → xóa phiên + cache, điều hướng đăng nhập, không nhận phiên mới', async () => {
    auth.setSession({ accessToken: 'a', user: X });
    queryClient.setQueryData(['users'], { secret: 1 });
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { accessToken: 'b', user: Y })));
    expect(await refreshSession()).toBe(false);
    expect(auth.get().user).toBeNull();
    expect(queryClient.getQueryData(['users'])).toBeUndefined();
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
  it('refresh trả cùng user → giữ phiên', async () => {
    auth.setSession({ accessToken: 'a', user: X });
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { accessToken: 'b', user: X })));
    expect(await refreshSession()).toBe(true);
    expect(auth.get().accessToken).toBe('b');
  });
  it("tin 'login' từ tab khác xóa phiên tab này; login() phát 'login'", async () => {
    auth.setSession({ accessToken: 'a', user: X });
    channels[0].onmessage({ data: 'login' });
    expect(auth.get().user).toBeNull();
    expect(onLogout).toHaveBeenCalledTimes(1);
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { accessToken: 'c', user: Y })));
    await login({ identifier: 'y', password: 'p' });
    expect(channels[0].sent).toContain('login');
  });
});
