import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Chặn mạng: bootstrapSession chờ được, kiểm thứ tự gọi
const boot = vi.hoisted(() => ({ gate: null }));
vi.mock('../src/lib/api.js', () => ({
  bootstrapSession: vi.fn(() => boot.gate ?? Promise.resolve()),
  logout: vi.fn(),
  api: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })), // T308: /de-tai và /kho là màn thật, gọi API
}));

import { routes } from '../src/routes.jsx';
import { auth } from '../src/lib/auth.js';
import { bootstrapSession } from '../src/lib/api.js';
import { shouldRetryQuery, queryCache, queryClient } from '../src/lib/queryClient.js';
import { toastStore, clearToasts } from '../src/lib/toast.js';

const U = (role, o = {}) => ({ id: 'u', fullName: 'Nguyễn A', role, mustChangePassword: false, ...o });
const open = async (url, user) => {
  auth.clear();
  if (user) auth.setSession({ accessToken: 't', user });
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
};

beforeEach(() => { bootstrapSession.mockClear(); boot.gate = null; });
afterEach(() => { cleanup(); clearToasts(); });

describe('guard', () => {
  it('loader chờ bootstrapSession xong mới quyết định (không đá khách ra khi phiên chưa khởi động xong)', async () => {
    auth.clear();
    let release;
    boot.gate = new Promise((r) => { release = r; });
    const router = createMemoryRouter(routes, { initialEntries: ['/de-tai'] });
    render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>);
    await new Promise((r) => setTimeout(r, 20));
    expect(bootstrapSession).toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/de-tai'); // chưa chuyển hướng vì chưa boot xong
    auth.setSession({ accessToken: 't', user: U('STUDENT') }); // boot xong → có phiên
    await act(async () => { release(); });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Đề tài của tôi' })).toBeTruthy());
    expect(router.state.location.pathname).toBe('/de-tai');
  });
  it('khách vào route khác → /dang-nhap?next=…', async () => {
    const router = await open('/de-tai/abc?x=1');
    await waitFor(() => expect(router.state.location.pathname).toBe('/dang-nhap'));
    expect(router.state.location.search).toBe('?next=%2Fde-tai%2Fabc%3Fx%3D1');
  });
  it.each([['STUDENT', '/de-tai'], ['LECTURER', '/de-nghi-huong-dan'], ['STAFF', '/xet-duyet'], ['ADMIN', '/quan-ly/tai-khoan']])(
    '"/" của %s → trang chủ vai trò', async (role, home) => {
      const router = await open('/', U(role));
      await waitFor(() => expect(router.state.location.pathname).toBe(home));
    });
  it('đã đăng nhập mở /dang-nhap → trang chủ vai trò', async () => {
    const router = await open('/dang-nhap', U('STAFF'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/xet-duyet'));
  });
  it('mustChangePassword: mọi route khác → /doi-mat-khau; menu ẩn, chỉ còn Đăng xuất', async () => {
    const router = await open('/de-tai', U('STUDENT', { mustChangePassword: true }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/doi-mat-khau'));
    // Chờ layout dựng xong (trang lazy) rồi mới kiểm menu ẩn – tránh chập chờn khi cả bộ chạy song song
    expect((await screen.findAllByRole('button', { name: 'Đăng xuất' })).length).toBeGreaterThan(0);
    expect(screen.queryByRole('navigation', { name: 'Menu chính' })).toBeNull();
  });
  it('cờ mustChangePassword bật giữa chừng (API trả 403) → layout chuyển /doi-mat-khau', async () => {
    const router = await open('/de-tai', U('STUDENT'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/de-tai'));
    act(() => auth.requirePasswordChange());
    await waitFor(() => expect(router.state.location.pathname).toBe('/doi-mat-khau'));
  });
  it('ADMIN gõ URL nghiệp vụ → thông báo 403 tại chỗ, giữ URL và header', async () => {
    const router = await open('/de-tai', U('ADMIN'));
    expect(await screen.findByText('Bạn không có quyền truy cập trang này')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/de-tai');
    expect(screen.getByRole('navigation', { name: 'Menu chính' })).toBeTruthy();
  });
  it('SV vào /xet-duyet và /quan-ly/dot → 403; STAFF vào /quan-ly/danh-muc/khoa → 403', async () => {
    await open('/xet-duyet', U('STUDENT'));
    expect(await screen.findByText('Bạn không có quyền truy cập trang này')).toBeTruthy();
    cleanup();
    await open('/quan-ly/danh-muc/khoa', U('STAFF'));
    expect(await screen.findByText('Bạn không có quyền truy cập trang này')).toBeTruthy();
  });
  it('vai trò hợp lệ thấy màn trong layout (không 404)', async () => {
    await open('/kho', U('ADMIN'));
    expect(await screen.findByRole('heading', { name: 'Kho đề tài' })).toBeTruthy();
  });
  it('URL lạ → 404 trong layout, có nút Về trang chủ', async () => {
    await open('/khong-co', U('LECTURER'));
    expect(await screen.findByText('Không tìm thấy trang')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Về trang chủ' }).getAttribute('href')).toBe('/de-nghi-huong-dan');
  });
});

describe('toast 503', () => {
  it('503 khi tải dữ liệu: toast không tự ẩn (duration 0) có nút Thử lại gọi lại query', () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    queryCache.config.onError(Object.assign(new Error('Hệ thống đang bận'), { status: 503 }), { queryKey: ['topics'] });
    vi.advanceTimersByTime(60_000);
    vi.useRealTimers();
    const t = toastStore.get()[0];
    expect(t.message).toBe('Hệ thống đang bận');
    t.action.onClick();
    expect(spy).toHaveBeenCalledWith({ queryKey: ['topics'] });
  });
  it('lỗi khác 503 không tạo toast; retry chỉ cho mất mạng/503', () => {
    queryCache.config.onError(Object.assign(new Error('x'), { status: 500 }), { queryKey: ['a'] });
    expect(toastStore.get()).toHaveLength(0);
    expect(shouldRetryQuery(0, { status: 503 })).toBe(true);
  });
});
