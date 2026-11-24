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

import { routes } from '../src/routes.jsx';
import { auth } from '../src/lib/auth.js';
import { clearToasts } from '../src/lib/toast.js';

const U = (role, o = {}) => ({ id: 'gv1', code: 'GV1', fullName: 'Cô Lan', role, mustChangePassword: false, facultyId: 'f1', staffFacultyIds: ['f1'], ...o });
const apiErr = (status, code, message) => Object.assign(new Error(message), { status, code });
const ROUND = { id: 'r1', name: 'Đợt 1', academicYear: '2026-2027' };
const topic = (o = {}) => ({
  id: 't1', code: 'DT-001', title: 'Đề tài A', status: 'WAITING_ADVISOR', version: 3, round: ROUND, keywords: [], members: [],
  advisor: null, availableActions: ['ACCEPT_ADVISING', 'DECLINE_ADVISING'], ...o,
});
const request = (o = {}) => ({ id: 'q1', status: 'PENDING', pendingDays: 2, lecturer: { id: 'gv1', fullName: 'Cô Lan' }, topic: topic(), ...o });

let map;
const open = (url, user) => {
  auth.clear();
  auth.setSession({ accessToken: 't', user });
  calls.api = vi.fn(async (path, opts = {}) => {
    const h = map[`${opts.method ?? 'GET'} ${path.split('?')[0]}`];
    if (!h) throw apiErr(404, 'NOT_FOUND', 'không mock');
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
  map = {
    'GET /advisor-requests': { page: 1, pageSize: 20, total: 1, items: [request()] },
    'GET /lecturers': { items: [{ id: 'gv1', activeTopicCount: 4, maxTopics: 5, isFull: false }] },
    'GET /rounds': { items: [ROUND] },
  };
});
afterEach(() => { cleanup(); clearToasts(); });

describe('Đề nghị hướng dẫn (R15)', () => {
  it('GV: hiện hạn mức; nhận hướng dẫn gửi ACCEPT_ADVISING kèm version', async () => {
    map['POST /topics/t1/actions'] = { topic: topic() };
    open('/de-nghi-huong-dan', U('LECTURER'));
    expect(await screen.findByText(/DT-001/)).toBeTruthy();
    expect(await screen.findByText(/Đã nhận 4\/5/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Nhận hướng dẫn' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Nhận hướng dẫn' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/actions')[0][1].body).toEqual({ version: 3, action: 'ACCEPT_ADVISING' }));
  });
  it('GV: từ chối bắt buộc lý do (không gọi API khi rỗng), rồi gửi reason', async () => {
    map['POST /topics/t1/actions'] = { topic: topic() };
    open('/de-nghi-huong-dan', U('LECTURER'));
    fireEvent.click(await screen.findByRole('button', { name: 'Từ chối hướng dẫn' }));
    const dlg = screen.getByRole('dialog');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Từ chối' }));
    await waitFor(() => expect(within(dlg).getByRole('textbox').getAttribute('aria-invalid')).toBe('true'));
    expect(sent('POST', '/topics/t1/actions')).toHaveLength(0);
    fireEvent.change(within(dlg).getByRole('textbox'), { target: { value: 'Ngoài chuyên môn của tôi' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Từ chối' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/actions')[0][1].body).toEqual({ version: 3, action: 'DECLINE_ADVISING', reason: 'Ngoài chuyên môn của tôi' }));
  });
  it('GV: vượt hạn mức -> hộp xác nhận hiện message của API', async () => {
    map['POST /topics/t1/actions'] = apiErr(409, 'LECTURER_QUOTA_EXCEEDED', 'Bạn đã đủ số đề tài tối đa');
    open('/de-nghi-huong-dan', U('LECTURER'));
    fireEvent.click(await screen.findByRole('button', { name: 'Nhận hướng dẫn' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Nhận hướng dẫn' }));
    expect(await screen.findByText('Bạn đã đủ số đề tài tối đa')).toBeTruthy();
  });
  it('cán bộ: không có nút nhận/từ chối; lọc theo đợt gọi GET /rounds và truyền roundId', async () => {
    open('/de-nghi-huong-dan', U('STAFF', { id: 'cb1' }));
    expect(await screen.findByText(/DT-001/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nhận hướng dẫn' })).toBeNull();
    expect(screen.getByText('Giảng viên: Cô Lan')).toBeTruthy();
    await screen.findByRole('option', { name: /Đợt 1/ });
    fireEvent.change(screen.getByRole('combobox', { name: 'Đợt' }), { target: { value: 'r1' } });
    await waitFor(() => expect(sent('GET', '/advisor-requests').some(([p]) => p.includes('roundId=r1'))).toBe(true));
  });
  it('GV không gọi GET /rounds', async () => {
    open('/de-nghi-huong-dan', U('LECTURER'));
    await screen.findByText(/DT-001/);
    expect(sent('GET', '/rounds')).toHaveLength(0);
  });
});

describe('Chi tiết đề tài (R6) + TopicActionBar', () => {
  it('availableActions rỗng -> không có nút', async () => {
    map['GET /topics/t1'] = { topic: topic({ availableActions: [] }) };
    open('/de-tai/t1', U('LECTURER'));
    expect(await screen.findByText('Đề tài A')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nhận hướng dẫn' })).toBeNull();
  });
  it('có action GV -> hiện nút nhận/từ chối', async () => {
    map['GET /topics/t1'] = { topic: topic() };
    open('/de-tai/t1', U('LECTURER'));
    expect(await screen.findByRole('button', { name: 'Nhận hướng dẫn' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Từ chối hướng dẫn' })).toBeTruthy();
  });
  it('403 -> thông báo tiếng Việt', async () => {
    map['GET /topics/t1'] = apiErr(403, 'FORBIDDEN', 'x');
    open('/de-tai/t1', U('LECTURER'));
    expect(await screen.findByText('Bạn không có quyền xem đề tài này')).toBeTruthy();
  });
});

describe('Đặt lại mật khẩu không nằm trong MutationCache (review T304 m1)', () => {
  it('mật khẩu tạm hiện ra nhưng MutationCache không giữ nó', async () => {
    map['GET /users/u2'] = { user: { id: 'u2', code: 'GV2', email: 'b@x.vn', fullName: 'B', role: 'LECTURER', facultyId: 'f1', isLocked: false } };
    map['GET /faculties'] = { items: [] };
    map['POST /users/u2/reset-password'] = { temporaryPassword: 'Reset-Pass-99' };
    const { client } = open('/quan-ly/tai-khoan/u2', U('ADMIN', { id: 'ad' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Đặt lại mật khẩu' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đặt lại' }));
    expect((await screen.findByTestId('temp-password')).textContent).toBe('Reset-Pass-99');
    expect(JSON.stringify(client.getMutationCache().getAll().map((m) => m.state.data))).not.toContain('Reset-Pass-99');
  });
});
