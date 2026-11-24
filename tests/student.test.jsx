import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import { justificationState, needsFreshCheck } from '../src/lib/similarity.js';
import { submitProblems, topicToForm } from '../src/lib/topicForm.js';

const apiErr = (status, code, message, details) => Object.assign(new Error(message), { status, code, details });
const CFG = { minMembers: 1, maxMembers: 5, minSummaryWords: 3, minKeywords: 3, maxKeywords: 5 };
const topic = (o = {}) => ({
  id: 't1', code: 'DT-001', title: 'Hệ thống gợi ý học tập', summary: 'một hai ba bốn', objectives: 'Mục tiêu đủ hai mươi ký tự', keywords: ['a', 'b', 'c'],
  field: { id: 'fd1', name: 'AI' }, status: 'HAS_ADVISOR', version: 1,
  round: { id: 'r1', name: 'Đợt 1', academicYear: '2026-2027', effectiveConfig: CFG, registrationOpen: true },
  members: [{ userId: 'sv1', code: 'SV1', fullName: 'An', role: 'LEADER', joinedAt: '2026-11-01T00:00:00Z' }], pendingInvitations: [], advisor: null,
  availableActions: ['SUBMIT_FOR_REVIEW'], permissions: { edit: false, invite: false, transferLeader: false, checkSimilarity: true }, ...o,
});
const THRESH = { minJustificationWords: 3, titleReview: 0.5, titleHigh: 0.7, contentReview: 0.35, contentHigh: 0.55 };
const check = (level, o = {}) => ({ id: 'sc1', status: 'OK', level, createdAt: new Date().toISOString(), isStale: false, thresholds: THRESH, matches: [], algorithmVersion: 'v1', corpusSize: 10, ...o });

let map;
let client;
const open = (url) => {
  auth.clear();
  auth.setSession({ accessToken: 't', user: { id: 'sv1', code: 'SV1', fullName: 'An', role: 'STUDENT', mustChangePassword: false, facultyId: 'f1' } });
  calls.api = vi.fn(async (path, opts = {}) => {
    const h = map[`${opts.method ?? 'GET'} ${path.split('?')[0]}`];
    if (!h) throw apiErr(404, 'NOT_FOUND', 'không mock');
    const r = typeof h === 'function' ? h(path, opts) : h;
    if (r instanceof Error) throw r;
    return r;
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><RouterProvider router={createMemoryRouter(routes, { initialEntries: [url] })} /></QueryClientProvider>);
};
const sent = (method, path) => calls.api.mock.calls.filter(([p, o]) => p.split('?')[0] === path && (o?.method ?? 'GET') === method);

beforeEach(() => {
  map = {
    'GET /topics/t1': { topic: topic() },
    'GET /topics/t1/similarity-checks/latest': { similarityCheck: check('HIGH') },
    'GET /fields': { items: [{ id: 'fd1', name: 'AI' }] },
  };
});
afterEach(() => { cleanup(); clearToasts(); });

describe('logic thuần', () => {
  it('justificationState: đỏ bắt buộc đủ từ; vàng tùy chọn; lỗi/chưa kiểm không phải "không trùng"', () => {
    expect(justificationState(check('HIGH'), 'một hai').ok).toBe(false);
    expect(justificationState(check('HIGH'), 'một hai ba').ok).toBe(true);
    expect(justificationState(check('REVIEW'), '')).toMatchObject({ kind: 'review', required: false, ok: true });
    expect(justificationState(check('NONE'), '').kind).toBe('none');
    expect(justificationState(check(null, { status: 'ERROR' }), '').kind).toBe('error');
    expect(justificationState(null).kind).toBe('unchecked');
  });
  it('needsFreshCheck: chưa có, cũ nội dung hoặc quá 24 giờ', () => {
    expect(needsFreshCheck(null)).toBe(true);
    expect(needsFreshCheck(check('NONE', { isStale: true }))).toBe(true);
    expect(needsFreshCheck(check('NONE', { createdAt: new Date(Date.now() - 25 * 3600e3).toISOString() }))).toBe(true);
    expect(needsFreshCheck(check('NONE'))).toBe(false);
  });
  it('topicToForm lấy fieldId từ field.id; submitProblems báo trường thiếu', () => {
    expect(topicToForm(topic()).fieldId).toBe('fd1');
    expect(submitProblems(topicToForm(topic()), CFG)).toEqual({});
    expect(Object.keys(submitProblems(topicToForm(topic({ field: null, keywords: [] })), CFG)).sort()).toEqual(['fieldId', 'keywords']);
  });
});

describe('R7 – soạn hồ sơ nạp giá trị một lần', () => {
  it('tải lại đề tài chỉ cập nhật version, không ghi đè ô đang nhập', async () => {
    let current = topic({ status: 'DRAFT', version: 1, availableActions: [], permissions: { edit: true, invite: true, transferLeader: true, checkSimilarity: true } });
    map['GET /topics/t1'] = () => ({ topic: current });
    map['PUT /topics/t1'] = () => ({ topic: { ...current, version: 3 } });
    open('/de-tai/t1/sua');
    const title = await screen.findByLabelText('Tên đề tài');
    fireEvent.change(title, { target: { value: 'Tên tôi đang gõ dở' } });
    current = { ...current, title: 'Tên do người khác sửa', version: 2 };
    await act(() => client.invalidateQueries({ queryKey: ['topic', 't1'] }));
    await waitFor(() => expect(client.getQueryData(['topic', 't1']).version).toBe(2));
    expect(screen.getByLabelText('Tên đề tài').value).toBe('Tên tôi đang gõ dở');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(sent('PUT', '/topics/t1')).toHaveLength(1));
    expect(sent('PUT', '/topics/t1')[0][1].body).toMatchObject({ title: 'Tên tôi đang gõ dở', version: 2, fieldId: 'fd1' });
  });
});

describe('R7 – ô Lĩnh vực', () => {
  it('danh mục lĩnh vực tải xong sau form: ô vẫn hiện lĩnh vực đã lưu', async () => {
    let release;
    const late = new Promise((r) => { release = r; });
    map['GET /topics/t1'] = { topic: topic({ status: 'DRAFT', permissions: { edit: true } }) };
    map['GET /fields'] = () => late;
    open('/de-tai/t1/sua');
    const select = await screen.findByLabelText('Lĩnh vực');
    expect(select.value).toBe('');
    await act(async () => release({ items: [{ id: 'fd0', name: 'Khác' }, { id: 'fd1', name: 'AI' }] }));
    await waitFor(() => expect(screen.getByLabelText('Lĩnh vực').value).toBe('fd1'));
  });
});

describe('R10 – gửi xét duyệt, cảnh báo vàng/đỏ, giải trình', () => {
  const submitBtn = () => screen.getByRole('button', { name: 'Gửi xét duyệt' });

  it('đỏ: nút gửi chỉ bật khi giải trình đủ số từ; body kèm justification', async () => {
    map['POST /topics/t1/actions'] = { topic: topic(), submission: { id: 's1', seq: 1 }, similarityCheck: check('HIGH') };
    open('/de-tai/t1/gui');
    expect(await screen.findByText('Nghi trùng cao')).toBeTruthy();
    expect(submitBtn().disabled).toBe(true);
    const box = screen.getByLabelText(/Giải trình \(bắt buộc\)/);
    fireEvent.change(box, { target: { value: 'chỉ hai' } });
    expect(submitBtn().disabled).toBe(true);
    fireEvent.change(box, { target: { value: 'giải trình đủ ba' } });
    expect(submitBtn().disabled).toBe(false);
    fireEvent.click(submitBtn());
    await waitFor(() => expect(sent('POST', '/topics/t1/actions')[0][1].body).toEqual({ action: 'SUBMIT_FOR_REVIEW', version: 1, justification: 'giải trình đủ ba' }));
  });

  it('vàng: giải trình tùy chọn, gửi được ngay', async () => {
    map['GET /topics/t1/similarity-checks/latest'] = { similarityCheck: check('REVIEW') };
    open('/de-tai/t1/gui');
    expect(await screen.findByText('Cần xem xét')).toBeTruthy();
    expect(screen.getByLabelText(/Giải trình \(tùy chọn\)/)).toBeTruthy();
    expect(submitBtn().disabled).toBe(false);
  });

  it('ERROR: hiện "Chưa kiểm tra được", không hiện "không cảnh báo"', async () => {
    map['GET /topics/t1/similarity-checks/latest'] = { similarityCheck: check(null, { status: 'ERROR', message: 'Chưa kiểm tra được' }) };
    open('/de-tai/t1/gui');
    expect((await screen.findAllByText(/Chưa kiểm tra được/)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Không cảnh báo')).toBeNull();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });

  it('chưa có kết quả hoặc kết quả cũ: tự chạy Kiểm tra trước đúng một lần', async () => {
    map['GET /topics/t1/similarity-checks/latest'] = { similarityCheck: check('NONE', { isStale: true }) };
    map['POST /topics/t1/similarity-checks'] = { similarityCheck: check('NONE') };
    open('/de-tai/t1/gui');
    await waitFor(() => expect(sent('POST', '/topics/t1/similarity-checks')).toHaveLength(1));
    expect(await screen.findByText('Không cảnh báo')).toBeTruthy();
    expect(sent('POST', '/topics/t1/similarity-checks')).toHaveLength(1);
  });

  it('JUSTIFICATION_REQUIRED: thay panel bằng details.similarityCheck và invalidate ở onSettled', async () => {
    map['GET /topics/t1/similarity-checks/latest'] = { similarityCheck: check('REVIEW') };
    map['POST /topics/t1/actions'] = apiErr(400, 'JUSTIFICATION_REQUIRED', 'Hồ sơ nghi trùng cao, cần giải trình', { similarityCheck: check('HIGH') });
    open('/de-tai/t1/gui');
    await screen.findByText('Cần xem xét');
    const spy = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(submitBtn());
    expect(await screen.findByText('Nghi trùng cao')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('cần giải trình');
    const keys = spy.mock.calls.map(([f]) => f.queryKey[0]);
    expect(keys).toEqual(expect.arrayContaining(['topic', 'similarity-latest', 'topics', 'submissions']));
  });

  it('gửi thành công: invalidate topic, similarity-latest, topics, submissions', async () => {
    map['GET /topics/t1/similarity-checks/latest'] = { similarityCheck: check('NONE') };
    map['POST /topics/t1/actions'] = { topic: topic({ status: 'UNDER_REVIEW', availableActions: [] }), submission: { id: 's1', seq: 2 }, similarityCheck: check('NONE') };
    open('/de-tai/t1/gui');
    await screen.findByText('Không cảnh báo');
    const spy = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(submitBtn());
    await waitFor(() => expect(spy.mock.calls.map(([f]) => f.queryKey[0])).toEqual(expect.arrayContaining(['topic', 'similarity-latest', 'topics', 'submissions'])));
    await waitFor(() => expect(toastStore.get().map((t) => t.message)).toContain('Đã gửi hồ sơ lần 2'));
  });
});
