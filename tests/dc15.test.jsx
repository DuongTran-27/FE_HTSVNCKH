// TASK-DC-15: ra hội đồng trên R6 (REQUEST_DEFENSE, RETURN_FROM_DEFENSE, khối bảo vệ + điểm quá trình) và hội đồng R30–R32.
// Mô phỏng api như dc13/dc14, dựng toàn bộ route để kiểm cả quyền vào trang, menu và nút theo availableActions.
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

const apiErr = (status, code, message, details) => Object.assign(new Error(message), { status, code, details });
const topic = (o = {}) => ({
  id: 't1', code: 'DT-001', title: 'Hệ thống gợi ý học tập', summary: 'Tóm tắt', objectives: 'Mục tiêu', keywords: ['a'],
  field: { id: 'fd1', name: 'AI' }, status: 'IN_PROGRESS', version: 4, origin: 'STUDENT',
  round: { id: 'r1', name: 'Đợt 1', academicYear: '2026-2027', effectiveConfig: { maxMembers: 5 }, registrationOpen: false },
  members: [], advisor: { id: 'gv1', fullName: 'Cô Lan' }, availableActions: [], permissions: {},
  processScore: null, defense: null, councilAccess: null, ...o,
});
const council = (o = {}) => ({
  id: 'c1', code: 'HD-2026-001', name: 'Hội đồng CNPM 1', version: 1, round: { id: 'r1', name: 'Đợt 1', academicYear: '2026-2027', facultyId: 'f1' },
  members: [{ lecturerId: 'l1', fullName: 'Thầy Chủ', role: 'CHAIR' }, { lecturerId: 'l2', fullName: 'Cô Thư', role: 'SECRETARY' }, { lecturerId: 'l3', fullName: 'Thầy Ủy', role: 'MEMBER' }],
  assignments: [], locked: false, createdAt: '2026-11-18T03:00:00Z', ...o,
});
const assignment = (o = {}) => ({
  id: 'as1', topic: { id: 't1', code: 'DT-001', title: 'Hệ thống gợi ý học tập', status: 'WAITING_DEFENSE' }, advisor: { fullName: 'Cô Lan' },
  scoredCount: 0, memberCount: 3, finalScore: null, decision: null, decidedAt: null, cancelledAt: null, ...o,
});
const page = (items) => ({ items, page: 1, pageSize: 20, total: items.length });
const LECTURERS = [['l1', 'Thầy Chủ'], ['l2', 'Cô Thư'], ['l3', 'Thầy Ủy'], ['l4', 'Cô Bốn']].map(([id, fullName]) => ({ id, code: id.toUpperCase(), fullName }));
const COMMENT = 'Nhóm làm việc chăm chỉ, đúng tiến độ đề ra.';
const USERS = {
  LECTURER: { id: 'gv1', code: 'GV1', fullName: 'Cô Lan', role: 'LECTURER' },
  STAFF: { id: 'cb1', code: 'CB1', fullName: 'Cán bộ', role: 'STAFF', staffFacultyIds: ['f1'] },
  STUDENT: { id: 's1', code: 'SV1', fullName: 'An', role: 'STUDENT' },
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
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
};
const sent = (method, path) => calls.api.mock.calls.filter(([p, o]) => p.split('?')[0] === path && (o?.method ?? 'GET') === method);
const toasts = () => toastStore.get().map((t) => t.message);

beforeEach(() => {
  map = {
    'GET /topics/t1': { topic: topic() },
    'GET /rounds': { items: [{ id: 'r1', name: 'Đợt 1', academicYear: '2026-2027', facultyId: 'f1' }] },
    'GET /councils': page([{ ...council(), assignments: undefined, assignmentCount: 2 }]),
    'GET /councils/c1': { council: council() },
    'GET /users': page(LECTURERS),
    'GET /topics': page([]),
  };
});
afterEach(() => { cleanup(); clearToasts(); });

describe('R6 – đề nghị ra hội đồng (GVHD)', () => {
  const openDialog = async () => {
    map['GET /topics/t1'] = { topic: topic({ availableActions: ['REQUEST_DEFENSE'] }) };
    open('/de-tai/t1');
    fireEvent.click(await screen.findByRole('button', { name: 'Đề nghị ra hội đồng' }));
    return screen.findByRole('dialog');
  };

  it('validate bằng schema dùng chung: thiếu điểm, nhận xét ngắn → không gọi API; có cảnh báo khóa tài liệu', async () => {
    const dlg = await openDialog();
    expect(within(dlg).getByText('Sau khi gửi, sinh viên không nộp hoặc sửa tài liệu được nữa.')).toBeTruthy();
    fireEvent.change(within(dlg).getByLabelText('Nhận xét quá trình'), { target: { value: 'ngắn' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Gửi đề nghị' }));
    expect(await within(dlg).findByText('Điểm phải từ 0 đến 10, tối đa 2 chữ số thập phân')).toBeTruthy();
    expect(within(dlg).getByText('Nhận xét tối thiểu 20 ký tự')).toBeTruthy();
    fireEvent.change(within(dlg).getByLabelText('Điểm quá trình (thang 10)'), { target: { value: '7.333' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Gửi đề nghị' }));
    await waitFor(() => expect(within(dlg).getByText('Điểm phải từ 0 đến 10, tối đa 2 chữ số thập phân')).toBeTruthy());
    expect(sent('POST', '/topics/t1/actions')).toHaveLength(0);
  });

  it('điểm < 5 hiện gợi ý tại chỗ nhưng vẫn gửi; server trả PROCESS_SCORE_TOO_LOW hiện trong hộp', async () => {
    map['POST /topics/t1/actions'] = apiErr(409, 'PROCESS_SCORE_TOO_LOW', 'Điểm quá trình dưới 5,0 – đề tài không đủ điều kiện ra hội đồng');
    const dlg = await openDialog();
    fireEvent.change(within(dlg).getByLabelText('Điểm quá trình (thang 10)'), { target: { value: '4.5' } });
    expect(await within(dlg).findByText(/Không đủ điều kiện ra hội đồng \(dưới 5,0\)/)).toBeTruthy();
    fireEvent.change(within(dlg).getByLabelText('Nhận xét quá trình'), { target: { value: COMMENT } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Gửi đề nghị' }));
    expect(await within(dlg).findByText(/Điểm quá trình dưới 5,0/)).toBeTruthy();
    expect(sent('POST', '/topics/t1/actions')[0][1].body).toEqual({ action: 'REQUEST_DEFENSE', version: 4, processScore: 4.5, processComment: COMMENT });
  });

  it('gửi thành công: toast, đề tài cập nhật theo phản hồi', async () => {
    const after = { topic: topic({ status: 'WAITING_DEFENSE', defense: { state: 'WAITING_ASSIGNMENT', assignmentId: null, council: null, finalScore: null, decision: null, decidedAt: null, scores: [] } }) };
    map['POST /topics/t1/actions'] = () => { map['GET /topics/t1'] = after; return after; };
    const dlg = await openDialog();
    fireEvent.change(within(dlg).getByLabelText('Điểm quá trình (thang 10)'), { target: { value: '7.25' } });
    fireEvent.change(within(dlg).getByLabelText('Nhận xét quá trình'), { target: { value: COMMENT } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Gửi đề nghị' }));
    await waitFor(() => expect(toasts()).toContain('Đã đề nghị ra hội đồng đề tài DT-001'));
    expect(await screen.findByText('Chờ khoa phân công hội đồng.')).toBeTruthy();
  });

  it('NO_FINAL_REPORT có liên kết sang tab Tài liệu; MILESTONES_NOT_PASSED liệt kê mốc', async () => {
    map['POST /topics/t1/actions'] = apiErr(409, 'NO_FINAL_REPORT', 'Nhóm chưa nộp báo cáo tổng kết');
    const dlg = await openDialog();
    fireEvent.change(within(dlg).getByLabelText('Điểm quá trình (thang 10)'), { target: { value: '8' } });
    fireEvent.change(within(dlg).getByLabelText('Nhận xét quá trình'), { target: { value: COMMENT } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Gửi đề nghị' }));
    expect(await within(dlg).findByText(/Nhóm chưa nộp báo cáo tổng kết/)).toBeTruthy();
    expect(within(dlg).getByRole('link', { name: 'Mở tab Tài liệu' }).getAttribute('href')).toBe('/de-tai/t1/tai-lieu');
    map['POST /topics/t1/actions'] = apiErr(409, 'MILESTONES_NOT_PASSED', 'Còn mốc bắt buộc chưa Đạt', { milestones: [{ name: 'Báo cáo giữa kỳ' }] });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Gửi đề nghị' }));
    expect(await within(dlg).findByText('Còn mốc bắt buộc chưa Đạt: Báo cáo giữa kỳ')).toBeTruthy();
  });

  it('không có REQUEST_DEFENSE trong availableActions → không có nút', async () => {
    open('/de-tai/t1');
    await screen.findByTestId('topic-code');
    expect(screen.queryByRole('button', { name: 'Đề nghị ra hội đồng' })).toBeNull();
  });

  it('REQUEST_CLOSE khi đợt bắt buộc bảo vệ: hộp xác nhận có gợi ý; DEFENSE_REQUIRED hiện trong hộp', async () => {
    map['GET /topics/t1'] = { topic: topic({ availableActions: ['REQUEST_CLOSE'], round: { ...topic().round, effectiveConfig: { requireDefense: true } } }) };
    map['POST /topics/t1/actions'] = apiErr(409, 'DEFENSE_REQUIRED', 'Đợt này bắt buộc bảo vệ trước hội đồng');
    open('/de-tai/t1');
    fireEvent.click(await screen.findByRole('button', { name: 'Đề nghị đóng đề tài' }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText(/Đợt này bắt buộc bảo vệ trước hội đồng \(trừ kết quả Không đạt/)).toBeTruthy();
    fireEvent.click(within(dlg).getAllByRole('button', { name: 'Đề nghị đóng đề tài' }).at(-1));
    expect(await within(dlg).findByRole('alert')).toHaveProperty('textContent', 'Đợt này bắt buộc bảo vệ trước hội đồng');
  });
});

describe('R6 – trả về đang thực hiện (cán bộ)', () => {
  it('lý do bắt buộc, nhắc hủy phân công; gửi đúng body', async () => {
    map['GET /topics/t1'] = { topic: topic({ status: 'WAITING_DEFENSE', availableActions: ['RETURN_FROM_DEFENSE'] }) };
    map['POST /topics/t1/actions'] = { topic: topic() };
    open('/de-tai/t1', 'STAFF');
    fireEvent.click(await screen.findByRole('button', { name: 'Trả về đang thực hiện' }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText(/Phân công hội đồng chưa chốt sẽ bị hủy/)).toBeTruthy();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Trả về đang thực hiện' }));
    await waitFor(() => expect(within(dlg).getByLabelText('Lý do trả về').getAttribute('aria-invalid')).toBe('true'));
    expect(sent('POST', '/topics/t1/actions')).toHaveLength(0);
    fireEvent.change(within(dlg).getByLabelText('Lý do trả về'), { target: { value: 'Hồ sơ thiếu phụ lục' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Trả về đang thực hiện' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/actions')[0][1].body).toEqual({ action: 'RETURN_FROM_DEFENSE', version: 4, reason: 'Hồ sơ thiếu phụ lục' }));
    await waitFor(() => expect(toasts()).toContain('Đã trả về đang thực hiện đề tài DT-001'));
  });
});

describe('R6 – khối bảo vệ và điểm quá trình', () => {
  const defense = (o) => ({ assignmentId: 'as1', council: { code: 'HD-2026-001', name: 'Hội đồng CNPM 1' }, state: 'ASSIGNED', finalScore: null, decision: null, decidedAt: null, scores: [], ...o });

  it('ASSIGNED: tên hội đồng, chưa có kết quả; điểm quá trình hiện kiểu Việt Nam', async () => {
    map['GET /topics/t1'] = { topic: topic({ status: 'WAITING_DEFENSE', defense: defense(), processScore: { score: '7.25', comment: COMMENT, createdAt: '2026-11-18T03:00:00Z', lecturer: { fullName: 'Cô Lan' } } }) };
    open('/de-tai/t1', 'STUDENT');
    expect(await screen.findByText('Hội đồng HD-2026-001 – Hội đồng CNPM 1')).toBeTruthy();
    expect(screen.getByText('Chưa có kết quả.')).toBeTruthy();
    expect(screen.getByText('Điểm quá trình')).toBeTruthy();
    expect(screen.getByText('7,25')).toBeTruthy();
    expect(screen.getByText(COMMENT)).toBeTruthy();
  });

  it('DECIDED: điểm cuối, Đạt, bảng điểm từng thành viên', async () => {
    const scores = [
      { member: { lecturerId: 'l1', fullName: 'Thầy Chủ', role: 'CHAIR' }, score: '8.00', comment: 'Tốt', updatedAt: '2026-11-19T03:00:00Z' },
      { member: { lecturerId: 'l3', fullName: 'Thầy Ủy', role: 'MEMBER' }, score: '6.75', comment: 'Khá', updatedAt: '2026-11-19T03:00:00Z' },
    ];
    map['GET /topics/t1'] = { topic: topic({ status: 'WAITING_CLOSE', defense: defense({ state: 'DECIDED', finalScore: '7.38', decision: 'PASSED', decidedAt: '2026-11-19T04:00:00Z', scores }) }) };
    open('/de-tai/t1', 'STUDENT');
    expect(await screen.findByText('7,38')).toBeTruthy();
    expect(screen.getByText('Đạt')).toBeTruthy();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Thầy Chủ')).toBeTruthy();
    expect(within(table).getByText('Ủy viên')).toBeTruthy();
    expect(within(table).getByText('6,75')).toBeTruthy();
  });

  it('WAITING_ASSIGNMENT: chờ phân công', async () => {
    map['GET /topics/t1'] = { topic: topic({ status: 'WAITING_DEFENSE', defense: defense({ state: 'WAITING_ASSIGNMENT', assignmentId: null, council: null }) }) };
    open('/de-tai/t1', 'STUDENT');
    expect(await screen.findByText('Chờ khoa phân công hội đồng.')).toBeTruthy();
  });

  it('defense = null (chưa ra hội đồng hoặc đã trả về) → không có khối bảo vệ, không có điểm quá trình khi null', async () => {
    open('/de-tai/t1', 'STUDENT');
    await screen.findByTestId('topic-code');
    expect(screen.queryByText('Bảo vệ trước hội đồng')).toBeNull();
    expect(screen.queryByText('Điểm quá trình')).toBeNull();
  });

  it('councilAccess: dải chỉ đọc + nút sang màn chấm', async () => {
    map['GET /topics/t1'] = { topic: topic({ status: 'WAITING_DEFENSE', councilAccess: { assignmentId: 'as1', role: 'SECRETARY' }, defense: defense() }) };
    open('/de-tai/t1');
    expect(await screen.findByText(/Bạn xem với tư cách thành viên hội đồng \(Thư ký\) – chỉ đọc/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Đến màn chấm' }).getAttribute('href')).toBe('/cham-bao-ve/as1');
  });
});

describe('R30 danh sách hội đồng', () => {
  it('bảng: mã, tên, đợt, chủ tịch, số thành viên, số đề tài, badge đã có điểm; nút lập hội đồng', async () => {
    map['GET /councils'] = page([{ ...council({ locked: true }), assignments: undefined, assignmentCount: 2 }]);
    open('/hoi-dong', 'STAFF');
    const link = await screen.findByRole('link', { name: 'Hội đồng CNPM 1' });
    expect(link.getAttribute('href')).toBe('/hoi-dong/c1');
    expect(screen.getByText('HD-2026-001')).toBeTruthy();
    expect(screen.getByText('Thầy Chủ')).toBeTruthy();
    expect(screen.getByText('Đã có điểm')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Lập hội đồng' }).getAttribute('href')).toBe('/hoi-dong/moi');
  });

  it('lọc đợt gửi roundId; rỗng có câu riêng; lỗi API hiện thông điệp', async () => {
    map['GET /councils'] = page([]);
    const router = open('/hoi-dong', 'STAFF');
    expect(await screen.findByText('Chưa có hội đồng nào trong đợt này.')).toBeTruthy();
    fireEvent.change(await screen.findByLabelText('Đợt'), { target: { value: 'r1' } });
    await waitFor(() => expect(router.state.location.search).toContain('roundId=r1'));
    await waitFor(() => expect(sent('GET', '/councils').at(-1)[0]).toContain('roundId=r1'));
    cleanup();
    map['GET /councils'] = apiErr(500, 'INTERNAL', 'Máy chủ gặp sự cố');
    open('/hoi-dong', 'STAFF');
    expect(await screen.findByText('Máy chủ gặp sự cố')).toBeTruthy();
  });

  it('menu và quyền vào: cán bộ có "Hội đồng"; giảng viên chỉ vào R32; sinh viên/quản trị không', () => {
    expect(MENU.STAFF.map((m) => m.to)).toContain('/hoi-dong');
    expect(MENU.LECTURER.map((m) => m.to)).not.toContain('/hoi-dong');
    expect(canVisit('STAFF', '/hoi-dong/moi')).toBe(true);
    expect(canVisit('LECTURER', '/hoi-dong')).toBe(false);
    expect(canVisit('LECTURER', '/hoi-dong/c1')).toBe(true);
    expect(canVisit('STUDENT', '/hoi-dong/c1')).toBe(false);
    expect(canVisit('ADMIN', '/hoi-dong')).toBe(false);
  });
});

describe('R31 lập hội đồng', () => {
  const fill = async () => {
    await screen.findByRole('option', { name: 'Đợt 1 (2026-2027)' });
    fireEvent.change(screen.getByLabelText('Đợt'), { target: { value: 'r1' } });
    fireEvent.change(screen.getByLabelText('Tên hội đồng'), { target: { value: 'Hội đồng CNPM 1' } });
    await screen.findAllByRole('option', { name: 'Thầy Chủ (L1)' });
    fireEvent.change(screen.getByLabelText('Chủ tịch'), { target: { value: 'l1' } });
    fireEvent.change(screen.getByLabelText('Thư ký'), { target: { value: 'l2' } });
    fireEvent.change(screen.getByLabelText('Ủy viên 1'), { target: { value: 'l3' } });
  };

  it('thiếu chủ tịch: lỗi tại ô, không gọi API; GV đã chọn bị làm mờ ở ô khác', async () => {
    open('/hoi-dong/moi', 'STAFF');
    await fill();
    expect(within(screen.getByLabelText('Thư ký')).getByRole('option', { name: 'Thầy Chủ (L1)' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Chủ tịch'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lập hội đồng' }));
    expect(await screen.findByText('Vui lòng chọn một mục')).toBeTruthy();
    expect(sent('POST', '/councils')).toHaveLength(0);
    // Tìm giảng viên gửi role=LECTURER và khoa của đợt
    expect(sent('GET', '/users').at(-1)[0]).toMatch(/role=LECTURER.*facultyId=f1|facultyId=f1.*role=LECTURER/);
  });

  it('thêm/bớt ủy viên (tối đa 5); gửi đúng body rồi sang R32', async () => {
    map['POST /councils'] = { council: council() };
    const router = open('/hoi-dong/moi', 'STAFF');
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm ủy viên' }));
    fireEvent.change(screen.getByLabelText('Ủy viên 2'), { target: { value: 'l4' } });
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Thêm ủy viên' }));
    expect(screen.queryByRole('button', { name: 'Thêm ủy viên' })).toBeNull();
    for (const n of [5, 4, 3]) fireEvent.click(screen.getByRole('button', { name: `Bớt ủy viên ${n}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Lập hội đồng' }));
    await waitFor(() => expect(sent('POST', '/councils')[0][1].body).toEqual({
      roundId: 'r1', name: 'Hội đồng CNPM 1',
      members: [{ lecturerId: 'l1', role: 'CHAIR' }, { lecturerId: 'l2', role: 'SECRETARY' }, { lecturerId: 'l3', role: 'MEMBER' }, { lecturerId: 'l4', role: 'MEMBER' }],
    }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/hoi-dong/c1'));
  });

  it('lỗi 400 tại members hiện đầu khối thành viên', async () => {
    map['POST /councils'] = apiErr(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { members: 'Giảng viên không hợp lệ' });
    open('/hoi-dong/moi', 'STAFF');
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Lập hội đồng' }));
    expect(await screen.findByText('Giảng viên không hợp lệ')).toBeTruthy();
  });
});

describe('R32 chi tiết hội đồng', () => {
  it('cán bộ: thành viên, đề tài gán (đã chấm x/y, điểm cuối, kết quả), hủy gán chỉ dòng chưa có điểm', async () => {
    map['GET /councils/c1'] = { council: council({ assignments: [assignment(), assignment({ id: 'as2', topic: { id: 't2', code: 'DT-002', title: 'Đề tài hai', status: 'WAITING_CLOSE' }, scoredCount: 3, finalScore: '7.42', decision: 'PASSED', decidedAt: '2026-11-19T04:00:00Z' })] }) };
    open('/hoi-dong/c1', 'STAFF');
    expect(await screen.findByText('Hội đồng CNPM 1')).toBeTruthy();
    expect(screen.getByText('Cô Thư')).toBeTruthy();
    expect(screen.getByText('Đã chấm 0/3')).toBeTruthy();
    expect(screen.getByText('7,42')).toBeTruthy();
    expect(screen.getByText('Đạt')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Hủy gán/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Gán đề tài' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sửa tên và thành viên' })).toBeTruthy();
  });

  it('giảng viên thành viên hội đồng: chỉ đọc, không có nút', async () => {
    map['GET /councils/c1'] = { council: council({ assignments: [assignment()] }) };
    open('/hoi-dong/c1', 'LECTURER');
    expect(await screen.findByText('Bạn là thành viên hội đồng – chỉ đọc.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Gán đề tài' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Hủy gán/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sửa tên và thành viên' })).toBeNull();
  });

  it('hội đồng đã có điểm: không có nút sửa thành viên, có thông báo', async () => {
    map['GET /councils/c1'] = { council: council({ locked: true }) };
    open('/hoi-dong/c1', 'STAFF');
    expect(await screen.findByText('Hội đồng đã có điểm, không đổi được thành viên')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sửa tên và thành viên' })).toBeNull();
  });

  it('gán đề tài: đề tài có GVHD là thành viên bị đánh dấu đỏ, không chọn được; gửi đúng topicIds', async () => {
    map['GET /topics'] = page([
      { id: 't5', code: 'DT-005', title: 'Đề tài năm', advisor: { id: 'gv9', fullName: 'Cô Chín' } },
      { id: 't6', code: 'DT-006', title: 'Đề tài sáu', advisor: { id: 'l3', fullName: 'Thầy Ủy' } },
    ]);
    map['POST /councils/c1/assignments'] = { council: council() };
    open('/hoi-dong/c1', 'STAFF');
    fireEvent.click(await screen.findByRole('button', { name: 'Gán đề tài' }));
    const dlg = await screen.findByRole('dialog');
    expect(await within(dlg).findByText('Xung đột: GVHD là thành viên hội đồng')).toBeTruthy();
    const [ok, bad] = within(dlg).getAllByRole('checkbox');
    expect(bad.disabled).toBe(true);
    expect(sent('GET', '/topics')[0][0]).toMatch(/status=WAITING_DEFENSE/);
    expect(sent('GET', '/topics')[0][0]).toMatch(/councilAssigned=false/);
    expect(sent('GET', '/topics')[0][0]).toMatch(/roundId=r1/);
    fireEvent.click(ok);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Gán 1 đề tài' }));
    await waitFor(() => expect(sent('POST', '/councils/c1/assignments')[0][1].body).toEqual({ topicIds: ['t5'] }));
    await waitFor(() => expect(toasts()).toContain('Đã gán 1 đề tài cho Hội đồng CNPM 1'));
  });

  it('gán đề tài: CONFLICT_OF_INTEREST / NOT_WAITING_DEFENSE liệt kê mã, hộp vẫn mở', async () => {
    map['GET /topics'] = page([{ id: 't5', code: 'DT-005', title: 'Đề tài năm', advisor: { id: 'gv9', fullName: 'Cô Chín' } }]);
    map['POST /councils/c1/assignments'] = apiErr(409, 'CONFLICT_OF_INTEREST', 'Giảng viên hướng dẫn không được ngồi hội đồng chấm đề tài của mình', { conflicts: [{ topicCode: 'DT-005', lecturerName: 'Cô Chín' }] });
    open('/hoi-dong/c1', 'STAFF');
    fireEvent.click(await screen.findByRole('button', { name: 'Gán đề tài' }));
    const dlg = await screen.findByRole('dialog');
    fireEvent.click(await within(dlg).findByRole('checkbox'));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Gán 1 đề tài' }));
    expect(await within(dlg).findByText('Cô Chín là GVHD của đề tài DT-005')).toBeTruthy();
    map['POST /councils/c1/assignments'] = apiErr(409, 'NOT_WAITING_DEFENSE', 'Chỉ phân công/chấm khi đề tài đang chờ bảo vệ', { topicCodes: ['DT-005'] });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Gán 1 đề tài' }));
    expect(await within(dlg).findByText('Đề tài: DT-005')).toBeTruthy();
  });

  it('hủy gán: lý do bắt buộc; ASSIGNMENT_HAS_SCORES gợi ý dùng "Trả về đang thực hiện"', async () => {
    map['GET /councils/c1'] = { council: council({ assignments: [assignment()] }) };
    map['POST /council-assignments/as1/cancel'] = apiErr(409, 'ASSIGNMENT_HAS_SCORES', 'Đề tài đã có điểm, không hủy phân công được');
    open('/hoi-dong/c1', 'STAFF');
    fireEvent.click(await screen.findByRole('button', { name: /^Hủy gán/ }));
    const dlg = await screen.findByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText('Lý do hủy gán'), { target: { value: 'Gán nhầm hội đồng' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Hủy gán' }));
    expect(await within(dlg).findByText(/Trả về đang thực hiện/)).toBeTruthy();
    expect(sent('POST', '/council-assignments/as1/cancel')[0][1].body).toEqual({ reason: 'Gán nhầm hội đồng' });
  });

  it('sửa: đổi tên (PATCH) rồi thay thành viên (PUT) với version mới; CONFLICT_OF_INTEREST liệt kê', async () => {
    map['PATCH /councils/c1'] = { council: council({ name: 'Hội đồng mới', version: 2 }) };
    map['PUT /councils/c1/members'] = apiErr(409, 'CONFLICT_OF_INTEREST', 'Giảng viên hướng dẫn không được ngồi hội đồng chấm đề tài của mình', { conflicts: [{ topicCode: 'DT-001', lecturerName: 'Cô Bốn' }] });
    open('/hoi-dong/c1', 'STAFF');
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa tên và thành viên' }));
    fireEvent.change(screen.getByLabelText('Tên hội đồng'), { target: { value: 'Hội đồng mới' } });
    await screen.findAllByRole('option', { name: 'Cô Bốn (L4)' });
    fireEvent.change(screen.getByLabelText('Ủy viên 1'), { target: { value: 'l4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(sent('PUT', '/councils/c1/members')[0][1].body).toEqual({
      version: 2, members: [{ lecturerId: 'l1', role: 'CHAIR' }, { lecturerId: 'l2', role: 'SECRETARY' }, { lecturerId: 'l4', role: 'MEMBER' }],
    }));
    expect(sent('PATCH', '/councils/c1')[0][1].body).toEqual({ name: 'Hội đồng mới', version: 1 });
    expect(await screen.findByText(/Cô Bốn là GVHD của đề tài DT-001/)).toBeTruthy();
  });

  it('sửa: COUNCIL_LOCKED → đóng form, toast', async () => {
    map['PUT /councils/c1/members'] = apiErr(409, 'COUNCIL_LOCKED', 'Hội đồng đã có điểm, không đổi được thành viên');
    open('/hoi-dong/c1', 'STAFF');
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa tên và thành viên' }));
    await screen.findAllByRole('option', { name: 'Cô Bốn (L4)' });
    fireEvent.change(screen.getByLabelText('Ủy viên 1'), { target: { value: 'l4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(toasts()).toContain('Hội đồng đã có điểm, không đổi được thành viên'));
    expect(screen.queryByRole('button', { name: 'Lưu' })).toBeNull();
    expect(sent('PATCH', '/councils/c1')).toHaveLength(0);
  });
});
