// TASK-DC-16: chấm bảo vệ R33 (danh sách phân công), R34 (chấm, bảng điểm, chốt 2 bước) – UI §12.9, API_GD7 §7;
// kèm MINOR từ DC-15: m1 (ô chọn GV chỉ truy vấn khi biết khoa), m2 (đã lưu tên, thành viên lỗi), m4 (chỉ dẫn biên bản), khóa form kết quả nguồn hội đồng.
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
import { MENU, canVisit } from '../src/lib/nav.js';
import { clearToasts, toastStore } from '../src/lib/toast.js';
import { previewAverage } from '../src/pages/defense/DefenseScorePage.jsx';

const apiErr = (status, code, message, details) => Object.assign(new Error(message), { status, code, details });
const topic = (o = {}) => ({
  id: 't1', code: 'DT-001', title: 'Hệ thống gợi ý học tập', summary: 'Tóm tắt đề tài', objectives: 'Mục tiêu', keywords: ['a'],
  field: { id: 'fd1', name: 'AI' }, status: 'WAITING_DEFENSE', version: 7, origin: 'STUDENT',
  round: { id: 'r1', name: 'Đợt 1', academicYear: '2026-2027', effectiveConfig: { maxMembers: 5 }, registrationOpen: false },
  members: [{ userId: 's1', fullName: 'An', code: 'SV1', role: 'LEADER' }], advisor: { id: 'gv9', fullName: 'Cô Lan' },
  availableActions: [], permissions: {}, processScore: null, defense: null, councilAccess: null, results: [], ...o,
});
const SCORES = [
  { member: { lecturerId: 'l1', fullName: 'Thầy Chủ', role: 'CHAIR' }, score: '8.00', comment: 'Tốt', updatedAt: '2026-11-20T01:00:00Z' },
  { member: { lecturerId: 'l2', fullName: 'Cô Thư', role: 'SECRETARY' }, score: '7.50', comment: 'Khá', updatedAt: '2026-11-20T01:00:00Z' },
];
const assignment = (o = {}) => ({
  id: 'as1', council: { id: 'c1', code: 'HD-2026-001', name: 'Hội đồng CNPM 1' }, myRole: 'MEMBER',
  topic: { id: 't1', code: 'DT-001', title: 'Hệ thống gợi ý học tập', status: 'WAITING_DEFENSE', advisor: { fullName: 'Cô Lan' } },
  processScore: { score: '7.25', comment: 'Chăm chỉ' }, scores: [], myScore: null, scoredCount: 2, memberCount: 3,
  finalScore: null, decision: null, minutes: null, decidedBy: null, decidedAt: null, cancelledAt: null, availableActions: ['SCORE'], ...o,
});
const page = (items) => ({ items, page: 1, pageSize: 20, total: items.length });
const USERS = {
  LECTURER: { id: 'gv1', code: 'GV1', fullName: 'Thầy Ủy', role: 'LECTURER' },
  STAFF: { id: 'cb1', code: 'CB1', fullName: 'Cán bộ', role: 'STAFF', staffFacultyIds: ['f1'] },
};

let map;
const open = (url, role = 'LECTURER') => {
  auth.clear();
  auth.setSession({ accessToken: 't', user: { ...USERS[role], mustChangePassword: false, facultyId: 'f1' } });
  calls.api = vi.fn(async (path, opts = {}) => {
    const h = map[`${opts.method ?? 'GET'} ${path.split('?')[0]}`];
    if (!h) throw apiErr(404, 'NOT_FOUND', 'không mock');
    const r = typeof h === 'function' ? h(path, opts) : h;
    if (r instanceof Error) throw r;
    return r;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><RouterProvider router={createMemoryRouter(routes, { initialEntries: [url] })} /></QueryClientProvider>);
};
const sent = (method, path) => calls.api.mock.calls.filter(([p, o]) => p.split('?')[0] === path && (o?.method ?? 'GET') === method);
const toasts = () => toastStore.get().map((t) => t.message);

beforeEach(() => {
  map = {
    'GET /council-assignments': page([]),
    'GET /council-assignments/as1': { assignment: assignment() },
    'GET /topics/t1': { topic: topic() },
    'GET /topics/t1/documents': { items: [{ id: 'd1', kind: 'FILE', fileName: 'bao-cao.pdf', version: 2, uploadedAt: '2026-11-19T02:00:00Z' }] },
    'GET /topics/t1/feedbacks': page([]),
    'GET /topics': page([]),
  };
});
afterEach(() => { cleanup(); clearToasts(); });

describe('menu, quyền vào trang', () => {
  it('GV có mục "Chấm bảo vệ"; SV/cán bộ không vào được /cham-bao-ve', () => {
    expect(MENU.LECTURER.some((m) => m.to === '/cham-bao-ve' && m.label === 'Chấm bảo vệ')).toBe(true);
    expect(canVisit('LECTURER', '/cham-bao-ve/as1')).toBe(true);
    expect(canVisit('STUDENT', '/cham-bao-ve')).toBe(false);
    expect(canVisit('STAFF', '/cham-bao-ve')).toBe(false);
  });
});

describe('R33 – danh sách phân công', () => {
  it('rỗng: thông điệp đặc tả', async () => {
    open('/cham-bao-ve');
    expect(await screen.findByText('Bạn chưa được phân công chấm đề tài nào.')).toBeTruthy();
    expect(sent('GET', '/council-assignments')[0][0]).toContain('status=OPEN');
  });

  it('dòng có vai trò, "Chưa chấm", tiến độ; tab Đã chốt gửi status=DECIDED', async () => {
    map['GET /council-assignments'] = page([assignment({ myRole: 'SECRETARY' })]);
    open('/cham-bao-ve');
    const link = await screen.findByRole('link', { name: 'Hệ thống gợi ý học tập' });
    expect(link.getAttribute('href')).toBe('/cham-bao-ve/as1');
    expect(screen.getByText('Chưa chấm')).toBeTruthy();
    expect(screen.getByText(/Đã chấm 2\/3/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Đã chốt' }));
    await waitFor(() => expect(sent('GET', '/council-assignments').some(([p]) => p.includes('status=DECIDED'))).toBe(true));
  });
});

describe('R34 – chấm', () => {
  it('ủy viên: hồ sơ (báo cáo, điểm quá trình), không có bảng điểm; lưu điểm gửi đúng body', async () => {
    map['PUT /council-assignments/as1/my-score'] = (p, o) => ({ assignment: assignment({ myScore: { ...o.body, score: '8.25', updatedAt: 'x' } }) });
    open('/cham-bao-ve/as1');
    expect(await screen.findByRole('button', { name: /Tải về.*bao-cao.pdf/ })).toBeTruthy();
    expect(sent('GET', '/topics/t1/documents')[0][0]).toContain('stage=FINAL');
    expect(screen.getByText('Chăm chỉ')).toBeTruthy();
    expect(screen.queryByText('Bảng điểm hội đồng')).toBeNull();
    fireEvent.change(screen.getByLabelText(/Điểm \(thang 10\)/), { target: { value: '8.25' } });
    fireEvent.change(screen.getByLabelText(/Nhận xét/), { target: { value: 'Trình bày rõ ràng, đúng mục tiêu.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu điểm' }));
    await waitFor(() => expect(sent('PUT', '/council-assignments/as1/my-score')).toHaveLength(1));
    expect(sent('PUT', '/council-assignments/as1/my-score')[0][1].body).toEqual({ score: 8.25, comment: 'Trình bày rõ ràng, đúng mục tiêu.' });
    await waitFor(() => expect(toasts()).toContain('Đã lưu điểm'));
  });

  it('điểm 11 bị chặn ở client', async () => {
    open('/cham-bao-ve/as1');
    fireEvent.change(await screen.findByLabelText(/Điểm \(thang 10\)/), { target: { value: '11' } });
    fireEvent.change(screen.getByLabelText(/Nhận xét/), { target: { value: 'Trình bày rõ ràng, đúng mục tiêu.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu điểm' }));
    expect(await screen.findByText('Điểm phải từ 0 đến 10, tối đa 2 chữ số thập phân')).toBeTruthy();
    expect(sent('PUT', '/council-assignments/as1/my-score')).toHaveLength(0);
  });

  it('đề tài đã đóng: không gọi API đề tài, hiện chỉ dẫn Kho đề tài', async () => {
    map['GET /council-assignments/as1'] = { assignment: assignment({ topic: { ...assignment().topic, status: 'CLOSED' }, availableActions: [] }) };
    open('/cham-bao-ve/as1');
    expect(await screen.findByText(/Đề tài đã đóng/)).toBeTruthy();
    expect(sent('GET', '/topics/t1')).toHaveLength(0);
  });
});

describe('R34 – chốt (thư ký)', () => {
  const officer = () => assignment({ myRole: 'SECRETARY', scores: SCORES, availableActions: ['SCORE', 'FINALIZE'] });
  const MINUTES = 'Hội đồng thống nhất đề tài đạt yêu cầu nghiệm thu.';
  const goStep2 = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Chốt nghiệm thu' }));
    const dlg = await screen.findByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText(/Biên bản/), { target: { value: MINUTES } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Tiếp tục' }));
    await within(dlg).findByText(/khóa toàn bộ điểm/);
    return dlg;
  };

  it('bảng điểm + trung bình tạm tính; chốt 2 bước gửi { version, minutes }', async () => {
    map['GET /council-assignments/as1'] = { assignment: officer() };
    map['POST /council-assignments/as1/finalize'] = { assignment: officer(), topic: topic({ status: 'WAITING_CLOSE' }) };
    open('/cham-bao-ve/as1');
    expect(await screen.findByText('Bảng điểm hội đồng')).toBeTruthy();
    expect(screen.getByText('Điểm trung bình tạm tính:')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Chốt nghiệm thu' }).disabled).toBe(false));
    const dlg = await goStep2();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Chốt nghiệm thu' }));
    await waitFor(() => expect(sent('POST', '/council-assignments/as1/finalize')).toHaveLength(1));
    expect(sent('POST', '/council-assignments/as1/finalize')[0][1].body).toEqual({ version: 7, minutes: MINUTES });
    await waitFor(() => expect(toasts()).toContain('Đã chốt nghiệm thu đề tài DT-001'));
  });

  it('SCORES_INCOMPLETE: quay về bước 1, liệt kê người chưa chấm', async () => {
    map['GET /council-assignments/as1'] = { assignment: officer() };
    map['POST /council-assignments/as1/finalize'] = apiErr(409, 'SCORES_INCOMPLETE', 'Còn thành viên chưa chấm', { missing: [{ fullName: 'Thầy Ủy', role: 'MEMBER' }] });
    open('/cham-bao-ve/as1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Chốt nghiệm thu' }).disabled).toBe(false));
    const dlg = await goStep2();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Chốt nghiệm thu' }));
    expect(await within(dlg).findByText('Thầy Ủy (Ủy viên)')).toBeTruthy();
    expect(within(dlg).getByText('Còn thành viên chưa chấm')).toBeTruthy();
    expect(within(dlg).getByRole('button', { name: 'Tiếp tục' })).toBeTruthy();
  });

  it('trung bình tạm tính chuỗi 2 chữ số', () => {
    expect(previewAverage(SCORES)).toBe('7.75');
    expect(previewAverage([])).toBeNull();
  });
});

describe('MINOR từ DC-15', () => {
  it('m4: khối bảo vệ đã chốt chỉ dẫn tới "Kết quả cuối"; kết quả nguồn hội đồng khóa form GVHD', async () => {
    map['GET /topics/t1'] = { topic: topic({
      status: 'WAITING_CLOSE',
      defense: { assignmentId: 'as1', council: { code: 'HD-2026-001', name: 'Hội đồng CNPM 1' }, state: 'DECIDED', finalScore: '7.75', decision: 'PASSED', decidedAt: '2026-11-20T02:00:00Z', scores: SCORES },
      permissions: { enterResult: true, readExecution: true },
    }) };
    const rv = { id: 'rv1', version: 1, result: 'GOOD', summary: 'Biên bản', source: 'COUNCIL', isCurrent: true, createdAt: '2026-11-20T02:00:00Z', createdBy: { fullName: 'Cô Thư' } };
    map['GET /topics/t1/results'] = { current: rv, items: [rv] };
    open('/de-tai/t1');
    expect(await screen.findByText('Biên bản hội đồng: xem mục "Kết quả cuối".')).toBeTruthy();
    expect(await screen.findByText('Kết quả do hội đồng quyết định.')).toBeTruthy();
  });

  it('m1: lập hội đồng chưa chọn đợt thì không truy vấn giảng viên', async () => {
    map['GET /rounds'] = { items: [{ id: 'r1', name: 'Đợt 1', academicYear: '2026-2027', facultyId: 'f1' }] };
    map['GET /users'] = page([]);
    open('/hoi-dong/moi', 'STAFF');
    expect(await screen.findByText('Chọn đợt trước để tìm giảng viên cùng khoa.')).toBeTruthy();
    expect(sent('GET', '/users')).toHaveLength(0);
  });
});
