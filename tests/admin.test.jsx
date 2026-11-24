import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const calls = vi.hoisted(() => ({ api: null }));
vi.mock('../src/lib/api.js', () => ({
  bootstrapSession: vi.fn(() => Promise.resolve()),
  logout: vi.fn(),
  api: (...a) => calls.api(...a),
}));
vi.mock('../src/lib/format.js', async (orig) => ({ ...(await orig()), downloadCsv: vi.fn() }));

import { routes } from '../src/routes.jsx';
import { auth } from '../src/lib/auth.js';
import { downloadCsv } from '../src/lib/format.js';
import { credentialsCsv } from '../src/pages/admin/UserImportPage.jsx';
import { toPayload } from '../src/pages/admin/RoundFormPage.jsx';
import { cleanUserForm } from '../src/pages/admin/UserCreatePage.jsx';
import { clearToasts } from '../src/lib/toast.js';

// Không có user-event trong dependency: giả lập tối thiểu bằng fireEvent
const userEvent = {
  setup: () => ({
    click: async (el) => fireEvent.click(el),
    type: async (el, v) => fireEvent.change(el, { target: { value: v } }),
    clear: async (el) => fireEvent.change(el, { target: { value: '' } }),
    selectOptions: async (el, v) => fireEvent.change(el, { target: { value: v } }),
    upload: async (el, f) => fireEvent.change(el, { target: { files: [f] } }),
  }),
};

const FAC = [{ id: 'f1', code: 'CNTT', name: 'Khoa CNTT', isActive: true }, { id: 'f2', code: 'KT', name: 'Khoa Kinh tế', isActive: true }];
const U = (role, o = {}) => ({ id: 'me', fullName: 'Tôi', role, mustChangePassword: false, facultyId: 'f1', staffFacultyIds: role === 'STAFF' ? ['f1'] : [], ...o });
const apiErr = (status, code, message, details) => Object.assign(new Error(message), { status, code, details });

let routesMap;
const open = (url, user) => {
  auth.clear();
  auth.setSession({ accessToken: 't', user });
  calls.api = vi.fn(async (path, opts = {}) => {
    const key = `${opts.method ?? 'GET'} ${path.split('?')[0]}`;
    const h = routesMap[key] ?? routesMap[`* ${path.split('?')[0]}`];
    if (!h) throw apiErr(404, 'NOT_FOUND', `không mock ${key}`);
    const r = typeof h === 'function' ? h(path, opts) : h;
    if (r instanceof Error) throw r;
    return r;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return { router, client };
};
const sent = (method, path) => calls.api.mock.calls.filter(([p, o]) => p.split('?')[0] === path && (o?.method ?? 'GET') === method);

beforeEach(() => {
  routesMap = { 'GET /faculties': { items: FAC }, 'GET /classes': { items: [] }, 'GET /majors': { items: [] } };
  vi.mocked(downloadCsv).mockClear();
});
afterEach(() => { cleanup(); clearToasts(); });

describe('Tài khoản (R18)', () => {
  it('danh sách: nhãn vai trò từ shared, badge trạng thái; cán bộ chỉ lọc GV/SV', async () => {
    routesMap['GET /users'] = { page: 1, pageSize: 20, total: 1, items: [{ id: 'u1', code: 'SV1', email: 'a@x.vn', fullName: 'An', role: 'STUDENT', facultyId: 'f1', classId: null, isLocked: true, mustChangePassword: true }] };
    open('/quan-ly/tai-khoan', U('STAFF'));
    expect(await screen.findByText('SV1')).toBeTruthy();
    expect(screen.getByText('Đã khóa', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('Chờ đổi mật khẩu')).toBeTruthy();
    const roles = within(screen.getByRole('combobox', { name: 'Vai trò' })).getAllByRole('option').map((o) => o.textContent);
    expect(roles).toEqual(['Mọi vai trò', 'Giảng viên', 'Sinh viên']);
  });
  it('rỗng và lỗi hiện thông điệp tiếng Việt từ API', async () => {
    routesMap['GET /users'] = { page: 1, pageSize: 20, total: 0, items: [] };
    open('/quan-ly/tai-khoan', U('ADMIN'));
    expect(await screen.findByText('Chưa có tài khoản nào')).toBeTruthy();
    cleanup();
    routesMap['GET /users'] = apiErr(500, 'INTERNAL', 'Lỗi hệ thống, vui lòng thử lại');
    open('/quan-ly/tai-khoan', U('ADMIN'));
    expect(await screen.findByText('Lỗi hệ thống, vui lòng thử lại')).toBeTruthy();
  });
});

describe('Tạo tài khoản (R19)', () => {
  it('cleanUserForm bỏ ô không thuộc vai trò (ADMIN không có khoa)', () => {
    expect(cleanUserForm({ code: 'a', email: 'e', fullName: 'n', role: 'ADMIN', facultyId: 'f1', classId: 'c', staffFacultyIds: ['f1'] }))
      .toEqual({ code: 'a', email: 'e', fullName: 'n', role: 'ADMIN' });
  });
  it('ADMIN chọn vai trò Quản trị: ẩn ô Khoa; cán bộ chỉ có GV/SV', async () => {
    open('/quan-ly/tai-khoan/moi', U('ADMIN'));
    const role = await screen.findByLabelText('Vai trò');
    expect(screen.getByLabelText('Khoa')).toBeTruthy();
    fireEvent.change(role, { target: { value: 'ADMIN' } });
    await waitFor(() => expect(screen.queryByLabelText('Khoa')).toBeNull());
    cleanup();
    open('/quan-ly/tai-khoan/moi', U('STAFF'));
    const opts = within(await screen.findByLabelText('Vai trò')).getAllByRole('option').map((o) => o.value);
    expect(opts).toEqual(['STUDENT', 'LECTURER']);
  });
  it('lỗi từng trường từ Zod; thành công hiện mật khẩu tạm một lần, không vào cache query', async () => {
    routesMap['POST /users'] = { user: { id: 'n1' }, temporaryPassword: 'Tmp-Pass-12345' };
    routesMap['GET /users/n1'] = { user: { id: 'n1', code: 'GV9', email: 'g@x.vn', fullName: 'G', role: 'LECTURER', isLocked: false, mustChangePassword: true, staffFacultyIds: [] } };
    const { client } = open('/quan-ly/tai-khoan/moi', U('ADMIN'));
    const u = userEvent.setup();
    await u.selectOptions(await screen.findByLabelText('Vai trò'), 'LECTURER');
    await u.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    expect(await screen.findAllByText(/Chọn khoa|Required|expected string/i)).not.toHaveLength(0);
    expect(sent('POST', '/users')).toHaveLength(0);
    await u.type(screen.getByLabelText('Mã'), 'GV9');
    await u.type(screen.getByLabelText('Email'), 'g@x.vn');
    await u.type(screen.getByLabelText('Họ tên'), 'G');
    await u.selectOptions(screen.getByLabelText('Khoa'), 'f1');
    await u.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    expect((await screen.findByTestId('temp-password')).textContent).toBe('Tmp-Pass-12345');
    expect(JSON.stringify(client.getQueryCache().getAll().map((q) => q.state.data))).not.toContain('Tmp-Pass-12345');
    await u.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(await screen.findByRole('heading', { name: 'Chi tiết tài khoản' })).toBeTruthy();
    expect(screen.queryByText('Tmp-Pass-12345')).toBeNull();
  });
  it('DUPLICATE gắn lỗi vào đúng ô', async () => {
    routesMap['POST /users'] = apiErr(409, 'DUPLICATE', 'Dữ liệu đã tồn tại', { code: 'Mã đã tồn tại' });
    open('/quan-ly/tai-khoan/moi', U('ADMIN'));
    const u = userEvent.setup();
    await u.selectOptions(await screen.findByLabelText('Vai trò'), 'LECTURER');
    await u.type(screen.getByLabelText('Mã'), 'GV9');
    await u.type(screen.getByLabelText('Email'), 'g@x.vn');
    await u.type(screen.getByLabelText('Họ tên'), 'G');
    await u.selectOptions(screen.getByLabelText('Khoa'), 'f1');
    await u.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    expect(await screen.findByText('Mã đã tồn tại')).toBeTruthy();
  });
});

describe('Chi tiết tài khoản (R20)', () => {
  const target = (o) => ({ id: 'u2', code: 'CB2', email: 'c@x.vn', fullName: 'Cán bộ', role: 'STAFF', facultyId: 'f1', classId: null, isLocked: false, mustChangePassword: false, staffFacultyIds: ['f1'], createdAt: '2026-11-01T02:00:00.000Z', ...o });
  it('xem chính mình: ẩn Khóa/Đặt lại mật khẩu; xem người khác: có', async () => {
    routesMap['GET /users/me'] = { user: target({ id: 'me' }) };
    routesMap['GET /users/u2'] = { user: target() };
    open('/quan-ly/tai-khoan/me', U('ADMIN'));
    await screen.findByText('CB2');
    expect(screen.queryByRole('button', { name: 'Khóa' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Đặt lại mật khẩu' })).toBeNull();
    cleanup();
    open('/quan-ly/tai-khoan/u2', U('ADMIN'));
    expect(await screen.findByRole('button', { name: 'Khóa' })).toBeTruthy();
  });
  it('phạm vi khoa: chỉ ADMIN, điền sẵn, cảnh báo thay toàn bộ, PUT đủ danh sách', async () => {
    routesMap['GET /users/u2'] = { user: target() };
    routesMap['PUT /users/u2/staff-scopes'] = { user: target({ staffFacultyIds: ['f1', 'f2'] }) };
    open('/quan-ly/tai-khoan/u2', U('ADMIN'));
    const u = userEvent.setup();
    expect(await screen.findByText('Lưu sẽ thay toàn bộ phạm vi.')).toBeTruthy();
    expect((await screen.findByLabelText('Khoa CNTT')).checked).toBe(true);
    await u.click(screen.getByLabelText('Khoa Kinh tế'));
    await u.click(screen.getByRole('button', { name: 'Lưu phạm vi' }));
    await waitFor(() => expect(sent('PUT', '/users/u2/staff-scopes')[0][1].body).toEqual({ facultyIds: ['f1', 'f2'] }));
    cleanup();
    open('/quan-ly/tai-khoan/u2', U('STAFF'));
    await screen.findByText('CB2');
    expect(screen.queryByText('Lưu sẽ thay toàn bộ phạm vi.')).toBeNull();
  });
  it('đặt lại mật khẩu: xác nhận rồi hiện hộp mật khẩu tạm', async () => {
    routesMap['GET /users/u2'] = { user: target({ role: 'LECTURER' }) };
    routesMap['POST /users/u2/reset-password'] = { temporaryPassword: 'Reset-Pass-99' };
    open('/quan-ly/tai-khoan/u2', U('ADMIN'));
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Đặt lại mật khẩu' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đặt lại' }));
    expect((await screen.findByTestId('temp-password')).textContent).toBe('Reset-Pass-99');
  });
  it('xóa: chỉ ADMIN thấy nút; xác nhận → DELETE rồi về danh sách; 409 hiện lỗi trong hộp xác nhận', async () => {
    routesMap['GET /users/u2'] = { user: target() };
    routesMap['GET /users'] = { items: [], page: 1, pageSize: 20, total: 0 };
    routesMap['DELETE /users/u2'] = apiErr(409, 'IN_USE', 'Tài khoản đã có dữ liệu nghiệp vụ nên không thể xóa, hãy khóa tài khoản thay vì xóa');
    const { router } = open('/quan-ly/tai-khoan/u2', U('ADMIN'));
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Xóa' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xóa' }));
    expect(await within(screen.getByRole('dialog')).findByText(/không thể xóa/)).toBeTruthy();
    routesMap['DELETE /users/u2'] = () => null; // 204
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xóa' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/quan-ly/tai-khoan'));
    cleanup();
    open('/quan-ly/tai-khoan/u2', U('STAFF'));
    await screen.findByText('CB2');
    expect(screen.queryByRole('button', { name: 'Xóa' })).toBeNull();
  });
});

describe('Nhập CSV (R21)', () => {
  it('credentialsCsv qua toCsv: có BOM và chống CSV injection', () => {
    const csv = credentialsCsv([{ code: 'SV1', email: 'a@x.vn', fullName: '=HYPERLINK("x")', temporaryPassword: '+abc' }]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+abc");
  });
  const file = new File(['code,email,fullName,role,classCode\n'], 'a.csv', { type: 'text/csv' });
  const pickFile = async (u) => {
    await screen.findByRole('option', { name: 'Khoa CNTT' });
    await u.selectOptions(screen.getByLabelText('Khoa'), 'f1');
    await u.upload(screen.getByLabelText('File CSV'), file);
  };
  it('có lỗi → nút xác nhận tắt; hợp lệ → tạo, tự tải CSV, hiện cảnh báo đỏ, "Tôi đã lưu file" xóa mật khẩu', async () => {
    let preview = { validCount: 1, errorCount: 1, errors: [{ row: 3, field: null, message: 'Dòng trùng' }], preview: [] };
    routesMap['POST /users/import/preview'] = () => preview;
    routesMap['POST /users/import/confirm'] = { createdCount: 1, credentials: [{ code: 'SV1', email: 'a@x.vn', fullName: 'A', temporaryPassword: 'P-1234567890' }] };
    open('/quan-ly/tai-khoan/nhap-csv', U('STAFF'));
    const u = userEvent.setup();
    await pickFile(u);
    await u.click(screen.getByRole('button', { name: 'Xem trước' }));
    expect(await screen.findByText('Cả dòng')).toBeTruthy();
    expect(screen.getByText(/Sửa file rồi tải lên lại/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Xác nhận tạo/ }).disabled).toBe(true);
    preview = { validCount: 1, errorCount: 0, errors: [], preview: [{ row: 2, code: 'SV1', email: 'a@x.vn', fullName: 'A', role: 'STUDENT', classCode: 'K20' }] };
    await u.click(screen.getByRole('button', { name: 'Xem trước' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Xác nhận tạo/ }).disabled).toBe(false));
    await u.click(screen.getByRole('button', { name: /Xác nhận tạo/ }));
    expect(await screen.findByText('Đã tạo 1 tài khoản')).toBeTruthy();
    expect(screen.getByText('Mật khẩu tạm chỉ có ở đây. Rời trang là mất.')).toBeTruthy();
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadCsv).mock.calls[0][0]).toContain('P-1234567890');
    const body = sent('POST', '/users/import/confirm')[0][1].body;
    expect(body).toBeInstanceOf(FormData);
    await u.click(screen.getByRole('button', { name: 'Tôi đã lưu file' }));
    expect(screen.queryByText(/Mật khẩu tạm chỉ có ở đây/)).toBeNull();
  });
  it('lỗi cấp file (details.file) hiện tại ô file; file quá 1 MB bị chặn trước khi gửi', async () => {
    routesMap['POST /users/import/preview'] = apiErr(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { file: 'Sai tiêu đề' });
    open('/quan-ly/tai-khoan/nhap-csv', U('ADMIN'));
    const u = userEvent.setup();
    await pickFile(u);
    await u.click(screen.getByRole('button', { name: 'Xem trước' }));
    expect(await screen.findByText('Sai tiêu đề')).toBeTruthy();
    await u.upload(screen.getByLabelText('File CSV'), new File([new Uint8Array(1024 * 1024 + 1)], 'big.csv', { type: 'text/csv' }));
    expect(await screen.findByText('File vượt quá 1 MB')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xem trước' }).disabled).toBe(true);
  });
});

describe('Danh mục (R22)', () => {
  it('lớp: không có nút Sửa, chỉ Ngừng dùng/Dùng lại; mục ngừng dùng có badge', async () => {
    routesMap['GET /classes'] = { items: [{ id: 'c1', majorId: 'm1', code: 'K20A', isActive: true }, { id: 'c2', majorId: 'm1', code: 'K19A', isActive: false }] };
    routesMap['GET /majors'] = { items: [{ id: 'm1', facultyId: 'f1', code: 'KTPM', name: 'KTPM', isActive: true }] };
    open('/quan-ly/danh-muc/lop', U('ADMIN'));
    expect(await screen.findByText('K20A')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sửa' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ngừng dùng' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dùng lại' })).toBeTruthy();
    expect(screen.getByText('Ngừng dùng', { selector: 'span' })).toBeTruthy();
  });
  it('cán bộ chỉ có nút sửa với ngành thuộc khoa trong phạm vi; không thấy tab Khoa', async () => {
    routesMap['GET /majors'] = { items: [{ id: 'm1', facultyId: 'f1', code: 'A', name: 'Trong', isActive: true }, { id: 'm2', facultyId: 'f2', code: 'B', name: 'Ngoai', isActive: true }] };
    open('/quan-ly/danh-muc/nganh', U('STAFF'));
    await screen.findByText(/Trong/);
    expect(screen.getAllByRole('button', { name: 'Sửa' })).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'Khoa' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Từ đồng nghĩa' })).toBeTruthy();
  });
  it('rỗng; thêm trùng mã gắn lỗi vào ô Mã; từ đồng nghĩa có Xóa có xác nhận', async () => {
    routesMap['GET /fields'] = { items: [] };
    routesMap['POST /fields'] = apiErr(409, 'DUPLICATE', 'Dữ liệu đã tồn tại', { code: 'Mã đã tồn tại' });
    open('/quan-ly/danh-muc/linh-vuc', U('STAFF'));
    const u = userEvent.setup();
    expect(await screen.findByText('Chưa có lĩnh vực nào.')).toBeTruthy();
    await u.type(screen.getByLabelText('Mã'), 'AI');
    await u.type(screen.getByLabelText('Tên'), 'Trí tuệ nhân tạo');
    await u.click(screen.getByRole('button', { name: 'Thêm lĩnh vực' }));
    expect(await screen.findByText('Mã đã tồn tại')).toBeTruthy();
    cleanup();
    routesMap['GET /synonyms'] = { items: [{ id: 's1', term: 'ml', canonical: 'machine learning' }] };
    routesMap['DELETE /synonyms/s1'] = null;
    open('/quan-ly/danh-muc/dong-nghia', U('STAFF'));
    await u.click(await screen.findByRole('button', { name: 'Xóa' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(sent('DELETE', '/synonyms/s1')).toHaveLength(1));
  });
});

describe('Đợt (R23, R24)', () => {
  it('toPayload: mốc giờ Việt Nam gửi kèm +07:00, luôn có đủ config', () => {
    const p = toPayload({ facultyId: 'f1', name: 'Đợt', academicYear: '2026-2027', regOpenAt: '2026-11-10T00:00', regCloseAt: '', reviewDeadline: '', endAt: '', config: { minMembers: 1 } });
    expect(p.regOpenAt).toBe('2026-11-10T00:00:00+07:00');
    expect(p.config).toEqual({ minMembers: 1 });
  });
  it('Admin vào /quan-ly/dot → 403 (không có quyền nghiệp vụ)', async () => {
    open('/quan-ly/dot', U('ADMIN'));
    expect(await screen.findByText('Bạn không có quyền truy cập trang này')).toBeTruthy();
    expect(sent('GET', '/rounds')).toHaveLength(0);
  });
  it('danh sách: rỗng và badge Đang mở đăng ký', async () => {
    routesMap['GET /rounds'] = { page: 1, pageSize: 20, total: 0, items: [] };
    open('/quan-ly/dot', U('STAFF'));
    expect(await screen.findByText('Chưa có đợt nào. Tạo đợt mới.')).toBeTruthy();
    cleanup();
    routesMap['GET /rounds'] = { page: 1, pageSize: 20, total: 1, items: [{ id: 'r1', facultyId: 'f1', name: 'Đợt 1', academicYear: '2026-2027', regOpenAt: '2026-11-09T17:00:00.000Z', regCloseAt: '2026-12-09T17:00:00.000Z', reviewDeadline: '2026-12-31T17:00:00.000Z', endAt: '2027-06-30T17:00:00.000Z', registrationOpen: true }] };
    open('/quan-ly/dot', U('STAFF'));
    expect(await screen.findByText('Đang mở đăng ký')).toBeTruthy();
  });
  const DEFAULTS = { minMembers: 1, maxMembers: 5, maxActiveTopicsPerStudent: 1, maxTopicsPerLecturer: 5, advisorReminderDays: 3, dueReminderDays: 3, minSummaryWords: 100, minKeywords: 3, maxKeywords: 5, maxFileSizeMB: 10, allowedFileTypes: ['pdf', 'docx', 'pptx', 'xlsx'], similarity: { titleReview: 0.5, titleHigh: 0.7, contentReview: 0.35, contentHigh: 0.55, minJustificationWords: 50 },
    requireDefense: false, defenseGrades: { excellent: 9, good: 7, pass: 5 } }; // DC-07: cấu hình đợt hội đồng (API_GD7 §2.4) – form gửi nguyên effectiveConfig
  it('tạo đợt: ô điền sẵn mặc định có ghi chú; gửi đủ config và mốc +07:00; lỗi lồng gắn đúng ô', async () => {
    routesMap['POST /rounds'] = apiErr(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { 'config.similarity.titleHigh': 'Ngưỡng sai' });
    open('/quan-ly/dot/moi', U('STAFF'));
    const u = userEvent.setup();
    expect((await screen.findByLabelText('Số thành viên tối đa')).value).toBe('5');
    expect(screen.getAllByText('(mặc định)').length).toBeGreaterThan(5);
    await screen.findByRole('option', { name: 'Khoa CNTT' });
    await u.selectOptions(screen.getByLabelText('Khoa'), 'f1');
    await u.type(screen.getByLabelText('Tên đợt'), 'Đợt NCKH');
    await u.type(screen.getByLabelText('Năm học'), '2026-2027');
    fireEvent.change(screen.getByLabelText('Mở đăng ký'), { target: { value: '2026-11-10T08:00' } });
    fireEvent.change(screen.getByLabelText('Đóng đăng ký'), { target: { value: '2026-12-10T08:00' } });
    fireEvent.change(screen.getByLabelText('Hạn xét duyệt'), { target: { value: '2027-01-10T08:00' } });
    fireEvent.change(screen.getByLabelText('Kết thúc'), { target: { value: '2027-06-10T08:00' } });
    await u.click(screen.getByRole('button', { name: 'Tạo đợt' }));
    expect(await screen.findByText('Ngưỡng sai')).toBeTruthy();
    const body = sent('POST', '/rounds')[0][1].body;
    expect(body.regOpenAt).toBe('2026-11-10T08:00:00+07:00');
    expect(body.config).toEqual(DEFAULTS);
  });
  it('sửa đợt: điền từ effectiveConfig, mốc đổi sang giờ VN, cảnh báo khi siết điều kiện, PATCH không có facultyId', async () => {
    const round = { id: 'r1', facultyId: 'f1', name: 'Đợt 1', academicYear: '2026-2027', regOpenAt: '2026-11-09T17:00:00.000Z', regCloseAt: '2026-12-09T17:00:00.000Z', reviewDeadline: '2026-12-31T17:00:00.000Z', endAt: '2027-06-30T17:00:00.000Z', config: {}, effectiveConfig: { ...DEFAULTS, maxTopicsPerLecturer: 6 }, registrationOpen: true };
    routesMap['GET /rounds/r1'] = { round };
    routesMap['PATCH /rounds/r1'] = { round };
    open('/quan-ly/dot/r1', U('STAFF'));
    const u = userEvent.setup();
    expect((await screen.findByLabelText('Hạn mức đề tài mỗi giảng viên')).value).toBe('6');
    expect(screen.getByLabelText('Mở đăng ký').value).toBe('2026-11-10T00:00'); // 17:00Z = 00:00 giờ VN hôm sau
    expect(screen.getByText(/không áp dụng lại cho dữ liệu cũ/)).toBeTruthy();
    expect(screen.queryByText(/không còn đủ điều kiện gửi/)).toBeNull();
    const words = screen.getByLabelText('Số từ tóm tắt tối thiểu');
    await u.clear(words);
    await u.type(words, '150');
    expect(screen.getAllByText(/không còn đủ điều kiện gửi/).length).toBe(1);
    await u.click(screen.getByRole('button', { name: 'Lưu đợt' }));
    await waitFor(() => expect(sent('PATCH', '/rounds/r1')).toHaveLength(1));
    const body = sent('PATCH', '/rounds/r1')[0][1].body;
    expect(body.facultyId).toBeUndefined();
    expect(body.config.minSummaryWords).toBe(150);
    expect(body.config.maxTopicsPerLecturer).toBe(6);
  });
});
