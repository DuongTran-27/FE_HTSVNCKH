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
import { clearToasts, toastStore } from '../src/lib/toast.js';

const STAFF = { id: 'cb1', code: 'CB1', fullName: 'Cán bộ', role: 'STAFF', mustChangePassword: false, facultyId: 'f1', staffFacultyIds: ['f1'] };
const apiErr = (status, code, message) => Object.assign(new Error(message), { status, code });
const ROUND = { id: 'r1', name: 'Đợt 1', academicYear: '2026-2027', reviewDeadline: '2020-01-01T00:00:00Z' };
const payload = (o = {}) => ({ title: 'Đề tài A', summary: 'học máy cơ bản', objectives: 'mục tiêu', keywords: ['ai'], fieldId: 'fd1', fieldName: 'AI', ...o });
const sub = (o = {}) => ({
  id: 's2', seq: 2, createdAt: '2026-10-01T03:00:00Z', createdBy: { id: 'u1', fullName: 'SV A' }, payload: payload(),
  similarityCheck: { status: 'OK', level: 'HIGH', createdAt: '2026-10-01T03:00:00Z', matches: [], justification: 'Khác phạm vi vì dùng dữ liệu riêng', algorithmVersion: 'v1', corpusSize: 3 },
  decision: null, ...o,
});
const topic = (o = {}) => ({
  id: 't1', code: 'DT-001', title: 'Đề tài A', status: 'UNDER_REVIEW', version: 5, round: ROUND, keywords: [], advisor: { id: 'gv1', fullName: 'Cô Lan' },
  members: [{ userId: 'u1', fullName: 'SV A', code: 'SV1', role: 'LEADER' }],
  latestSubmission: { id: 's2', seq: 2, createdAt: '2026-10-01T03:00:00Z', decision: null },
  availableActions: ['APPROVE', 'REQUEST_REVISION', 'REJECT'], ...o,
});

let map;
const open = (url) => {
  auth.clear();
  auth.setSession({ accessToken: 't', user: STAFF });
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
  return { router };
};
const sent = (method, path) => calls.api.mock.calls.filter(([p, o]) => p.split('?')[0] === path && (o?.method ?? 'GET') === method);

beforeEach(() => {
  map = {
    'GET /topics/t1': { topic: topic() },
    'GET /topics/t1/submissions/2': { submission: sub() },
    'GET /topics/t1/submissions/1': { submission: sub({ id: 's1', seq: 1, decision: { action: 'REQUEST_REVISION', reason: 'Thiếu mục tiêu', decidedBy: { fullName: 'Cán bộ' }, decidedAt: '2026-09-20T03:00:00Z' } }) },
    'GET /topics/t1/submissions': { items: [{ id: 's2', seq: 2, createdAt: '2026-10-01T03:00:00Z', createdBy: { fullName: 'SV A' }, similarityLevel: 'HIGH', decision: null }, { id: 's1', seq: 1, createdAt: '2026-09-01T03:00:00Z', createdBy: { fullName: 'SV A' }, similarityLevel: null, decision: { action: 'REQUEST_REVISION', decidedAt: '2026-09-20T03:00:00Z' } }] },
  };
});
afterEach(() => { cleanup(); clearToasts(); });

describe('Hàng chờ xét duyệt (R16)', () => {
  const item = { id: 't1', code: 'DT-001', title: 'Đề tài A', status: 'UNDER_REVIEW', round: ROUND, leader: { fullName: 'SV A' }, memberCount: 2, advisor: null, latestSubmission: { seq: 2, createdAt: '2026-10-01T03:00:00Z' }, latestSimilarityLevel: null };
  it('gọi status=UNDER_REVIEW & updatedAt_asc, hiện hàng; mức null là "—" (không đoán), hạn quá khứ tô đỏ', async () => {
    map['GET /topics'] = { page: 1, pageSize: 20, total: 1, items: [item] };
    map['GET /rounds'] = { items: [ROUND] };
    map['GET /fields'] = { items: [] };
    open('/xet-duyet');
    expect(await screen.findByText(/DT-001 – Đề tài A/)).toBeTruthy();
    const url = sent('GET', '/topics')[0][0];
    expect(url).toContain('status=UNDER_REVIEW');
    expect(url).toContain('sort=updatedAt_asc');
    expect(screen.getByText('Chưa có mức trùng lặp')).toBeTruthy();
    expect(screen.queryByText(/Không trùng/)).toBeNull();
    expect(screen.getByText(/Hạn xét duyệt/).className).toContain('text-red-700');
  });
  it('rỗng và lỗi API', async () => {
    map['GET /topics'] = { page: 1, pageSize: 20, total: 0, items: [] };
    map['GET /rounds'] = { items: [] };
    map['GET /fields'] = { items: [] };
    open('/xet-duyet');
    expect(await screen.findByText('Không có hồ sơ nào chờ xét duyệt.')).toBeTruthy();
    cleanup();
    map['GET /topics'] = apiErr(500, 'INTERNAL', 'Máy chủ lỗi');
    open('/xet-duyet');
    expect(await screen.findByText('Máy chủ lỗi')).toBeTruthy();
  });
});

describe('Màn xét duyệt (R17)', () => {
  const act = () => sent('POST', '/topics/t1/actions');
  it('hiện snapshot, giải trình, quyết định lần trước; Duyệt gửi submissionId + version', async () => {
    map['GET /topics/t1'] = { topic: topic() };
    map['POST /topics/t1/actions'] = { topic: topic({ status: 'IN_PROGRESS' }) };
    open('/xet-duyet/t1');
    expect(await screen.findByText('Xét duyệt – lần gửi 2')).toBeTruthy();
    expect(screen.getByText('Khác phạm vi vì dùng dữ liệu riêng')).toBeTruthy();
    expect(await screen.findByText('Thiếu mục tiêu', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Duyệt' }));
    await waitFor(() => expect(act()[0][1].body).toEqual({ action: 'APPROVE', version: 5, submissionId: 's2' }));
  });
  it('Từ chối bắt buộc lý do rồi gửi reason + submissionId', async () => {
    map['POST /topics/t1/actions'] = { topic: topic({ status: 'REJECTED' }) };
    open('/xet-duyet/t1');
    fireEvent.click(await screen.findByRole('button', { name: 'Từ chối đề tài' }));
    const dlg = screen.getByRole('dialog');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Từ chối' }));
    await waitFor(() => expect(within(dlg).getByRole('textbox').getAttribute('aria-invalid')).toBe('true'));
    expect(act()).toHaveLength(0);
    fireEvent.change(within(dlg).getByRole('textbox'), { target: { value: 'Trùng đề tài cũ' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Từ chối' }));
    await waitFor(() => expect(act()[0][1].body).toEqual({ action: 'REJECT', version: 5, submissionId: 's2', reason: 'Trùng đề tài cũ' }));
  });
  it('STALE_SUBMISSION: báo người dùng và tải lại snapshot mới nhất', async () => {
    let latest = { id: 's2', seq: 2 };
    map['GET /topics/t1'] = () => ({ topic: topic({ latestSubmission: { ...latest, createdAt: '2026-10-01T03:00:00Z', decision: null } }) });
    map['GET /topics/t1/submissions/3'] = { submission: sub({ id: 's3', seq: 3 }) };
    map['POST /topics/t1/actions'] = () => { latest = { id: 's3', seq: 3 }; return apiErr(409, 'STALE_SUBMISSION', 'Hồ sơ đã có lần gửi mới'); };
    open('/xet-duyet/t1');
    fireEvent.click(await screen.findByRole('button', { name: 'Duyệt' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Duyệt' }));
    expect(await screen.findByText('Xét duyệt – lần gửi 3')).toBeTruthy();
    expect(toastStore.get().some((t) => /lần mới hoặc đã được xử lý/.test(t.message))).toBe(true);
    expect(sent('GET', '/topics/t1/submissions/3').length).toBeGreaterThan(0);
  });
  it('đã có quyết định hoặc không có action -> không có nút', async () => {
    map['GET /topics/t1'] = { topic: topic({ availableActions: [] }) };
    open('/xet-duyet/t1');
    await screen.findByText('Xét duyệt – lần gửi 2');
    expect(screen.queryByRole('button', { name: 'Duyệt' })).toBeNull();
  });
  it('R6: STAFF có APPROVE thấy nút Xét duyệt dẫn sang R17', async () => {
    open('/de-tai/t1');
    await screen.findByText('Đề tài A');
    expect(screen.getAllByRole('link', { name: 'Xét duyệt' }).map((l) => l.getAttribute('href'))).toContain('/xet-duyet/t1');
  });
});

describe('Lịch sử, snapshot, so sánh (R11–R13)', () => {
  it('R11: chọn 2 lần gửi -> sang so sánh from<to; có lịch sử trạng thái', async () => {
    map['GET /topics/t1/status-history'] = { items: [{ from: 'DRAFT', to: 'UNDER_REVIEW', action: 'SUBMIT_FOR_REVIEW', actor: { fullName: 'SV A', role: 'STUDENT' }, reason: null, at: '2026-10-01T03:00:00Z' }] };
    const { router } = open('/de-tai/t1/lich-su');
    fireEvent.click(await screen.findByLabelText('Chọn lần gửi 2 để so sánh'));
    fireEvent.click(screen.getByLabelText('Chọn lần gửi 1 để so sánh'));
    expect(screen.getByText('Chưa xử lý')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'So sánh 2 lần đã chọn' }));
    await waitFor(() => expect(router.state.location.search).toBe('?from=1&to=2'));
  });
  it('R12: hiện payload, giải trình và quyết định', async () => {
    map['GET /topics/t1/submissions/1'] = { submission: sub({ id: 's1', seq: 1, decision: { action: 'REJECT', reason: 'Trùng', decidedBy: { fullName: 'Cán bộ' }, decidedAt: '2026-09-20T03:00:00Z' } }) };
    open('/de-tai/t1/lan-gui/1');
    expect(await screen.findByText('học máy cơ bản')).toBeTruthy();
    expect(screen.getByText('Khác phạm vi vì dùng dữ liệu riêng')).toBeTruthy();
    expect(screen.getByText('Lý do: Trùng')).toBeTruthy();
  });
  it('R13: tô phần thêm/bớt và từ khóa; mặc định lần trước vs mới nhất', async () => {
    map['GET /topics/t1/submission-diff'] = {
      from: { seq: 1, createdAt: '2026-09-01T03:00:00Z', payload: payload() },
      to: { seq: 2, createdAt: '2026-10-01T03:00:00Z', payload: payload({ summary: 'học máy nâng cao', keywords: ['nlp'] }) },
      changes: { title: false, summary: true, objectives: false, fieldId: false, keywords: { added: ['nlp'], removed: ['ai'] } },
    };
    open('/de-tai/t1/so-sanh');
    await waitFor(() => expect(sent('GET', '/topics/t1/submission-diff')[0][0]).toContain('from=1&to=2'));
    expect((await screen.findAllByTestId('diff-add')).some((e) => e.textContent.includes('nâng cao'))).toBe(true);
    expect(screen.getAllByTestId('diff-del').some((e) => e.textContent.includes('cơ bản'))).toBe(true);
    expect(screen.getByText('+ nlp')).toBeTruthy();
    expect(screen.getByText('− ai')).toBeTruthy();
  });
});
