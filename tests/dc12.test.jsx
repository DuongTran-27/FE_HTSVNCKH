// TASK-DC-12: nút Google + thông điệp sso_error (UI §12.3), /dang-nhap/google, R35 hồ sơ cá nhân (UI §12.4), màu trạng thái mới.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SSO_ERROR_LABEL, TOPIC_STATUS_LABEL } from '@nckh/shared';

// Loader /dang-nhap/google chỉ cần phiên trong bộ nhớ: bỏ refresh thật, phần còn lại của API client giữ nguyên
vi.mock('../src/lib/api.js', async (orig) => ({ ...(await orig()), bootstrapSession: vi.fn(async () => {}) }));

import { LoginPage } from '../src/pages/LoginPage.jsx';
import { ProfilePage } from '../src/pages/ProfilePage.jsx';
import { ssoLoader } from '../src/routes.jsx';
import { afterLoginPath, canVisit } from '../src/lib/nav.js';
import { auth } from '../src/lib/auth.js';
import { toastStore, clearToasts } from '../src/lib/toast.js';
import { Badge, STATUS_TONE } from '../src/components/ui.jsx';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
// fetch giả theo đường dẫn: routes = { 'GET /api/x': () => Response }
const serve = (routes) => fetch.mockImplementation(async (url, init = {}) => {
  const h = routes[`${init.method ?? 'GET'} ${url}`];
  return h ? h(init) : json(404, { error: { code: 'NOT_FOUND', message: 'Không tìm thấy' } });
});
const mount = (element, url, path) => {
  const router = createMemoryRouter([{ path, element }, { path: '*', element: <p>Trang khác</p> }], { initialEntries: [url] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
};

beforeEach(() => { auth.clear(); vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { cleanup(); clearToasts(); vi.unstubAllGlobals(); });

describe('R1 – nút "Đăng nhập bằng Google"', () => {
  it('providers.google = true → liên kết GET tới /api/auth/google/start kèm next hợp lệ (đã mã hóa)', async () => {
    serve({ 'GET /api/auth/providers': () => json(200, { google: true }) });
    mount(<LoginPage />, '/dang-nhap?next=%2Fde-tai%3Fx%3D1', '/dang-nhap');
    const link = await screen.findByRole('link', { name: 'Đăng nhập bằng Google' });
    expect(link.getAttribute('href')).toBe('/api/auth/google/start?next=%2Fde-tai%3Fx%3D1');
    expect(link.closest('form')).toBeNull(); // không form: CSP form-action chặn chuỗi chuyển hướng
    expect(screen.getByText('hoặc')).toBeTruthy();
  });

  it('next độc hại không được gắn vào liên kết Google', async () => {
    serve({ 'GET /api/auth/providers': () => json(200, { google: true }) });
    mount(<LoginPage />, '/dang-nhap?next=%2F%2Fevil.com', '/dang-nhap');
    expect((await screen.findByRole('link', { name: 'Đăng nhập bằng Google' })).getAttribute('href')).toBe('/api/auth/google/start');
  });

  it.each([
    ['tắt', () => json(200, { google: false })],
    ['lỗi máy chủ', () => json(500, { error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } })],
  ])('providers %s → không có nút, form mật khẩu vẫn dùng được', async (_n, res) => {
    serve({ 'GET /api/auth/providers': res });
    mount(<LoginPage />, '/dang-nhap', '/dang-nhap');
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/auth/providers', expect.anything()));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('link', { name: /Google/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeTruthy();
  });
});

describe('R1 – thông điệp sso_error', () => {
  it.each(Object.keys(SSO_ERROR_LABEL))('%s → hộp lỗi đúng nhãn; sso_error bị xóa khỏi URL, giữ next', async (code) => {
    serve({ 'GET /api/auth/providers': () => json(200, { google: true }) });
    const router = mount(<LoginPage />, `/dang-nhap?sso_error=${code}&next=%2Fkho`, '/dang-nhap');
    expect(screen.getByRole('alert').textContent).toBe(SSO_ERROR_LABEL[code]);
    await waitFor(() => expect(router.state.location.search).toBe('?next=%2Fkho'));
    expect(screen.getByRole('alert').textContent).toBe(SSO_ERROR_LABEL[code]); // vẫn hiện sau khi URL đổi
  });

  it('thông điệp theo UI §12.3 và mã lạ → thông điệp chung', async () => {
    expect(SSO_ERROR_LABEL.DOMAIN_NOT_ALLOWED).toBe('Truy cập bị từ chối. Vui lòng dùng email do trường cấp.');
    expect(SSO_ERROR_LABEL.CANCELLED).toBe('Bạn đã hủy đăng nhập bằng Google');
    serve({ 'GET /api/auth/providers': () => json(200, { google: false }) });
    mount(<LoginPage />, '/dang-nhap?sso_error=%3Cscript%3E', '/dang-nhap');
    expect(screen.getByRole('alert').textContent).toBe('Đăng nhập bằng Google không thành công');
  });

  it('mã trùng tên thuộc tính Object (constructor, toString) → thông điệp chung', () => {
    serve({ 'GET /api/auth/providers': () => json(200, { google: false }) });
    for (const code of ['constructor', 'toString', '__proto__']) {
      mount(<LoginPage />, `/dang-nhap?sso_error=${code}`, '/dang-nhap');
      expect(screen.getByRole('alert').textContent).toBe('Đăng nhập bằng Google không thành công');
      cleanup();
    }
  });

  it('không có sso_error → không có hộp lỗi', () => {
    serve({ 'GET /api/auth/providers': () => json(200, { google: false }) });
    mount(<LoginPage />, '/dang-nhap', '/dang-nhap');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('/dang-nhap/google (ssoLoader) và afterLoginPath', () => {
  const at = async (next) => {
    const res = await ssoLoader({ request: new Request(`http://localhost/dang-nhap/google${next ? `?next=${encodeURIComponent(next)}` : ''}`) });
    return res.headers.get('Location');
  };
  const U = (o = {}) => ({ id: 'u', role: 'STUDENT', mustChangePassword: false, ...o });

  it('có phiên → next hợp lệ của vai trò; next lạ/độc hại/vai trò khác → trang chủ; mật khẩu tạm → /doi-mat-khau', async () => {
    auth.setSession({ accessToken: 't', user: U() });
    expect(await at('/kho')).toBe('/kho');
    expect(await at('')).toBe('/de-tai');
    expect(await at('//evil.com')).toBe('/de-tai');
    expect(await at('/xet-duyet')).toBe('/de-tai');
    auth.setSession({ accessToken: 't', user: U({ mustChangePassword: true }) });
    expect(await at('/kho')).toBe('/doi-mat-khau');
  });

  it('không lấy được phiên → /dang-nhap', async () => {
    expect(await at('/kho')).toBe('/dang-nhap');
  });

  it('afterLoginPath và /ho-so mở cho mọi vai trò', () => {
    expect(afterLoginPath(U({ role: 'ADMIN' }), '/ho-so')).toBe('/ho-so');
    expect(afterLoginPath(U({ role: 'LECTURER' }), '/\t/evil.com')).toBe('/de-nghi-huong-dan');
    for (const role of ['STUDENT', 'LECTURER', 'STAFF', 'ADMIN']) expect(canVisit(role, '/ho-so')).toBe(true);
  });
});

describe('R35 – hồ sơ cá nhân', () => {
  const profile = (o = {}) => ({
    id: 'u1', code: '2374801030010', email: 'sv@vanlanguni.vn', fullName: 'Nguyễn Văn An', role: 'STUDENT',
    faculty: { id: 'f', name: 'Công nghệ Thông tin' }, class: { id: 'c', code: '23CT1', major: { name: 'Kỹ thuật phần mềm' } }, phone: null, ...o,
  });
  const phoneBox = () => screen.getByLabelText('Số điện thoại');

  it('đang tải → thông tin chỉ đọc + ghi chú; không có nút "Xóa số" khi chưa có số', async () => {
    serve({ 'GET /api/me/profile': () => json(200, { profile: profile() }) });
    mount(<ProfilePage />, '/ho-so', '/ho-so');
    expect(screen.getByText('Đang tải…')).toBeTruthy();
    expect(await screen.findByText('Nguyễn Văn An')).toBeTruthy();
    for (const t of ['2374801030010', 'sv@vanlanguni.vn', 'Sinh viên', 'Công nghệ Thông tin', '23CT1 – Kỹ thuật phần mềm', 'Liên hệ cán bộ khoa nếu thông tin sai.']) expect(screen.getByText(t)).toBeTruthy();
    expect(phoneBox().getAttribute('type')).toBe('tel');
    expect(phoneBox().getAttribute('inputmode')).toBe('tel');
    expect(screen.queryByRole('button', { name: 'Xóa số' })).toBeNull();
  });

  it('số sai → lỗi tại ô, không gửi PATCH', async () => {
    serve({ 'GET /api/me/profile': () => json(200, { profile: profile() }) });
    mount(<ProfilePage />, '/ho-so', '/ho-so');
    fireEvent.change(await screen.findByLabelText('Số điện thoại'), { target: { value: '0123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Số điện thoại không hợp lệ')).toBeTruthy();
    expect(phoneBox().getAttribute('aria-invalid')).toBe('true');
    expect(fetch.mock.calls.some(([, i]) => i?.method === 'PATCH')).toBe(false);
  });

  it('lưu: gửi số đã chuẩn hóa, toast "Cập nhật thành công", hiện nút "Xóa số"; Xóa số gửi null', async () => {
    const bodies = [];
    serve({
      'GET /api/me/profile': () => json(200, { profile: profile() }),
      'PATCH /api/me/profile': (init) => { const b = JSON.parse(init.body); bodies.push(b); return json(200, { profile: profile({ phone: b.phone }) }); },
    });
    mount(<ProfilePage />, '/ho-so', '/ho-so');
    fireEvent.change(await screen.findByLabelText('Số điện thoại'), { target: { value: '0912 345.678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(bodies).toEqual([{ phone: '0912345678' }]));
    await waitFor(() => expect(toastStore.get().map((t) => t.message)).toContain('Cập nhật thành công'));
    expect(phoneBox().value).toBe('0912345678');
    fireEvent.click(await screen.findByRole('button', { name: 'Xóa số' }));
    await waitFor(() => expect(bodies[1]).toEqual({ phone: null }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Xóa số' })).toBeNull());
    expect(phoneBox().value).toBe('');
  });

  it('lỗi server: VALIDATION_ERROR gắn vào ô; 429 khóa nút và hiện thông điệp', async () => {
    let n = 0;
    serve({
      'GET /api/me/profile': () => json(200, { profile: profile({ phone: '0912345678' }) }),
      'PATCH /api/me/profile': () => (++n === 1
        ? json(400, { error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu không hợp lệ', details: { phone: 'Số điện thoại không hợp lệ' } } })
        : new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Thao tác quá nhiều lần, vui lòng thử lại sau' } }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } })),
    });
    mount(<ProfilePage />, '/ho-so', '/ho-so');
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Số điện thoại không hợp lệ')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Thao tác quá nhiều lần, vui lòng thử lại sau')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' }).disabled).toBe(true);
  });

  it('lỗi tải hồ sơ → thông điệp tiếng Việt từ API + "Thử lại"', async () => {
    serve({ 'GET /api/me/profile': () => json(500, { error: { code: 'INTERNAL', message: 'Lỗi hệ thống, vui lòng thử lại' } }) });
    mount(<ProfilePage />, '/ho-so', '/ho-so');
    expect(await screen.findByText(/Lỗi hệ thống, vui lòng thử lại/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });
});

describe('Nhãn/màu trạng thái GĐ7', () => {
  it.each([['RECRUITING', 'Đang tuyển sinh viên', 'emerald'], ['WAITING_DEFENSE', 'Chờ bảo vệ', 'blue']])('%s → "%s", tông %s', (s, label, color) => {
    render(<Badge tone={STATUS_TONE[s]}>{TOPIC_STATUS_LABEL[s]}</Badge>);
    const el = screen.getByText(label);
    expect(el.className).toContain(color);
  });
});
