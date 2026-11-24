import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from '../src/pages/LoginPage.jsx';
import { ChangePasswordPage } from '../src/pages/ChangePasswordPage.jsx';
import { canVisit, homePath, safeNext } from '../src/lib/nav.js';
import { auth } from '../src/lib/auth.js';

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const user = (o = {}) => ({ id: 'u1', code: 'SV22001', fullName: 'A', role: 'STUDENT', mustChangePassword: false, ...o });

const renderAt = (url) => {
  const router = createMemoryRouter([
    { path: '/dang-nhap', element: <LoginPage /> },
    { path: '/doi-mat-khau', element: <ChangePasswordPage /> },
    { path: '*', element: <p>Trang khác</p> },
  ], { initialEntries: [url] });
  // DC-12: R1 đọc /auth/providers qua TanStack Query; đặt sẵn (SSO tắt) để fetch giả chỉ phục vụ đăng nhập
  const client = new QueryClient();
  client.setQueryData(['auth-providers'], { google: false });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
};
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => { auth.clear(); vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('safeNext / homePath', () => {
  it.each([['//evil.com', null], ['/\\evil.com', null], ['https://x.vn', null], ['de-tai', null], ['/\t/evil.com', null], ['/\n/evil.com', null], ['/\r/evil.com', null], [undefined, null], ['/de-tai?x=1', '/de-tai?x=1']])('safeNext(%j)', (i, o) => {
    expect(safeNext(i)).toBe(o);
  });
  it('trang chủ theo vai trò', () => {
    expect([homePath('STUDENT'), homePath('LECTURER'), homePath('STAFF'), homePath('ADMIN')])
      .toEqual(['/de-tai', '/de-nghi-huong-dan', '/xet-duyet', '/quan-ly/tai-khoan']);
  });
});

describe('LoginPage', () => {
  const submit = () => { type('Mã hoặc email', 'SV22001'); type('Mật khẩu', 'sai'); fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' })); };

  it('đăng nhập nhanh (chỉ dev) gửi mã và mật khẩu mẫu của vai trò', async () => {
    fetch.mockResolvedValueOnce(json(200, { accessToken: 't', user: user({ role: 'LECTURER' }) }));
    const router = renderAt('/dang-nhap');
    fireEvent.click(screen.getByRole('button', { name: /Giảng viên\s*GV001/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/de-nghi-huong-dan'));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ identifier: 'GV001', password: 'Nckh@2026-dev' });
  });
  it('thành công → trang chủ vai trò', async () => {
    fetch.mockResolvedValueOnce(json(200, { accessToken: 't', user: user() }));
    const router = renderAt('/dang-nhap');
    submit();
    await waitFor(() => expect(router.state.location.pathname).toBe('/de-tai'));
  });
  it('thành công → next hợp lệ; next độc hại bị bỏ', async () => {
    fetch.mockImplementation(async () => json(200, { accessToken: 't', user: user() }));
    let router = renderAt('/dang-nhap?next=%2Fkho');
    submit();
    await waitFor(() => expect(router.state.location.pathname).toBe('/kho'));
    cleanup(); auth.clear();
    router = renderAt('/dang-nhap?next=%2F%2Fevil.com');
    submit();
    await waitFor(() => expect(router.state.location.pathname).toBe('/de-tai'));
  });
  it('next của vai trò khác bị bỏ → trang chủ vai trò mới (phiên SV hết hạn ở /yeu-cau, đăng nhập lại bằng quản trị)', async () => {
    fetch.mockResolvedValueOnce(json(200, { accessToken: 't', user: user({ role: 'ADMIN' }) }));
    const router = renderAt('/dang-nhap?next=%2Fyeu-cau');
    submit();
    await waitFor(() => expect(router.state.location.pathname).toBe('/quan-ly/tai-khoan'));
  });
  it('canVisit theo bảng quyền SCREENS', () => {
    expect(canVisit('ADMIN', '/yeu-cau')).toBe(false);
    expect(canVisit('STUDENT', '/yeu-cau?x=1')).toBe(true);
    expect(canVisit('STAFF', '/de-tai/abc/tai-lieu')).toBe(true);
    expect(canVisit('LECTURER', '/xet-duyet/abc')).toBe(false);
    expect(canVisit('ADMIN', '/khong-ton-tai')).toBe(false);
    expect(canVisit('ADMIN', '/doi-mat-khau')).toBe(true);
  });
  it('mustChangePassword → /doi-mat-khau dù có next', async () => {
    fetch.mockResolvedValueOnce(json(200, { accessToken: 't', user: user({ mustChangePassword: true }) }));
    const router = renderAt('/dang-nhap?next=%2Fkho');
    submit();
    await waitFor(() => expect(router.state.location.pathname).toBe('/doi-mat-khau'));
  });
  it('401: lỗi trên nút, giữ ô mã, xóa ô mật khẩu', async () => {
    fetch.mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'Mã/email hoặc mật khẩu không đúng' } }));
    renderAt('/dang-nhap');
    submit();
    expect((await screen.findByRole('alert')).textContent).toBe('Mã/email hoặc mật khẩu không đúng');
    expect(screen.getByLabelText('Mã hoặc email').value).toBe('SV22001');
    expect(screen.getByLabelText('Mật khẩu').value).toBe('');
  });
  it('429 RATE_LIMITED: khóa nút kèm thời gian chờ', async () => {
    fetch.mockResolvedValueOnce(json(429, { error: { code: 'RATE_LIMITED', message: 'Quá nhiều lần thử' } }, { 'Retry-After': '900' }));
    renderAt('/dang-nhap');
    submit();
    expect(await screen.findByText('Vui lòng thử lại sau 15 phút')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đăng nhập' }).disabled).toBe(true);
  });
  it('trường trống: lỗi theo ô, không gọi API', async () => {
    renderAt('/dang-nhap');
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Nhập mã hoặc email')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('ChangePasswordPage', () => {
  const fill = (n = 'Moi12345', c = n) => { type('Mật khẩu hiện tại', 'Cu12345'); type('Mật khẩu mới', n); type('Nhập lại mật khẩu mới', c); fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' })); };
  const signIn = (o) => auth.setSession({ accessToken: 't', user: user(o) });

  it('bắt buộc: có banner và nút Đăng xuất', () => {
    signIn({ mustChangePassword: true });
    renderAt('/doi-mat-khau');
    expect(screen.getByText('Bạn cần đổi mật khẩu trước khi tiếp tục')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeTruthy();
  });
  it('nhập lại không khớp: lỗi phía client', async () => {
    signIn();
    renderAt('/doi-mat-khau');
    fill('Moi12345', 'Khac12345');
    expect(await screen.findByText('Mật khẩu nhập lại không khớp')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('204 → gọi /me, cập nhật user, về trang chủ vai trò', async () => {
    signIn({ mustChangePassword: true });
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json(200, { user: user({ mustChangePassword: false }) }));
    const router = renderAt('/doi-mat-khau');
    fill();
    await waitFor(() => expect(router.state.location.pathname).toBe('/de-tai'));
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(['/api/auth/change-password', '/api/auth/me']);
    expect(auth.get().user.mustChangePassword).toBe(false);
  });
  it('WRONG_PASSWORD → ô mật khẩu hiện tại; SAME_PASSWORD → ô mật khẩu mới', async () => {
    signIn();
    fetch.mockResolvedValueOnce(json(400, { error: { code: 'WRONG_PASSWORD', message: 'Mật khẩu hiện tại không đúng' } }));
    renderAt('/doi-mat-khau');
    fill();
    expect(await screen.findByText('Mật khẩu hiện tại không đúng')).toBeTruthy();
    expect(screen.getByLabelText('Mật khẩu hiện tại').getAttribute('aria-invalid')).toBe('true');
    fetch.mockResolvedValueOnce(json(400, { error: { code: 'SAME_PASSWORD', message: 'Mật khẩu mới phải khác mật khẩu cũ' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    await waitFor(() => expect(screen.getByLabelText('Mật khẩu mới').getAttribute('aria-invalid')).toBe('true'));
  });
  it('204 nhưng /me lỗi: vẫn coi là đã đổi, không báo lỗi trên form', async () => {
    signIn({ mustChangePassword: true });
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 })).mockRejectedValueOnce(new TypeError('network'));
    const router = renderAt('/doi-mat-khau');
    fill();
    await waitFor(() => expect(router.state.location.pathname).toBe('/de-tai'));
    expect(auth.get().user.mustChangePassword).toBe(false);
  });
  it('khách → về đăng nhập', () => {
    const router = renderAt('/doi-mat-khau');
    expect(router.state.location.pathname).toBe('/dang-nhap');
  });
});
