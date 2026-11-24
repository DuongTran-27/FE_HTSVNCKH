import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, bootstrapSession, configureSession, login, logout, parseRetryAfter, refreshSession, startCrossTabSync } from './api.js';
import { auth } from './auth.js';
import { queryClient } from './queryClient.js';
import { toast, toastStore } from './toast.js';

const USER = { id: 'u1', role: 'STUDENT', mustChangePassword: false };
const json = (status, body, headers = {}) => new Response(body === undefined ? null : JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', ...headers },
});
const err = (status, code, message = 'msg', extra = {}) => json(status, { error: { code, message, ...extra } });

// Máy chủ giả: token 'old' hết hạn, refresh cấp 'new'
const fakeServer = ({ refresh = () => json(200, { accessToken: 'new', user: USER }) } = {}) => vi.fn(async (url, init) => {
  if (url === '/api/auth/refresh') return refresh();
  if (url === '/api/auth/logout') return new Response(null, { status: 204 });
  const authz = init.headers.get('Authorization');
  return authz === 'Bearer new' ? json(200, { ok: url }) : err(401, 'UNAUTHORIZED');
});

let onExpired;
beforeEach(() => {
  auth.setSession({ accessToken: 'old', user: USER });
  onExpired = vi.fn();
  configureSession({ onExpired, onLogout: vi.fn() });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('API client – refresh', () => {
  it('nhiều 401 đồng thời chỉ gọi refresh 1 lần, rồi gửi lại từng request', async () => {
    const fetch = fakeServer();
    vi.stubGlobal('fetch', fetch);
    const results = await Promise.all(['/a', '/b', '/c', '/d'].map((p) => api(p)));
    expect(results.map((r) => r.ok)).toEqual(['/api/a', '/api/b', '/api/c', '/api/d']);
    expect(fetch.mock.calls.filter(([u]) => u === '/api/auth/refresh')).toHaveLength(1);
    expect(auth.get().accessToken).toBe('new');
  });

  it('dùng navigator.locks khi có (tuần tự giữa các tab)', async () => {
    vi.stubGlobal('fetch', fakeServer());
    const request = vi.fn((name, fn) => fn());
    vi.stubGlobal('navigator', { locks: { request } });
    await Promise.all([api('/a'), api('/b')]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe('nckh-refresh');
  });

  it('401 sau khi request khác đã refresh xong: gửi lại bằng token mới, không refresh lần 2', async () => {
    let releaseA;
    const fetch = vi.fn(async (url, init) => {
      if (url === '/api/auth/refresh') return json(200, { accessToken: 'new', user: USER });
      if (url === '/api/slow' && init.headers.get('Authorization') === 'Bearer old') {
        await new Promise((r) => { releaseA = r; });
        return err(401, 'UNAUTHORIZED');
      }
      return init.headers.get('Authorization') === 'Bearer new' ? json(200, {}) : err(401, 'UNAUTHORIZED');
    });
    vi.stubGlobal('fetch', fetch);
    const slow = api('/slow');
    await vi.waitFor(() => expect(releaseA).toBeTypeOf('function'));
    await api('/fast'); // refresh lần 1
    releaseA();
    await slow;
    expect(fetch.mock.calls.filter(([u]) => u === '/api/auth/refresh')).toHaveLength(1);
  });

  it('refresh thất bại → xóa module auth, xóa cache, toast, điều hướng đăng nhập (một lần)', async () => {
    vi.stubGlobal('fetch', fakeServer({ refresh: () => err(401, 'UNAUTHORIZED') }));
    queryClient.setQueryData(['topics', {}], { items: [1] });
    const clear = vi.spyOn(queryClient, 'clear');
    const before = toastStore.get().length;
    const results = await Promise.allSettled([api('/a'), api('/b')]);
    expect(results.every((r) => r.status === 'rejected' && r.reason.status === 401)).toBe(true);
    // m1: lỗi gắn cờ để màn không hiện toast thứ hai
    expect(results.every((r) => r.reason.sessionExpired === true)).toBe(true);
    expect(auth.get()).toMatchObject({ user: null, accessToken: null });
    expect(clear).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(['topics', {}])).toBeUndefined();
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(toastStore.get().slice(before).map((t) => t.message)).toEqual(['Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại']);
  });

  it('refresh mất mạng → báo lỗi mạng, không đăng xuất', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url === '/api/auth/refresh') throw new TypeError('Failed to fetch');
      return err(401, 'UNAUTHORIZED');
    }));
    await expect(api('/a')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(auth.get().user).toEqual(USER);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('không refresh khi chính /auth/login trả 401', async () => {
    const fetch = vi.fn(async () => err(401, 'UNAUTHORIZED', 'Mã/email hoặc mật khẩu không đúng'));
    vi.stubGlobal('fetch', fetch);
    await expect(api('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      code: 'UNAUTHORIZED', message: 'Mã/email hoặc mật khẩu không đúng',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refreshSession dùng chung một promise khi gọi chồng (StrictMode)', async () => {
    const fetch = fakeServer();
    vi.stubGlobal('fetch', fetch);
    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);
    expect(a && b).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('bootstrapSession gọi hai lần chỉ refresh một lần; 401 → khách', async () => {
    const fetch = fakeServer({ refresh: () => err(401, 'UNAUTHORIZED') });
    vi.stubGlobal('fetch', fetch);
    auth.setStatus('loading');
    await Promise.all([bootstrapSession(), bootstrapSession()]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(auth.get()).toMatchObject({ status: 'ready', user: null });
    expect(onExpired).not.toHaveBeenCalled();
  });
});

describe('API client – lỗi và body', () => {
  it('403 PASSWORD_CHANGE_REQUIRED đặt mustChangePassword = true', async () => {
    auth.setSession({ accessToken: 'new', user: USER });
    vi.stubGlobal('fetch', vi.fn(async () => err(403, 'PASSWORD_CHANGE_REQUIRED', 'Bạn cần đổi mật khẩu trước khi tiếp tục')));
    await expect(api('/topics')).rejects.toMatchObject({ status: 403, code: 'PASSWORD_CHANGE_REQUIRED' });
    expect(auth.get().user.mustChangePassword).toBe(true);
  });

  it('FormData: không tự đặt Content-Type; object: application/json', async () => {
    auth.setSession({ accessToken: 'new', user: USER });
    const fetch = vi.fn(async () => json(200, {}));
    vi.stubGlobal('fetch', fetch);
    const fd = new FormData();
    fd.append('file', new Blob(['a,b']), 'x.csv');
    await api('/users/import', { method: 'POST', body: fd });
    await api('/topics', { method: 'POST', body: { title: 'x' } });
    const [fdInit, jsonInit] = fetch.mock.calls.map((c) => c[1]);
    expect(fdInit.headers.has('Content-Type')).toBe(false);
    expect(fdInit.body).toBe(fd);
    expect(jsonInit.headers.get('Content-Type')).toBe('application/json');
    expect(jsonInit.body).toBe('{"title":"x"}');
  });

  it('chỉ gọi đường dẫn tương đối /api, cùng origin', async () => {
    const fetch = vi.fn(async () => json(200, {}));
    vi.stubGlobal('fetch', fetch);
    await api('/health');
    expect(fetch.mock.calls[0][0]).toBe('/api/health');
    expect(fetch.mock.calls[0][1].credentials).toBe('same-origin');
    await expect(api('//evil.com/x')).rejects.toThrow();
    await expect(api('https://evil.com')).rejects.toThrow();
  });

  it('chuẩn hóa lỗi: code, message, details, retryAfter, requestId; 204 → null', async () => {
    auth.setSession({ accessToken: 'new', user: USER });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(err(429, 'RATE_LIMITED', 'Thao tác quá nhiều lần', {}))
      .mockResolvedValueOnce(json(500, { error: { code: 'INTERNAL', message: 'Lỗi hệ thống, vui lòng thử lại', requestId: 'r-1' } }))
      .mockResolvedValueOnce(new Response('<html>', { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 })));
    const e1 = await api('/a').catch((e) => e);
    expect(e1).toBeInstanceOf(ApiError);
    expect(e1).toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfter: null });
    const e2 = await api('/b').catch((e) => e);
    expect(e2).toMatchObject({ code: 'INTERNAL', requestId: 'r-1' });
    const e3 = await api('/c').catch((e) => e);
    expect(e3).toMatchObject({ status: 502, code: 'INTERNAL', message: 'Lỗi hệ thống, vui lòng thử lại' });
    expect(await api('/d')).toBeNull();
  });

  it('đọc header Retry-After (giây hoặc ngày HTTP)', async () => {
    auth.setSession({ accessToken: 'new', user: USER });
    vi.stubGlobal('fetch', vi.fn(async () => json(429,
      { error: { code: 'RATE_LIMITED', message: 'x' } }, { 'Retry-After': '120' })));
    await expect(api('/a')).rejects.toMatchObject({ retryAfter: 120 });
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:01:00 GMT', Date.parse('2026-01-01T00:00:00Z'))).toBe(60);
    expect(parseRetryAfter(null)).toBeNull();
  });

  it('mất mạng → ApiError NETWORK_ERROR tiếng Việt', async () => {
    auth.setSession({ accessToken: 'new', user: USER });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(api('/a')).rejects.toMatchObject({
      status: 0, code: 'NETWORK_ERROR', message: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
    });
  });

  it('403 ACCOUNT_LOCKED ở request thường → đăng xuất (lỗi có cờ sessionExpired); ở /auth/login thì không', async () => {
    auth.setSession({ accessToken: 'new', user: USER });
    vi.stubGlobal('fetch', vi.fn(async () => err(403, 'ACCOUNT_LOCKED', 'Tài khoản đã bị khóa')));
    await expect(api('/topics')).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED', sessionExpired: true });
    expect(auth.get().user).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
    onExpired.mockClear();
    const e = await api('/auth/login', { method: 'POST', body: {} }).catch((x) => x);
    expect(e).toMatchObject({ code: 'ACCOUNT_LOCKED' });
    expect(e.sessionExpired).toBeUndefined();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('logout: gọi thẳng /auth/logout, không refresh, không toast hết hạn, không giữ next (bao-mat #3)', async () => {
    const fetch = fakeServer({ refresh: () => err(401, 'UNAUTHORIZED') });
    vi.stubGlobal('fetch', fetch);
    const onLogout = vi.fn();
    configureSession({ onExpired, onLogout });
    await logout();
    expect(fetch.mock.calls.map(([u]) => u)).toEqual(['/api/auth/logout']);
    expect(fetch.mock.calls[0][1].keepalive).toBe(true);
    expect(onExpired).not.toHaveBeenCalled();
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(toastStore.get().some((t) => t.message.includes('hết hạn'))).toBe(false);
  });

  it('xóa phiên cũng xóa toast của phiên trước (bao-mat v3 INFO)', async () => {
    vi.stubGlobal('fetch', fakeServer());
    toast('Toast phiên cũ');
    await logout();
    expect(toastStore.get()).toHaveLength(0);
  });

  it('đăng xuất ở tab khác (BroadcastChannel): tab này xóa phía client, không gọi server, và phát lại khi tự logout', async () => {
    const channels = [];
    class FakeChannel { constructor() { channels.push(this); this.sent = []; } postMessage(m) { this.sent.push(m); } }
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    const fetch = fakeServer();
    vi.stubGlobal('fetch', fetch);
    const onLogout = vi.fn();
    configureSession({ onExpired, onLogout });
    startCrossTabSync();
    channels[0].onmessage({ data: 'logout' });
    expect(auth.get().user).toBeNull();
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    auth.setSession({ accessToken: 'old', user: USER });
    await logout();
    expect(channels[0].sent).toEqual(['logout']);
  });

  it('logout khi refresh đang chạy: gửi /auth/logout SAU refresh (mang cookie mới), login chờ logout xong', async () => {
    let releaseRefresh;
    const order = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      order.push(url);
      if (url === '/api/auth/refresh') {
        await new Promise((r) => { releaseRefresh = r; });
        return json(200, { accessToken: 'new', user: USER });
      }
      if (url === '/api/auth/logout') return new Response(null, { status: 204 });
      if (url === '/api/auth/login') return json(200, { accessToken: 'u2', user: { ...USER, id: 'u2' } });
      return err(401, 'UNAUTHORIZED');
    }));
    const pending = api('/topics/mine').catch((e) => e);
    await vi.waitFor(() => expect(releaseRefresh).toBeTypeOf('function'));
    await logout();
    const loggingIn = login({ identifier: 'x', password: 'y' });
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(['/api/topics/mine', '/api/auth/refresh']);
    releaseRefresh();
    expect(await pending).toMatchObject({ status: 401, sessionExpired: true });
    await loggingIn;
    expect(order).toEqual(['/api/topics/mine', '/api/auth/refresh', '/api/auth/logout', '/api/auth/login']);
    // Kết quả refresh cũ không ghi đè phiên mới
    expect(auth.get()).toMatchObject({ accessToken: 'u2', user: { id: 'u2' } });
  });

  it('refresh gọi trong lúc /auth/logout đang bay: chỉ gửi sau khi logout xong (bao-mat v2 #1)', async () => {
    let releaseLogout;
    const order = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      order.push(url);
      if (url === '/api/auth/logout') {
        await new Promise((r) => { releaseLogout = r; });
        return new Response(null, { status: 204 });
      }
      return err(401, 'UNAUTHORIZED'); // server đã thu hồi cookie
    }));
    const loggingOut = logout();
    const refreshing = refreshSession(); // vd. bootstrapSession({ retry: true })
    await vi.waitFor(() => expect(releaseLogout).toBeTypeOf('function'));
    expect(order).toEqual(['/api/auth/logout']);
    releaseLogout();
    await loggingOut;
    expect(await refreshing).toBe(false);
    expect(order).toEqual(['/api/auth/logout', '/api/auth/refresh']);
    expect(auth.get().accessToken).toBeNull();
  });

  it('request thành công nhưng về sau khi đăng xuất: bỏ kết quả', async () => {
    auth.setSession({ accessToken: 'new', user: USER });
    let release;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url === '/api/auth/logout') return new Response(null, { status: 204 });
      await new Promise((r) => { release = r; });
      return json(200, { secret: 1 });
    }));
    const pending = api('/topics/mine').catch((e) => e);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await logout();
    release();
    expect(await pending).toMatchObject({ sessionExpired: true });
  });

  it('logout: xóa auth + cache kể cả khi lỗi mạng', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const clear = vi.spyOn(queryClient, 'clear');
    await logout();
    expect(auth.get().user).toBeNull();
    expect(clear).toHaveBeenCalled();
  });
});
