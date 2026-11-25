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
import { SIMILARITY_LEVEL_LABEL } from '@nckh/shared';
import { SimilarityLevelCell,SimilarityPanel } from '../src/components/SimilarityPanel.jsx';

const USERS = {
  STUDENT: { id: 'sv1', code: 'SV1', fullName: 'An', role: 'STUDENT' },
  LECTURER: { id: 'gv1', code: 'GV1', fullName: 'Cô Lan', role: 'LECTURER' },
  STAFF: { id: 'cb1', code: 'CB1', fullName: 'Cán bộ', role: 'STAFF', staffFacultyIds: ['f1'] },
};
const apiErr = (status, code, message, extra = {}) => Object.assign(new Error(message), { status, code, ...extra });
const CFG = { allowedFileTypes: ['pdf'], maxFileSizeMB: 10, maxMembers: 5 };
const topic = (o = {}, perm = {}) => ({
  id: 't1', code: 'DT-001', title: 'Đề tài A', summary: 'Tóm tắt', objectives: 'Mục tiêu', status: 'IN_PROGRESS', version: 5, keywords: [],
  members: [{ userId: 'sv1', fullName: 'An', code: 'SV1', role: 'LEADER' }], field: { id: 'fd1', name: 'AI' },
  round: { id: 'r1', name: 'Đợt 1', academicYear: '2026-2027', effectiveConfig: CFG },
  advisor: { id: 'gv1', fullName: 'Cô Lan' }, availableActions: [], currentResult: null, closeReadiness: null, latestSimilarity: null, latestSubmission: null,
  similarityBypass: null, pendingChangeRequests: [], ...o,
  permissions: { viewHistory: true, readExecution: true, ...perm },
});
const ms = (o = {}) => ({
  id: 'm1', topicId: 't1', order: 1, name: 'Báo cáo giữa kỳ', output: 'PDF', dueAt: '2027-03-01T16:59:59.000Z', required: true,
  evaluation: 'PENDING', version: 2, isOverdue: false, latestDocument: null, dueChangeCount: 0, reopenCount: 0, lastReopen: null, createdAt: '2027-01-01T00:00:00.000Z', ...o,
});
const page = (items, o = {}) => ({ items, page: 1, pageSize: 20, total: items.length, ...o });

let map;
let client;
const open = (url, role) => {
  auth.clear();
  auth.setSession({ accessToken: 't', user: { mustChangePassword: false, facultyId: 'f1', ...USERS[role] } });
  calls.api = vi.fn(async (path, opts = {}) => {
    const h = map[`${opts.method ?? 'GET'} ${path.split('?')[0]}`];
    if (!h) throw apiErr(404, 'NOT_FOUND', `không mock ${path}`);
    const r = typeof h === 'function' ? h(path, opts) : h;
    if (r instanceof Error) throw r;
    return r;
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><RouterProvider router={createMemoryRouter(routes, { initialEntries: [url] })} /></QueryClientProvider>);
};
const sent = (method, path) => calls.api.mock.calls.filter(([p, o]) => p.split('?')[0] === path && (o?.method ?? 'GET') === method);
const type = (label, value, root = screen) => fireEvent.change(root.getByLabelText(label), { target: { value } });
const dialog = () => screen.getByRole('dialog');

beforeEach(() => {
  map = {
    'GET /topics/t1': { topic: topic() },
    'GET /topics/t1/milestones': { items: [ms()] },
    'GET /topics/t1/progress': page([]),
    'GET /topics/t1/documents': { items: [] },
    'GET /topics/t1/feedbacks': page([], { pageSize: 100 }),
    'GET /topics/t1/results': { current: null, items: [] },
    'GET /topics/t1/change-requests': page([]),
  };
});
afterEach(() => { cleanup(); clearToasts(); vi.restoreAllMocks(); });

describe('FR22 mở lại mốc', () => {
  const passed = ms({ evaluation: 'PASSED', reopenCount: 2, lastReopen: { reason: 'Thiếu số liệu', reopenedAt: '2027-03-05T01:00:00.000Z', reopenedBy: { fullName: 'Cô Lan' } } });

  it('nút chỉ hiện khi permissions.reopenMilestone và mốc Đạt; hiện số lần và lý do gần nhất', async () => {
    map['GET /topics/t1'] = { topic: topic({}, { reopenMilestone: true }) };
    map['GET /topics/t1/milestones'] = { items: [passed, ms({ id: 'm2', order: 2, name: 'Mốc hai' })] };
    open('/de-tai/t1/moc', 'LECTURER');
    expect(await screen.findByText('Đã mở lại 2 lần')).toBeTruthy();
    expect(screen.getByText(/Thiếu số liệu/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Mở lại mốc' })).toHaveLength(1);
  });

  it('không có quyền thì không có nút', async () => {
    map['GET /topics/t1/milestones'] = { items: [passed] };
    open('/de-tai/t1/moc', 'STAFF');
    await screen.findByText('Đã mở lại 2 lần');
    expect(screen.queryByRole('button', { name: 'Mở lại mốc' })).toBeNull();
  });

  it('lý do bắt buộc; gửi {reason, version} theo version lúc gửi (đã tải lại), không theo lúc bấm mở hộp', async () => {
    map['GET /topics/t1'] = { topic: topic({}, { reopenMilestone: true }) };
    map['GET /topics/t1/milestones'] = { items: [passed] };
    map['POST /milestones/m1/reopen'] = { milestone: ms(), reopen: { id: 'r1' } };
    open('/de-tai/t1/moc', 'LECTURER');
    fireEvent.click(await screen.findByRole('button', { name: 'Mở lại mốc' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Mở lại' }));
    expect(await within(dialog()).findByText(/Lý do tối thiểu 5 ký tự/)).toBeTruthy();
    expect(sent('POST', '/milestones/m1/reopen')).toHaveLength(0);
    map['GET /topics/t1/milestones'] = { items: [{ ...passed, version: 7 }] };
    await client.invalidateQueries({ queryKey: ['milestones', 't1'] });
    await waitFor(() => expect(sent('GET', '/topics/t1/milestones')).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 50)); // để React vẽ lại với version mới
    type('Lý do', 'Cần bổ sung phụ lục', within(dialog()));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Mở lại' }));
    await waitFor(() => expect(sent('POST', '/milestones/m1/reopen')[0][1].body).toEqual({ reason: 'Cần bổ sung phụ lục', version: 7 }));
  });

  it('409 MILESTONE_NOT_PASSED hiện thông điệp trong hộp', async () => {
    map['GET /topics/t1'] = { topic: topic({}, { reopenMilestone: true }) };
    map['GET /topics/t1/milestones'] = { items: [passed] };
    map['POST /milestones/m1/reopen'] = apiErr(409, 'MILESTONE_NOT_PASSED', 'Chỉ mở lại được mốc đã Đạt');
    open('/de-tai/t1/moc', 'LECTURER');
    fireEvent.click(await screen.findByRole('button', { name: 'Mở lại mốc' }));
    type('Lý do', 'Cần bổ sung phụ lục', within(dialog()));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Mở lại' }));
    expect(await within(dialog()).findByText('Chỉ mở lại được mốc đã Đạt')).toBeTruthy();
  });

  it('lịch sử mở lại gọi GET /milestones/:id/reopens', async () => {
    map['GET /topics/t1/milestones'] = { items: [passed] };
    map['GET /milestones/m1/reopens'] = { items: [{ id: 'r1', reason: 'Lần một: thiếu hình', reopenedBy: { fullName: 'Cô Lan' }, reopenedAt: '2027-03-05T01:00:00.000Z' }] };
    open('/de-tai/t1/moc', 'STUDENT');
    fireEvent.click(await screen.findByRole('button', { name: 'Lịch sử mở lại' }));
    expect(await screen.findByText(/Lần một: thiếu hình/)).toBeTruthy();
  });
});

describe('MINOR T406', () => {
  it('sửa mốc gửi version hiện hành lúc gửi, không phải version lúc mở form', async () => {
    map['GET /topics/t1'] = { topic: topic({}, { manageMilestones: true }) };
    map['PATCH /milestones/m1'] = { milestone: ms() };
    open('/de-tai/t1/moc', 'LECTURER');
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa mốc' }));
    const form = screen.getByRole('form', { name: 'Sửa mốc' });
    map['GET /topics/t1/milestones'] = { items: [ms({ version: 9 })] };
    await client.invalidateQueries({ queryKey: ['milestones', 't1'] });
    await waitFor(() => expect(sent('GET', '/topics/t1/milestones')).toHaveLength(2));
    type('Tên mốc', 'Tên mới', within(form));
    fireEvent.click(within(form).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(sent('PATCH', '/milestones/m1')[0][1].body.version).toBe(9));
  });

  it('429 ở form tiến độ khóa nút và hiện thời gian chờ', async () => {
    map['GET /topics/t1'] = { topic: topic({}, { addProgress: true }) };
    map['POST /topics/t1/progress'] = apiErr(429, 'RATE_LIMITED', 'Bạn thao tác quá nhanh', { retryAfter: 120 });
    open('/de-tai/t1/tien-do', 'STUDENT');
    fireEvent.click(await screen.findByRole('button', { name: 'Cập nhật tiến độ' }));
    const form = screen.getByRole('form', { name: 'Cập nhật tiến độ' });
    type('Việc đã làm', 'Làm khảo sát', within(form));
    type('Kế hoạch tới', 'Viết báo cáo', within(form));
    type('Phần trăm hoàn thành (tự khai, 0–100)', '40', within(form));
    fireEvent.click(within(form).getByRole('button', { name: 'Lưu' }));
    expect(await within(form).findByText('Vui lòng thử lại sau 2 phút')).toBeTruthy();
    expect(within(form).getByRole('button', { name: 'Lưu' }).disabled).toBe(true);
  });

  it('nhận xét hơn 100 mục: có phân trang, trang sau gọi page=2', async () => {
    map['GET /topics/t1/documents'] = { items: [{
      id: 'd7', topicId: 't1', milestoneId: null, stage: 'OTHER', kind: 'FILE', version: 1, fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10,
      externalUrl: null, isLate: false, isLatest: true, uploadedBy: { id: 'sv1', fullName: 'An' }, uploadedAt: '2027-03-02T01:00:00.000Z', feedbackCount: 150,
    }] };
    const fb = (n) => ({ id: `f${n}`, content: `Nhận xét ${n}`, lecturer: { fullName: 'Cô Lan' }, createdAt: '2027-03-03T01:00:00.000Z' });
    map['GET /topics/t1/feedbacks'] = (p) => (p.includes('page=2') ? page([fb(101)], { page: 2, pageSize: 100, total: 150 }) : page([fb(1)], { page: 1, pageSize: 100, total: 150 }));
    open('/de-tai/t1/tai-lieu', 'STUDENT');
    fireEvent.click(await screen.findByRole('button', { name: 'Nhận xét (150)' }));
    expect(await screen.findByText('Trang 1/2 (150 mục)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByText('Nhận xét 101')).toBeTruthy();
  });
});

describe('FR23 sửa kết quả', () => {
  const cur = { id: 'r2', version: 2, result: 'GOOD', summary: 'Tổng kết cũ đủ hai mươi ký tự', isCurrent: true, createdBy: { fullName: 'GV' }, createdAt: '2027-06-01T01:00:00.000Z', reason: null };
  const old = { ...cur, id: 'r1', version: 1, result: 'PASS', isCurrent: false };
  const closed = (perm) => topic({ status: 'CLOSED' }, perm);

  it('nút chỉ hiện theo permissions.correctResult', async () => {
    map['GET /topics/t1'] = { topic: closed({}) };
    map['GET /topics/t1/results'] = { current: cur, items: [cur, old] };
    open('/de-tai/t1', 'STAFF');
    await screen.findByText(/Phiên bản 2/);
    expect(screen.queryByRole('button', { name: 'Sửa kết quả' })).toBeNull();
    cleanup();
    map['GET /topics/t1'] = { topic: closed({ correctResult: true }) };
    open('/de-tai/t1', 'STAFF');
    expect(await screen.findByRole('button', { name: 'Sửa kết quả' })).toBeTruthy();
  });

  it('lý do bắt buộc; gửi expectedVersion hiện hành, không gửi summary khi không đổi', async () => {
    map['GET /topics/t1'] = { topic: closed({ correctResult: true }) };
    map['GET /topics/t1/results'] = { current: cur, items: [cur, old] };
    map['POST /topics/t1/result-corrections'] = { result: { ...cur, version: 3 } };
    open('/de-tai/t1', 'STAFF');
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa kết quả' }));
    const form = screen.getByRole('form', { name: 'Sửa kết quả' });
    expect(within(form).getByLabelText('Nhận xét tổng kết').value).toBe(cur.summary);
    fireEvent.change(within(form).getByLabelText('Kết quả'), { target: { value: 'PASS' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Lưu phiên bản mới' }));
    expect(await within(form).findByText('Lý do tối thiểu 5 ký tự')).toBeTruthy();
    expect(sent('POST', '/topics/t1/result-corrections')).toHaveLength(0);
    type('Lý do sửa', 'Chấm lại sau phúc khảo', within(form));
    fireEvent.click(within(form).getByRole('button', { name: 'Lưu phiên bản mới' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/result-corrections')[0][1].body).toEqual({ result: 'PASS', reason: 'Chấm lại sau phúc khảo', expectedVersion: 2 }));
  });

  it('gửi summary khi đã đổi; 409 CONCURRENT_UPDATE hiện thông điệp và tải lại', async () => {
    map['GET /topics/t1'] = { topic: closed({ correctResult: true }) };
    map['GET /topics/t1/results'] = { current: cur, items: [cur] };
    map['POST /topics/t1/result-corrections'] = apiErr(409, 'CONCURRENT_UPDATE', 'Kết quả vừa được người khác sửa');
    open('/de-tai/t1', 'STAFF');
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa kết quả' }));
    const form = screen.getByRole('form', { name: 'Sửa kết quả' });
    type('Nhận xét tổng kết', 'Nhận xét tổng kết mới đủ dài hơn hai mươi', within(form));
    type('Lý do sửa', 'Nhập nhầm nhận xét', within(form));
    fireEvent.click(within(form).getByRole('button', { name: 'Lưu phiên bản mới' }));
    expect(await within(form).findByText(/Kết quả vừa được người khác sửa/)).toBeTruthy();
    expect(sent('POST', '/topics/t1/result-corrections')[0][1].body.summary).toBe('Nhận xét tổng kết mới đủ dài hơn hai mươi');
    await waitFor(() => expect(sent('GET', '/topics/t1/results').length).toBeGreaterThan(1));
  });

  it('lịch sử phiên bản hiện lý do sửa', async () => {
    map['GET /topics/t1'] = { topic: closed({}) };
    map['GET /topics/t1/results'] = { current: { ...cur, reason: 'Chấm lại sau phúc khảo' }, items: [{ ...cur, reason: 'Chấm lại sau phúc khảo' }, old] };
    open('/de-tai/t1', 'STUDENT');
    expect(await screen.findByText('Lý do sửa: Chấm lại sau phúc khảo')).toBeTruthy();
  });
});

describe('G5 cờ chưa kiểm tra', () => {
  const item = (o = {}) => ({
    id: 't1', code: 'DT-001', title: 'Đề tài A', status: 'UNDER_REVIEW', round: { name: 'Đợt 1' }, field: { name: 'AI' }, advisor: null, leader: { fullName: 'An' },
    memberCount: 2, latestSimilarityLevel: null, latestSimilarityStatus: null, latestSubmission: { seq: 1, createdAt: '2027-01-01T00:00:00Z', unchecked: false }, result: null, updatedAt: '2027-01-01T00:00:00Z', ...o,
  });

  it('danh sách: ERROR → "Chưa kiểm tra được" + cờ; null → "—"; không bao giờ "Không trùng"', async () => {
    map['GET /topics'] = page([
      item({ id: 'a', code: 'DT-A', latestSimilarityStatus: 'ERROR', latestSubmission: { seq: 1, createdAt: '2027-01-01T00:00:00Z', unchecked: true } }),
      item({ id: 'b', code: 'DT-B', latestSubmission: null }),
    ]);
    map['GET /invitations'] = page([]);
    map['GET /rounds'] = page([]);
    map['GET /catalog/fields'] = { items: [] };
    map['GET /fields'] = { items: [] };
    open('/de-tai', 'STUDENT');
    const rows = (await screen.findAllByRole('listitem')).filter((li) => li.textContent.includes('Trùng lặp'));
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Chưa kiểm tra được')).toBeTruthy();
    expect(within(rows[0]).getByText('Gửi khi chưa kiểm tra')).toBeTruthy();
    expect(within(rows[1]).queryByText('Gửi khi chưa kiểm tra')).toBeNull();
    expect(screen.queryByText(/Không trùng|Không cảnh báo/)).toBeNull();
  });

  it('chi tiết: cán bộ thấy nút "Cho phép gửi" theo permissions, gửi lý do; lỗi 409 hiện trong hộp', async () => {
    map['GET /topics/t1'] = { topic: topic({ status: 'NEEDS_REVISION', latestSimilarity: { status: 'ERROR', level: null } }, { grantSimilarityBypass: true }) };
    map['POST /topics/t1/similarity-bypasses'] = apiErr(409, 'SIMILARITY_BYPASS_EXISTS', 'Đề tài đã được cho phép gửi khi chưa kiểm tra và chưa dùng');
    open('/de-tai/t1', 'STAFF');
    fireEvent.click(await screen.findByRole('button', { name: 'Cho phép gửi khi chưa kiểm tra' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cho phép' }));
    expect(await within(dialog()).findByText(/Lý do tối thiểu 5 ký tự/)).toBeTruthy();
    type('Lý do', 'Dịch vụ kiểm tra lỗi kéo dài', within(dialog()));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cho phép' }));
    expect(await within(dialog()).findByText(/chưa dùng/)).toBeTruthy();
    expect(sent('POST', '/topics/t1/similarity-bypasses')[0][1].body).toEqual({ reason: 'Dịch vụ kiểm tra lỗi kéo dài' });
  });

  it('ô mức: unchecked + đã có mức → mức và cờ; ERROR/null → "Chưa kiểm tra được", không "Không trùng"', () => {
    const { unmount } = render(<SimilarityLevelCell level="HIGH" status="OK" unchecked />);
    expect(screen.getByText('Gửi khi chưa kiểm tra')).toBeTruthy();
    expect(screen.queryByText('Chưa kiểm tra được')).toBeNull();
    expect(screen.getByText(SIMILARITY_LEVEL_LABEL.HIGH)).toBeTruthy();
    unmount();
    render(<SimilarityLevelCell level="NONE" status="ERROR" unchecked />);
    expect(screen.getByText('Chưa kiểm tra được')).toBeTruthy();
    expect(screen.queryByText(SIMILARITY_LEVEL_LABEL.NONE)).toBeNull();
    cleanup();
    render(<SimilarityLevelCell level={null} status={null} unchecked />);
    expect(screen.getByText('Chưa kiểm tra được')).toBeTruthy();
  });

  it('chi tiết: không có permission thì không có nút; SV thấy đã được cho phép và cờ ở lần gửi', async () => {
    const bypass = { id: 'b1', reason: 'Lỗi kéo dài', createdAt: '2027-01-02T01:00:00.000Z', grantedBy: { fullName: 'Cán bộ B' } };
    map['GET /topics/t1'] = { topic: topic({ status: 'HAS_ADVISOR', similarityBypass: bypass, latestSubmission: { seq: 1, createdAt: '2027-01-01T00:00:00Z', unchecked: true } }) };
    open('/de-tai/t1', 'STUDENT');
    expect(await screen.findByText(/Cán bộ đã cho phép gửi dù chưa kiểm tra được trùng lặp/)).toBeTruthy();
    expect(screen.getByText('Gửi khi chưa kiểm tra')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cho phép gửi khi chưa kiểm tra' })).toBeNull();
  });

  it('snapshot: cờ unchecked và người cho phép; người chỉ đọc lịch sử (GV cũ, SV đã rời) không thấy lý do (null)', async () => {
    map['GET /topics/t1/submissions/1'] = { submission: {
      id: 's1', seq: 1, createdAt: '2027-01-01T00:00:00Z', createdBy: { fullName: 'An' }, payload: { title: 'T', keywords: [] }, similarityCheck: { status: 'ERROR', level: null },
      decision: null, unchecked: true, similarityBypass: { reason: null, grantedBy: { fullName: 'Cán bộ B' }, createdAt: '2027-01-02T01:00:00.000Z' },
    } };
    open('/de-tai/t1/lan-gui/1', 'LECTURER');
    expect(await screen.findByText(/Cán bộ B đã cho phép gửi khi chưa kiểm tra được/)).toBeTruthy();
    expect(screen.getByText('Gửi khi chưa kiểm tra')).toBeTruthy();
    expect(screen.queryByText(/Lý do:/)).toBeNull();
  });

  it('panel: justificationMissing hiện "Chưa có giải trình"', () => {
    render(<SimilarityPanel check={{ status: 'OK', level: 'HIGH', createdAt: '2027-01-01T00:00:00Z', matches: [], justificationMissing: true }} />);
    expect(screen.getByText('Chưa có giải trình')).toBeTruthy();
  });

  it('panel: trạng thái đề tài trùng hiện nhãn tiếng Việt, không hiện mã enum', () => {
    const m = { code: 'NCKH-2026-0019', title: 'Tóm tắt văn bản', academicYear: '2026-2027', field: 'Trí tuệ nhân tạo', status: 'IN_PROGRESS', titleScore: 0.76, contentScore: 0.91, level: 'HIGH' };
    render(<SimilarityPanel check={{ status: 'OK', level: 'HIGH', createdAt: '2027-01-01T00:00:00Z', matches: [m] }} />);
    expect(screen.getByText('2026-2027 · Trí tuệ nhân tạo · Đang thực hiện')).toBeTruthy();
    expect(screen.queryByText(/IN_PROGRESS/)).toBeNull();
  });
});

describe('MINOR T607a', () => {
  const cr = (o = {}) => ({
    id: 'cr1', type: 'ADVISOR_CHANGE', status: 'PENDING', stage: 'STAFF', topic: { id: 't1', code: 'DT-001', title: 'Đề tài A' }, reason: 'Đi công tác',
    payload: { from: { fullName: 'TS. A' }, to: { fullName: 'TS. B' }, member: { fullName: 'Bình', code: 'SV2' }, addMember: { fullName: 'Chi', code: 'SV3' }, before: {}, after: {} },
    createdBy: { id: 'sv1', fullName: 'An', role: 'STUDENT' }, createdAt: '2027-01-01T00:00:00Z', target: null, similarityCheck: null, availableActions: ['APPROVE'], ...o,
  });

  it('hộp xác nhận Duyệt nêu hậu quả theo loại', async () => {
    map['GET /change-requests'] = page([cr(), cr({ id: 'cr2', type: 'LEAVE_GROUP' }), cr({ id: 'cr3', type: 'TOPIC_CHANGE' })]);
    open('/yeu-cau', 'STAFF');
    const cards = await screen.findAllByTestId('change-request');
    fireEvent.click(within(cards[0]).getByRole('button', { name: 'Duyệt' }));
    expect(within(dialog()).getByText(/TS\. B sẽ là giảng viên hướng dẫn mới; TS\. A mất mọi quyền/)).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Hủy' }));
    fireEvent.click(within(cards[1]).getByRole('button', { name: 'Duyệt' }));
    expect(within(dialog()).getByText(/Bình sẽ rời nhóm ngay/)).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Hủy' }));
    fireEvent.click(within(cards[2]).getByRole('button', { name: 'Duyệt' }));
    expect(within(dialog()).getByText(/Chi được thêm vào nhóm/)).toBeTruthy();
  });

  it('chọn GV mới có ô tìm: gọi API với q', async () => {
    map['GET /topics/t1'] = { topic: topic({}, { requestAdvisorChange: true }) };
    map['GET /lecturers'] = page([]);
    open('/de-tai/t1/yeu-cau', 'STUDENT');
    fireEvent.click(await screen.findByRole('button', { name: 'Thay giảng viên' }));
    type('Tìm giảng viên', 'Minh', within(dialog()));
    await waitFor(() => expect(sent('GET', '/lecturers').some(([p]) => p.includes('q=Minh'))).toBe(true), { timeout: 2000 });
  });

  it('nhãn thông báo các loại mới có tiếng Việt', async () => {
    const { NOTIFICATION_TYPE_LABEL } = await import('@nckh/shared');
    for (const t of ['RESULT_CORRECTED', 'MILESTONE_REOPENED', 'SIMILARITY_BYPASS_GRANTED', 'SIMILARITY_RECHECKED', 'MEMBER_LEFT', 'CHANGE_DECIDED', 'ADVISOR_HANDOVER']) {
      expect(NOTIFICATION_TYPE_LABEL[t], t).toBeTruthy();
    }
  });
});
