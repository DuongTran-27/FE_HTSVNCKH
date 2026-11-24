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

const U = (role, o = {}) => ({ id: 'u1', code: 'U1', fullName: 'Người dùng', role, mustChangePassword: false, facultyId: 'f1', staffFacultyIds: ['f1'], ...o });
const apiErr = (status, code, message, details, extra = {}) => Object.assign(new Error(message), { status, code, details, ...extra });
const ROUND = { id: 'r1', name: 'Đợt 1', academicYear: '2026-2027', effectiveConfig: { maxMembers: 5 } };
const PERM = { readExecution: true, requestTopicChange: false, requestAdvisorChange: false, requestCancel: false, leave: false, requestLeave: false, manageFormerAdvisorAccess: false };
const topic = (o = {}, perm = {}) => ({
  id: 't1', code: 'DT-001', title: 'Hệ thống gợi ý học tập', summary: 'Tóm tắt cũ', objectives: 'Mục tiêu cũ đủ dài rồi', keywords: ['a', 'b'],
  field: { id: 'fd1', name: 'AI' }, status: 'IN_PROGRESS', version: 4, round: ROUND, members: [], advisor: { id: 'gv1', fullName: 'TS. A' },
  availableActions: [], pendingChangeRequests: [], permissions: { ...PERM, ...perm }, ...o,
});
const cr = (o = {}) => ({
  id: 'cr1', type: 'CANCEL', status: 'PENDING', stage: 'STAFF', topic: { id: 't1', code: 'DT-001', title: 'Hệ thống gợi ý học tập' }, reason: 'Nhóm không còn thực hiện',
  payload: { topicStatus: 'IN_PROGRESS', requesterRole: 'STUDENT' }, createdBy: { id: 'sv1', fullName: 'An', role: 'STUDENT' }, createdAt: '2026-11-05T01:00:00Z',
  target: null, targetAcceptedAt: null, decidedBy: null, decisionReason: null, decidedAt: null, similarityCheck: null, availableActions: [], ...o,
});
const page = (items) => ({ items, page: 1, pageSize: 20, total: items.length });
const SIM_HIGH = { id: 's1', status: 'OK', level: 'HIGH', createdAt: '2026-11-05T01:00:00Z', matches: [], thresholds: { minJustificationWords: 3 }, algorithmVersion: 'v1', corpusSize: 3 };

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
const type = (el, value) => fireEvent.change(el, { target: { value } });
const dialog = () => screen.getByRole('dialog');

beforeEach(() => {
  map = {
    'GET /topics/t1': { topic: topic() },
    'GET /topics/t1/change-requests': page([]),
    'GET /catalog/fields': { items: [] },
    'GET /fields': { items: [{ id: 'fd1', name: 'AI' }, { id: 'fd2', name: 'Dữ liệu' }] },
  };
});
afterEach(() => { cleanup(); clearToasts(); });

describe('Yêu cầu của đề tài: nút tạo theo permissions', () => {
  it('chỉ hiện nút mà permissions cho phép; rỗng hiện "Chưa có yêu cầu nào"', async () => {
    map['GET /topics/t1'] = { topic: topic({}, { requestTopicChange: true, requestCancel: true }) };
    open('/de-tai/t1/yeu-cau', U('STUDENT'));
    expect(await screen.findByText('Chưa có yêu cầu nào')).toBeTruthy();
    // Nút theo permissions của đề tài (query riêng) có thể đến sau danh sách – chờ thay vì đọc ngay
    expect(await screen.findByRole('button', { name: 'Thay đổi hồ sơ' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Đề nghị hủy đề tài' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thay giảng viên' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xin rời nhóm' })).toBeNull();
  });

  it('GV cũ chỉ đọc: có dải thông báo, không có nút ghi', async () => {
    map['GET /topics/t1'] = { topic: topic({ readOnlyAccess: true }) };
    open('/de-tai/t1/yeu-cau', U('LECTURER'));
    expect(await screen.findByText(/chỉ có quyền đọc/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Thay|hủy|rời/i })).toBeNull();
  });

  it('lỗi tải danh sách hiện error.message', async () => {
    map['GET /topics/t1/change-requests'] = apiErr(500, 'INTERNAL', 'Máy chủ lỗi tạm thời');
    open('/de-tai/t1/yeu-cau', U('STUDENT'));
    expect(await screen.findByText('Máy chủ lỗi tạm thời')).toBeTruthy();
  });
});

describe('Tạo yêu cầu', () => {
  it('hủy đề tài: lý do bắt buộc (không gọi API), rồi POST {type, reason}', async () => {
    map['GET /topics/t1'] = { topic: topic({}, { requestCancel: true }) };
    map['POST /topics/t1/change-requests'] = { changeRequest: cr() };
    open('/de-tai/t1/yeu-cau', U('STUDENT'));
    fireEvent.click(await screen.findByRole('button', { name: 'Đề nghị hủy đề tài' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(within(dialog()).getByText('Lý do tối thiểu 5 ký tự')).toBeTruthy());
    expect(sent('POST', '/topics/t1/change-requests')).toHaveLength(0);
    type(within(dialog()).getByLabelText('Lý do'), 'Nhóm không còn thực hiện');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/change-requests')[0][1].body).toEqual({ type: 'CANCEL', reason: 'Nhóm không còn thực hiện' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Esc đóng form chưa gõ và trả focus về nút mở; đã gõ thì Esc không đóng', async () => {
    map['GET /topics/t1'] = { topic: topic({}, { requestCancel: true }) };
    open('/de-tai/t1/yeu-cau', U('STUDENT'));
    const opener = await screen.findByRole('button', { name: 'Đề nghị hủy đề tài' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
    fireEvent.click(opener);
    type(within(dialog()).getByLabelText('Lý do'), 'Nhóm không còn');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog()).toBeTruthy();
    expect(sent('POST', '/topics/t1/change-requests')).toHaveLength(0);
  });

  it('thay GV: danh sách không có GVHD hiện tại; gửi newLecturerId; 409 PENDING hiện ở form', async () => {
    map['GET /topics/t1'] = { topic: topic({}, { requestAdvisorChange: true }) };
    map['GET /lecturers'] = { items: [
      { id: 'gv1', code: 'GV1', fullName: 'TS. A', activeTopicCount: 1, maxTopics: 5 },
      { id: 'gv2', code: 'GV2', fullName: 'TS. B', activeTopicCount: 4, maxTopics: 5 },
    ] };
    map['POST /topics/t1/change-requests'] = apiErr(409, 'CHANGE_REQUEST_PENDING', 'Đề tài đã có yêu cầu cùng loại đang chờ xử lý');
    open('/de-tai/t1/yeu-cau', U('STAFF'));
    fireEvent.click(await screen.findByRole('button', { name: 'Thay giảng viên' }));
    const select = await within(dialog()).findByLabelText('Giảng viên mới');
    await waitFor(() => expect(within(select).getByText(/TS\. B \(đã nhận 4\/5\)/)).toBeTruthy());
    expect(within(select).queryByText(/TS\. A/)).toBeNull();
    type(within(dialog()).getByLabelText('Lý do'), 'GVHD đi công tác dài hạn');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(select.getAttribute('aria-invalid')).toBe('true'));
    expect(sent('POST', '/topics/t1/change-requests')).toHaveLength(0);
    type(select, 'gv2');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/change-requests')[0][1].body).toEqual({ type: 'ADVISOR_CHANGE', reason: 'GVHD đi công tác dài hạn', newLecturerId: 'gv2' }));
    expect(await within(dialog()).findByText('Đề tài đã có yêu cầu cùng loại đang chờ xử lý')).toBeTruthy();
  });

  it('thay đổi hồ sơ: không đổi gì thì báo lỗi, đổi tên chỉ gửi trường đã đổi', async () => {
    map['GET /topics/t1'] = { topic: topic({}, { requestTopicChange: true }) };
    map['POST /topics/t1/change-requests'] = { changeRequest: cr({ type: 'TOPIC_CHANGE' }) };
    open('/de-tai/t1/yeu-cau', U('STUDENT'));
    fireEvent.click(await screen.findByRole('button', { name: 'Thay đổi hồ sơ' }));
    type(within(dialog()).getByLabelText('Lý do'), 'Cần đổi tên đề tài');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Gửi yêu cầu' }));
    expect(await within(dialog()).findByText('Yêu cầu phải có ít nhất một thay đổi')).toBeTruthy();
    expect(sent('POST', '/topics/t1/change-requests')).toHaveLength(0);
    type(within(dialog()).getByLabelText('Tên đề tài'), 'Hệ thống gợi ý học tập thích ứng');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/change-requests')[0][1].body).toEqual({
      type: 'TOPIC_CHANGE', reason: 'Cần đổi tên đề tài', changes: { title: 'Hệ thống gợi ý học tập thích ứng' },
    }));
  });

  it('FR06: HIGH kèm panel đỏ + giải trình bắt buộc; lỗi kiểm tra không bị coi là "không trùng"', async () => {
    map['GET /topics/t1'] = { topic: topic({}, { requestTopicChange: true }) };
    let n = 0;
    map['POST /topics/t1/change-requests'] = () => {
      n += 1;
      if (n === 1) return apiErr(400, 'JUSTIFICATION_REQUIRED', 'Cần giải trình', { similarityCheck: SIM_HIGH });
      return apiErr(409, 'SIMILARITY_NOT_CHECKED', 'Chưa kiểm tra được', { similarityCheck: { id: 's2', status: 'ERROR', level: null, createdAt: '2026-11-05T01:00:00Z' } });
    };
    open('/de-tai/t1/yeu-cau', U('STUDENT'));
    fireEvent.click(await screen.findByRole('button', { name: 'Thay đổi hồ sơ' }));
    type(within(dialog()).getByLabelText('Tên đề tài'), 'Hệ thống gợi ý học tập thích ứng');
    type(within(dialog()).getByLabelText('Lý do'), 'Cần đổi tên đề tài');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Gửi yêu cầu' }));
    expect((await within(dialog()).findByTestId('similarity-panel')).getAttribute('data-level')).toBe('HIGH');
    expect(within(dialog()).getByLabelText('Giải trình (bắt buộc)')).toBeTruthy();
    type(within(dialog()).getByLabelText('Giải trình (bắt buộc)'), 'khác biệt về phương pháp');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/change-requests')[1][1].body.justification).toBe('khác biệt về phương pháp'));
    await waitFor(() => expect(within(dialog()).getByTestId('similarity-panel').getAttribute('data-level')).toBe('ERROR'));
    expect(within(dialog()).getByText(/Hệ thống không coi đây là "không trùng"/)).toBeTruthy();
  });

  it('429: khóa nút gửi và hiện thời gian chờ', async () => {
    map['GET /topics/t1'] = { topic: topic({}, { requestCancel: true }) };
    map['POST /topics/t1/change-requests'] = apiErr(429, 'RATE_LIMITED', 'Thao tác quá nhanh', undefined, { retryAfter: 120 });
    open('/de-tai/t1/yeu-cau', U('STUDENT'));
    fireEvent.click(await screen.findByRole('button', { name: 'Đề nghị hủy đề tài' }));
    type(within(dialog()).getByLabelText('Lý do'), 'Nhóm không còn thực hiện');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: 'Gửi yêu cầu' }).disabled).toBe(true));
    expect(within(dialog()).getByText(/thử lại sau 2 phút/)).toBeTruthy();
  });

  it('sai trạng thái đề tài (INVALID_TRANSITION): thông báo + đóng form', async () => {
    map['GET /topics/t1'] = { topic: topic({}, { requestAdvisorChange: true }) };
    map['GET /lecturers'] = { items: [{ id: 'gv2', code: 'GV2', fullName: 'TS. B', activeTopicCount: 0, maxTopics: 5 }] };
    map['POST /topics/t1/change-requests'] = apiErr(409, 'INVALID_TRANSITION', 'Không thể thay giảng viên ở trạng thái hiện tại');
    open('/de-tai/t1/yeu-cau', U('STAFF'));
    fireEvent.click(await screen.findByRole('button', { name: 'Thay giảng viên' }));
    const select = await within(dialog()).findByLabelText('Giảng viên mới');
    await waitFor(() => expect(within(select).getByText(/TS\. B/)).toBeTruthy());
    type(select, 'gv2');
    type(within(dialog()).getByLabelText('Lý do'), 'GVHD đi công tác dài hạn');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toastStore.get().some((t) => t.message.includes('Không thể thay giảng viên'))).toBe(true);
  });
});

describe('Hành động trên thẻ yêu cầu theo availableActions', () => {
  it('người đích: Đồng ý gọi /accept; Từ chối bắt buộc lý do; không có nút Duyệt', async () => {
    map['GET /change-requests'] = page([cr({ type: 'ADVISOR_CHANGE', stage: 'TARGET', availableActions: ['ACCEPT', 'DECLINE'],
      payload: { from: { lecturerId: 'gv1', fullName: 'TS. A' }, to: { lecturerId: 'u1', fullName: 'Người dùng' } } })]);
    map['POST /change-requests/cr1/accept'] = { changeRequest: cr() };
    map['POST /change-requests/cr1/decline'] = { changeRequest: cr() };
    open('/yeu-cau', U('LECTURER'));
    expect(within(await screen.findByTestId('change-request')).getByText(/Chờ người được đề xuất đồng ý/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Duyệt' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Từ chối' }));
    await waitFor(() => expect(within(dialog()).getByRole('textbox').getAttribute('aria-invalid')).toBe('true'));
    expect(sent('POST', '/change-requests/cr1/decline')).toHaveLength(0);
    type(within(dialog()).getByRole('textbox'), 'Đã đủ hạn mức hướng dẫn');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Từ chối' }));
    await waitFor(() => expect(sent('POST', '/change-requests/cr1/decline')[0][1].body).toEqual({ reason: 'Đã đủ hạn mức hướng dẫn' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đồng ý' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Đồng ý' }));
    await waitFor(() => expect(sent('POST', '/change-requests/cr1/accept')).toHaveLength(1));
  });

  it('cán bộ duyệt hủy đề tài: bắt buộc lý do; duyệt loại khác không cần lý do', async () => {
    map['GET /change-requests'] = page([cr({ availableActions: ['APPROVE', 'DECLINE'] }), cr({ id: 'cr2', type: 'LEAVE_GROUP', availableActions: ['APPROVE'],
      payload: { member: { userId: 'sv2', code: 'SV2', fullName: 'Bình' }, memberCountBefore: 3 } })]);
    map['POST /change-requests/cr1/approve'] = { changeRequest: cr(), topic: topic() };
    map['POST /change-requests/cr2/approve'] = { changeRequest: cr(), topic: topic() };
    open('/yeu-cau', U('STAFF'));
    const cards = await screen.findAllByTestId('change-request');
    fireEvent.click(within(cards[0]).getByRole('button', { name: 'Duyệt' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Duyệt hủy' }));
    await waitFor(() => expect(within(dialog()).getByRole('textbox').getAttribute('aria-invalid')).toBe('true'));
    expect(sent('POST', '/change-requests/cr1/approve')).toHaveLength(0);
    type(within(dialog()).getByRole('textbox'), 'Đồng ý hủy đề tài');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Duyệt hủy' }));
    await waitFor(() => expect(sent('POST', '/change-requests/cr1/approve')[0][1].body).toEqual({ reason: 'Đồng ý hủy đề tài' }));
    expect(within(cards[1]).getByText(/Bình/)).toBeTruthy();
    fireEvent.click(within(cards[1]).getByRole('button', { name: 'Duyệt' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Duyệt' }));
    await waitFor(() => expect(sent('POST', '/change-requests/cr2/approve')[0][1].body).toEqual({}));
  });

  it('người tạo rút; 409 CHANGE_REQUEST_CLOSED → thông điệp và tải lại danh sách', async () => {
    map['GET /change-requests'] = page([cr({ availableActions: ['WITHDRAW'] })]);
    map['POST /change-requests/cr1/withdraw'] = apiErr(409, 'CHANGE_REQUEST_CLOSED', 'Yêu cầu không còn ở trạng thái chờ xử lý');
    open('/yeu-cau', U('STUDENT'));
    fireEvent.click(await screen.findByRole('button', { name: 'Rút yêu cầu' }));
    const before = sent('GET', '/change-requests').length;
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Rút yêu cầu' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toastStore.get().some((t) => t.message.includes('không còn ở trạng thái chờ'))).toBe(true);
    await waitFor(() => expect(sent('GET', '/change-requests').length).toBeGreaterThan(before));
  });

  it('thẻ đã kết thúc không có nút; TOPIC_CHANGE hiện trước → sau và kết quả FR06', async () => {
    map['GET /change-requests'] = page([cr({ type: 'TOPIC_CHANGE', status: 'ACCEPTED', stage: null, decidedAt: '2026-11-06T01:00:00Z', decisionReason: 'Hợp lý',
      payload: { before: { title: 'Tên cũ' }, after: { title: 'Tên mới' }, addMember: { userId: 'sv3', code: 'SV3', fullName: 'Chi' } }, similarityCheck: SIM_HIGH })]);
    open('/yeu-cau', U('STAFF'));
    expect(await screen.findByText('Tên cũ')).toBeTruthy();
    expect(screen.getByText('Tên mới')).toBeTruthy();
    expect(screen.getByText('Chi')).toBeTruthy();
    expect(screen.getByTestId('similarity-panel').getAttribute('data-level')).toBe('HIGH');
    expect(within(screen.getByTestId('change-request')).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('Danh sách /yeu-cau', () => {
  it('mặc định lọc PENDING; rỗng hiện "Không có yêu cầu đang chờ"; lọc bước gửi stage lên API', async () => {
    map['GET /change-requests'] = page([]);
    open('/yeu-cau?stage=STAFF', U('STAFF'));
    expect(await screen.findByText('Không có yêu cầu đang chờ')).toBeTruthy();
    expect(sent('GET', '/change-requests')[0][0]).toBe('/change-requests?status=PENDING&stage=STAFF&page=1&pageSize=20');
  });

  it('ADMIN bị chặn ở route (không gọi API)', async () => {
    open('/yeu-cau', U('ADMIN'));
    await waitFor(() => expect(screen.getAllByText(/không có quyền/i).length).toBeGreaterThan(0));
    expect(sent('GET', '/change-requests')).toHaveLength(0);
  });
});

describe('Rời nhóm (FR21)', () => {
  const detail = (perm) => ({ topic: topic({ status: 'DRAFT', members: [{ userId: 'u1', code: 'U1', fullName: 'Người dùng', role: 'MEMBER' }] }, perm) });

  it('không có permissions.leave thì không có nút', async () => {
    map['GET /topics/t1'] = detail({});
    open('/de-tai/t1', U('STUDENT'));
    await screen.findByText('Quản lý nhóm');
    expect(screen.queryByRole('button', { name: 'Rời nhóm' })).toBeNull();
  });

  it('xác nhận → POST /leave kèm version, rồi về /de-tai', async () => {
    map['GET /topics/t1'] = detail({ leave: true });
    map['POST /topics/t1/leave'] = { left: true, topicId: 't1' };
    map['GET /topics'] = page([]);
    const { router } = open('/de-tai/t1', U('STUDENT'));
    fireEvent.click(await screen.findByRole('button', { name: 'Rời nhóm' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Rời nhóm' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/leave')[0][1].body).toEqual({ version: 4 }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/de-tai'));
  });

  it('409 LEAVE_NEEDS_APPROVAL mở form xin rời nhóm; LEADER_CANNOT_LEAVE hiện gợi ý', async () => {
    map['GET /topics/t1'] = detail({ leave: true, requestLeave: true });
    map['POST /topics/t1/leave'] = apiErr(409, 'LEAVE_NEEDS_APPROVAL', 'Đề tài đã được duyệt, rời nhóm cần cán bộ khoa duyệt');
    const { router } = open('/de-tai/t1', U('STUDENT'));
    fireEvent.click(await screen.findByRole('button', { name: 'Rời nhóm' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Rời nhóm' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/de-tai/t1/yeu-cau'));
    expect((await screen.findByRole('dialog', { name: 'Rời nhóm' }))).toBeTruthy();
    type(within(dialog()).getByLabelText('Lý do'), 'Bận việc khác nên xin rời');
    map['POST /topics/t1/change-requests'] = { changeRequest: cr({ type: 'LEAVE_GROUP' }) };
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/change-requests')[0][1].body).toEqual({ type: 'LEAVE_GROUP', reason: 'Bận việc khác nên xin rời' }));
  });

  it('LEADER_CANNOT_LEAVE: gợi ý chuyển trưởng nhóm', async () => {
    map['GET /topics/t1'] = detail({ leave: true });
    map['POST /topics/t1/leave'] = apiErr(409, 'LEADER_CANNOT_LEAVE', 'Trưởng nhóm cần chuyển quyền trưởng nhóm trước khi rời nhóm');
    open('/de-tai/t1', U('STUDENT'));
    fireEvent.click(await screen.findByRole('button', { name: 'Rời nhóm' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Rời nhóm' }));
    expect(await within(dialog()).findByText(/chuyển quyền trưởng nhóm/)).toBeTruthy();
  });
});

describe('Quyền đọc của GV cũ (FR19.4) và chi tiết đề tài', () => {
  it('cán bộ bật quyền đọc kèm lý do; ẩn khi không có GV cũ hoặc không có quyền', async () => {
    const former = { lecturerId: 'gv9', fullName: 'TS. Cũ', startAt: '2026-10-01T00:00:00Z', endAt: '2026-11-01T00:00:00Z', readOnlyGranted: false };
    map['GET /topics/t1'] = { topic: topic({ formerAdvisors: [former], pendingChangeRequests: [{ id: 'cr1', type: 'CANCEL', stage: 'STAFF' }] }, { manageFormerAdvisorAccess: true }) };
    map['PUT /topics/t1/former-advisors/gv9/read-access'] = { formerAdvisors: [] };
    open('/de-tai/t1', U('STAFF'));
    expect(await screen.findByText('Yêu cầu thay đổi (1 đang chờ)')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Cho phép đọc' }));
    type(within(dialog()).getByRole('textbox'), 'Cần tra cứu nhận xét cũ');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cho phép' }));
    await waitFor(() => expect(sent('PUT', '/topics/t1/former-advisors/gv9/read-access')[0][1].body).toEqual({ granted: true, reason: 'Cần tra cứu nhận xét cũ' }));
  });

  it('không có manageFormerAdvisorAccess thì không hiện khối GV cũ', async () => {
    map['GET /topics/t1'] = { topic: topic({ formerAdvisors: [{ lecturerId: 'gv9', fullName: 'TS. Cũ', startAt: '2026-10-01T00:00:00Z', endAt: '2026-11-01T00:00:00Z', readOnlyGranted: true }] }) };
    open('/de-tai/t1', U('LECTURER'));
    await screen.findByText('Quản lý nhóm');
    expect(screen.queryByText('Giảng viên hướng dẫn trước đây')).toBeNull();
  });
});

describe('Lịch sử tham gia (SV đã rời)', () => {
  it('rỗng, danh sách và chi tiết chỉ gồm mục server trả về', async () => {
    map['GET /me/past-topics'] = page([]);
    open('/lich-su-tham-gia', U('STUDENT'));
    expect(await screen.findByText('Bạn chưa rời nhóm nào')).toBeTruthy();
    cleanup();
    map['GET /me/past-topics'] = page([{ topicId: 't1', code: 'DT-001', title: null, windows: [{ joinedAt: '2026-10-01T00:00:00Z', leftAt: '2026-10-20T00:00:00Z' }], submissionCount: 1, documentCount: 0 }]);
    open('/lich-su-tham-gia', U('STUDENT'));
    expect(await screen.findByText(/Không có tên trong thời gian bạn tham gia/)).toBeTruthy();
    cleanup();
    map['GET /topics/t1/submissions'] = { items: [{ id: 's1', seq: 1, createdAt: '2026-10-05T00:00:00Z', similarityLevel: 'NONE' }] };
    map['GET /topics/t1/documents'] = { items: [] };
    open('/lich-su-tham-gia/t1', U('STUDENT'));
    expect(await screen.findByRole('link', { name: 'Lần gửi 1' })).toBeTruthy();
    expect(await screen.findByText('Không có tài liệu nào trong thời gian bạn tham gia.')).toBeTruthy();
  });

  it('lần gửi unchecked hiện "Gửi khi chưa kiểm tra", không bao giờ "Không trùng" (G47)', async () => {
    map['GET /topics/t1/submissions'] = { items: [{ id: 's1', seq: 1, createdAt: '2026-10-05T00:00:00Z', similarityLevel: null, similarityStatus: 'ERROR', unchecked: true }] };
    map['GET /topics/t1/documents'] = { items: [] };
    open('/lich-su-tham-gia/t1', U('STUDENT'));
    expect(await screen.findByText('Gửi khi chưa kiểm tra')).toBeTruthy();
    expect(screen.queryByText('Không trùng')).toBeNull();
  });

  it('GV không vào được route của SV', async () => {
    open('/lich-su-tham-gia', U('LECTURER'));
    await waitFor(() => expect(screen.getAllByText(/không có quyền/i).length).toBeGreaterThan(0));
  });
});
