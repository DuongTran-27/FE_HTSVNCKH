// TASK-DC-13: giảng viên công bố đề tài tuyển sinh viên (R5', R7', trang công bố, khối "Đang tuyển" ở R6, R29 ứng viên + chốt nhóm).
// Mô phỏng api (như advising.test.jsx), dựng toàn bộ route để kiểm cả quyền vào trang và nút theo availableActions.
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

const apiErr = (status, code, message, details) => Object.assign(new Error(message), { status, code, details });
const CFG = { minMembers: 1, maxMembers: 5, minSummaryWords: 3, minKeywords: 3, maxKeywords: 5 };
const THRESH = { minJustificationWords: 3, titleReview: 0.5, titleHigh: 0.7, contentReview: 0.35, contentHigh: 0.55 };
const check = (level, o = {}) => ({ id: 'sc1', status: 'OK', level, createdAt: new Date().toISOString(), isStale: false, thresholds: THRESH, matches: [], algorithmVersion: 'v1', corpusSize: 10, ...o });
const topic = (o = {}) => ({
  id: 't1', code: 'DT-001', title: 'Hệ thống gợi ý học tập', summary: 'một hai ba bốn', objectives: 'Mục tiêu đủ hai mươi ký tự', keywords: ['a', 'b', 'c'],
  field: { id: 'fd1', name: 'AI' }, status: 'DRAFT', version: 2, origin: 'LECTURER', requirements: 'Biết React', recruitSlots: 3, acceptedCount: 0, applicationCounts: { pending: 0 },
  round: { id: 'r1', name: 'Đợt 1', academicYear: '2026-2027', effectiveConfig: CFG, registrationOpen: true },
  members: [], pendingInvitations: [], advisor: { id: 'gv1', fullName: 'Cô Lan' }, availableActions: ['PUBLISH_RECRUITMENT'],
  permissions: { edit: true, invite: false, transferLeader: false, checkSimilarity: true }, ...o,
});
const application = (o = {}) => ({
  id: 'ap1', status: 'PENDING', coverLetter: 'Em muốn tham gia vì thích đề tài', reason: null, createdAt: '2026-11-18T03:00:00Z', respondedAt: null,
  topic: { id: 't1' }, student: { id: 's1', code: 'SV01', fullName: 'Nguyễn An', classCode: 'K27A' }, availableActions: ['ACCEPT', 'DECLINE'], ...o,
});
const page = (items) => ({ items, page: 1, pageSize: 20, total: items.length });

let map;
let client;
const open = (url) => {
  auth.clear();
  auth.setSession({ accessToken: 't', user: { id: 'gv1', code: 'GV1', fullName: 'Cô Lan', role: 'LECTURER', mustChangePassword: false, facultyId: 'f1' } });
  calls.api = vi.fn(async (path, opts = {}) => {
    const h = map[`${opts.method ?? 'GET'} ${path.split('?')[0]}`];
    if (!h) throw apiErr(404, 'NOT_FOUND', 'không mock');
    const r = typeof h === 'function' ? h(path, opts) : h;
    if (r instanceof Error) throw r;
    return r;
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
};
const sent = (method, path) => calls.api.mock.calls.filter(([p, o]) => p.split('?')[0] === path && (o?.method ?? 'GET') === method);

beforeEach(() => {
  map = {
    'GET /topics/t1': { topic: topic() },
    'GET /catalog/fields': { items: [{ id: 'fd1', name: 'AI' }] },
    'GET /fields': { items: [{ id: 'fd1', name: 'AI' }] },
    'GET /rounds': { items: [{ id: 'r1', name: 'Đợt 1', academicYear: '2026-2027', registrationOpen: true }] },
    'GET /topics/t1/similarity-checks/latest': { similarityCheck: check('NONE') },
    'GET /topics/t1/applications': page([application()]),
  };
});
afterEach(() => { cleanup(); clearToasts(); });

describe('R5′ tạo đề tài tuyển', () => {
  it('giảng viên thấy tiêu đề riêng, tạo nháp rồi sang soạn hồ sơ', async () => {
    map['POST /topics'] = { topic: topic({ id: 't1', code: 'DT-001' }) };
    const router = open('/de-tai/moi');
    expect(await screen.findByRole('heading', { name: 'Công bố đề tài tuyển sinh viên' })).toBeTruthy();
    fireEvent.change(await screen.findByLabelText('Đợt đăng ký'), { target: { value: 'r1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo nháp' }));
    await waitFor(() => expect(sent('POST', '/topics')[0][1].body).toEqual({ roundId: 'r1', title: '' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/de-tai/t1/sua'));
  });

  it('REGISTRATION_CLOSED hiện ở ô đợt', async () => {
    map['POST /topics'] = apiErr(409, 'REGISTRATION_CLOSED', 'Đợt đã hết hạn đăng ký');
    open('/de-tai/moi');
    fireEvent.change(await screen.findByLabelText('Đợt đăng ký'), { target: { value: 'r1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo nháp' }));
    expect(await screen.findByText('Đợt đã hết hạn đăng ký')).toBeTruthy();
  });
});

describe('R7′ sửa đề tài tuyển', () => {
  it('có ô yêu cầu ứng viên + số sinh viên; số 0 bị chặn ở form, không gọi API', async () => {
    open('/de-tai/t1/sua');
    const slots = await screen.findByLabelText(/Số sinh viên cần tuyển/);
    expect(screen.getByLabelText('Yêu cầu ứng viên').value).toBe('Biết React');
    expect(screen.getByText('Đủ điều kiện công bố')).toBeTruthy();
    fireEvent.change(slots, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    expect(await screen.findByText('Cần tuyển ít nhất 1 sinh viên')).toBeTruthy();
    expect(sent('PUT', '/topics/t1')).toHaveLength(0);
  });

  it('vượt số thành viên tối đa của đợt bị chặn; hợp lệ thì PUT kèm requirements, recruitSlots, version', async () => {
    map['PUT /topics/t1'] = { topic: topic({ recruitSlots: 4, version: 3 }) };
    open('/de-tai/t1/sua');
    const slots = await screen.findByLabelText(/Số sinh viên cần tuyển/);
    fireEvent.change(slots, { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    expect(await screen.findByText(/Tối đa 5 sinh viên/)).toBeTruthy();
    expect(sent('PUT', '/topics/t1')).toHaveLength(0);
    fireEvent.change(slots, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(sent('PUT', '/topics/t1')).toHaveLength(1));
    expect(sent('PUT', '/topics/t1')[0][1].body).toMatchObject({ requirements: 'Biết React', recruitSlots: 4, version: 2 });
  });

  it('lỗi 400 theo trường từ server gắn vào ô số sinh viên', async () => {
    map['PUT /topics/t1'] = apiErr(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { recruitSlots: 'Vượt số thành viên tối đa của đợt' });
    open('/de-tai/t1/sua');
    await screen.findByLabelText(/Số sinh viên cần tuyển/);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    expect(await screen.findByText('Vượt số thành viên tối đa của đợt')).toBeTruthy();
  });

  it('đề tài của sinh viên không có 2 ô này và không gửi chúng', async () => {
    map['GET /topics/t1'] = { topic: topic({ origin: 'STUDENT', requirements: null, recruitSlots: null }) };
    map['PUT /topics/t1'] = { topic: topic({ origin: 'STUDENT' }) };
    open('/de-tai/t1/sua');
    await screen.findByLabelText('Tên đề tài');
    expect(screen.queryByLabelText('Yêu cầu ứng viên')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(sent('PUT', '/topics/t1')).toHaveLength(1));
    expect(sent('PUT', '/topics/t1')[0][1].body).not.toHaveProperty('recruitSlots');
  });
});

describe('Trang công bố (dùng lại R10)', () => {
  const publishBtn = () => screen.getByRole('button', { name: 'Công bố tuyển sinh viên' });

  it('nút Công bố tuyển sinh viên ở R6 dẫn sang trang công bố', async () => {
    const router = open('/de-tai/t1');
    fireEvent.click(await screen.findByRole('link', { name: 'Công bố tuyển sinh viên' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/de-tai/t1/cong-bo'));
  });

  it('đỏ: bắt buộc giải trình đủ số từ rồi gửi PUBLISH_RECRUITMENT kèm version + justification', async () => {
    map['GET /topics/t1/similarity-checks/latest'] = { similarityCheck: check('HIGH') };
    map['POST /topics/t1/actions'] = { topic: topic({ status: 'RECRUITING', availableActions: ['UNPUBLISH_RECRUITMENT'] }) };
    const router = open('/de-tai/t1/cong-bo');
    expect(await screen.findByText('Nghi trùng cao')).toBeTruthy();
    expect(publishBtn().disabled).toBe(true);
    const box = screen.getByLabelText(/Giải trình \(bắt buộc\)/);
    fireEvent.change(box, { target: { value: 'chỉ hai' } });
    expect(publishBtn().disabled).toBe(true);
    fireEvent.change(box, { target: { value: 'giải trình đủ ba' } });
    fireEvent.click(publishBtn());
    await waitFor(() => expect(sent('POST', '/topics/t1/actions')[0][1].body).toEqual({ action: 'PUBLISH_RECRUITMENT', version: 2, justification: 'giải trình đủ ba' }));
    await waitFor(() => expect(toastStore.get().map((t) => t.message)).toContain('Đã công bố đề tài, sinh viên có thể ứng tuyển'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/de-tai/t1'));
  });

  it('vàng: giải trình tùy chọn, công bố được ngay', async () => {
    map['GET /topics/t1/similarity-checks/latest'] = { similarityCheck: check('REVIEW') };
    open('/de-tai/t1/cong-bo');
    expect(await screen.findByLabelText(/Giải trình \(tùy chọn\)/)).toBeTruthy();
    expect(publishBtn().disabled).toBe(false);
  });

  it('thiếu số sinh viên cần tuyển: chặn ở bước 1, không cho công bố', async () => {
    map['GET /topics/t1'] = { topic: topic({ recruitSlots: null }) };
    open('/de-tai/t1/cong-bo');
    expect(await screen.findByText(/Số sinh viên cần tuyển: /)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Công bố tuyển sinh viên' })).toBeNull();
  });

  it('LECTURER_QUOTA_EXCEEDED hiện message của server', async () => {
    map['POST /topics/t1/actions'] = apiErr(409, 'LECTURER_QUOTA_EXCEEDED', 'Bạn đã đủ hạn mức đề tài trong đợt này');
    open('/de-tai/t1/cong-bo');
    await screen.findByText('Không cảnh báo');
    fireEvent.click(publishBtn());
    expect((await screen.findByRole('alert')).textContent).toContain('đủ hạn mức');
  });

  it('không có PUBLISH_RECRUITMENT trong availableActions: quay về chi tiết', async () => {
    map['GET /topics/t1'] = { topic: topic({ availableActions: [] }) };
    const router = open('/de-tai/t1/cong-bo');
    await waitFor(() => expect(router.state.location.pathname).toBe('/de-tai/t1'));
  });
});

describe('R6 đang tuyển + ngừng tuyển', () => {
  const recruiting = (o = {}) => topic({ status: 'RECRUITING', acceptedCount: 2, recruitSlots: 3, applicationCounts: { pending: 4 }, availableActions: ['UNPUBLISH_RECRUITMENT', 'FINALIZE_GROUP'], ...o });

  it('hiện số chỗ, đơn chờ và liên kết Xem ứng viên', async () => {
    map['GET /topics/t1'] = { topic: recruiting() };
    open('/de-tai/t1');
    expect(await screen.findByText(/Đang tuyển sinh viên – 2\/3 chỗ, 4 đơn chờ/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem ứng viên' }).getAttribute('href')).toBe('/de-tai/t1/ung-vien');
  });

  it('không có applicationCounts thì không hiện liên kết ứng viên', async () => {
    map['GET /topics/t1'] = { topic: recruiting({ applicationCounts: null }) };
    open('/de-tai/t1');
    await screen.findByText(/Đang tuyển sinh viên – 2\/3 chỗ/);
    expect(screen.queryByRole('link', { name: 'Xem ứng viên' })).toBeNull();
  });

  it('ngừng tuyển: bắt buộc lý do (không gọi API khi rỗng), cảnh báo đỏ khi đã có sinh viên, gửi reason + version', async () => {
    map['GET /topics/t1'] = { topic: recruiting() };
    map['POST /topics/t1/actions'] = { topic: topic({ availableActions: ['PUBLISH_RECRUITMENT'] }) };
    open('/de-tai/t1');
    fireEvent.click(await screen.findByRole('button', { name: 'Ngừng tuyển' }));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByText('2 sinh viên đã nhận sẽ bị gỡ khỏi đề tài.')).toBeTruthy();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Ngừng tuyển' }));
    await waitFor(() => expect(within(dlg).getByRole('textbox').getAttribute('aria-invalid')).toBe('true'));
    expect(sent('POST', '/topics/t1/actions')).toHaveLength(0);
    fireEvent.change(within(dlg).getByRole('textbox'), { target: { value: 'Đủ người rồi' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Ngừng tuyển' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/actions')[0][1].body).toEqual({ action: 'UNPUBLISH_RECRUITMENT', version: 2, reason: 'Đủ người rồi' }));
  });

  it('ngừng tuyển: lỗi 409 từ server hiện trong hộp thoại', async () => {
    map['GET /topics/t1'] = { topic: recruiting({ acceptedCount: 0 }) };
    map['POST /topics/t1/actions'] = apiErr(409, 'CONCURRENT_UPDATE', 'Đề tài vừa được cập nhật, vui lòng tải lại');
    open('/de-tai/t1');
    fireEvent.click(await screen.findByRole('button', { name: 'Ngừng tuyển' }));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).queryByText(/sẽ bị gỡ khỏi đề tài/)).toBeNull();
    fireEvent.change(within(dlg).getByRole('textbox'), { target: { value: 'Đủ người rồi' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Ngừng tuyển' }));
    expect((await within(dlg).findByRole('alert')).textContent).toContain('vừa được cập nhật');
  });
});

describe('R29 ứng viên', () => {
  const recruiting = (o = {}) => topic({ status: 'RECRUITING', acceptedCount: 1, recruitSlots: 3, availableActions: ['UNPUBLISH_RECRUITMENT', 'FINALIZE_GROUP'], ...o });
  beforeEach(() => { map['GET /topics/t1'] = { topic: recruiting() }; });

  it('hiện thanh x/y đã nhận, đơn chờ mặc định; rỗng thì báo chưa có ứng viên', async () => {
    open('/de-tai/t1/ung-vien');
    expect(await screen.findByText('Nguyễn An')).toBeTruthy();
    expect(screen.getByText('1/3 đã nhận')).toBeTruthy();
    expect(sent('GET', '/topics/t1/applications')[0][0]).toContain('status=PENDING');
    map['GET /topics/t1/applications'] = page([]);
    fireEvent.click(screen.getByRole('tab', { name: 'Đã nhận' }));
    expect(await screen.findByText('Chưa có sinh viên ứng tuyển.')).toBeTruthy();
  });

  it('đồng ý: xác nhận rồi POST accept, tải lại đề tài và danh sách', async () => {
    map['POST /applications/ap1/accept'] = { application: application({ status: 'ACCEPTED' }), topic: recruiting() };
    open('/de-tai/t1/ung-vien');
    fireEvent.click(await screen.findByRole('button', { name: 'Đồng ý' }));
    const before = sent('GET', '/topics/t1').length;
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đồng ý' }));
    await waitFor(() => expect(sent('POST', '/applications/ap1/accept')).toHaveLength(1));
    await waitFor(() => expect(sent('GET', '/topics/t1').length).toBeGreaterThan(before));
    await waitFor(() => expect(toastStore.get().map((t) => t.message)).toContain('Đã nhận sinh viên vào đề tài'));
  });

  it('GROUP_FULL: hiện "Nhóm đã đạt số lượng tối đa" trong hộp thoại và tải lại', async () => {
    map['POST /applications/ap1/accept'] = apiErr(409, 'GROUP_FULL', 'Nhóm đã đạt số lượng tối đa (3)');
    open('/de-tai/t1/ung-vien');
    fireEvent.click(await screen.findByRole('button', { name: 'Đồng ý' }));
    const before = sent('GET', '/topics/t1').length;
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đồng ý' }));
    expect((await within(screen.getByRole('dialog')).findByRole('alert')).textContent).toContain('Nhóm đã đạt số lượng tối đa');
    await waitFor(() => expect(sent('GET', '/topics/t1').length).toBeGreaterThan(before));
  });

  it('APPLICATION_CLOSED: đóng hộp thoại, báo toast, tải lại', async () => {
    map['POST /applications/ap1/accept'] = apiErr(409, 'APPLICATION_CLOSED', 'Đơn ứng tuyển đã được xử lý');
    open('/de-tai/t1/ung-vien');
    fireEvent.click(await screen.findByRole('button', { name: 'Đồng ý' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đồng ý' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toastStore.get().map((t) => t.message)).toContain('Đơn ứng tuyển đã được xử lý');
  });

  it('từ chối: bắt buộc lý do, gửi reason', async () => {
    map['POST /applications/ap1/decline'] = { application: application({ status: 'DECLINED' }) };
    open('/de-tai/t1/ung-vien');
    fireEvent.click(await screen.findByRole('button', { name: 'Từ chối' }));
    const dlg = screen.getByRole('dialog');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Từ chối' }));
    await waitFor(() => expect(within(dlg).getByRole('textbox').getAttribute('aria-invalid')).toBe('true'));
    expect(sent('POST', '/applications/ap1/decline')).toHaveLength(0);
    fireEvent.change(within(dlg).getByRole('textbox'), { target: { value: 'Chưa phù hợp' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Từ chối' }));
    await waitFor(() => expect(sent('POST', '/applications/ap1/decline')[0][1].body).toEqual({ reason: 'Chưa phù hợp' }));
  });

  it('chỉ hiện nút theo availableActions của đơn (đơn đã nhận không có nút)', async () => {
    map['GET /topics/t1/applications'] = page([application({ status: 'ACCEPTED', availableActions: [] })]);
    open('/de-tai/t1/ung-vien');
    await screen.findByText('Nguyễn An');
    expect(screen.queryByRole('button', { name: 'Đồng ý' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Từ chối' })).toBeNull();
  });

  it('đủ chỗ: nút Đồng ý vẫn hiện kèm gợi ý "Nhóm đã đủ số lượng"', async () => {
    map['GET /topics/t1'] = { topic: recruiting({ acceptedCount: 3 }) };
    open('/de-tai/t1/ung-vien');
    expect(await screen.findByRole('button', { name: 'Đồng ý' })).toBeTruthy();
    expect(screen.getAllByText(/Nhóm đã đủ số lượng/).length).toBeGreaterThan(0);
  });

  it('chốt nhóm: xác nhận rồi gửi FINALIZE_GROUP + version; GROUP_TOO_SMALL hiện trong hộp thoại', async () => {
    map['POST /topics/t1/actions'] = apiErr(409, 'GROUP_TOO_SMALL', 'Nhóm chưa đủ số thành viên tối thiểu (1)');
    open('/de-tai/t1/ung-vien');
    fireEvent.click(await screen.findByRole('button', { name: 'Chốt nhóm' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Chốt nhóm' }));
    expect((await within(screen.getByRole('dialog')).findByRole('alert')).textContent).toContain('chưa đủ số thành viên');
    expect(sent('POST', '/topics/t1/actions')[0][1].body).toEqual({ action: 'FINALIZE_GROUP', version: 2 });
    map['POST /topics/t1/actions'] = { topic: topic({ status: 'HAS_ADVISOR', availableActions: [] }) };
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Chốt nhóm' }));
    await waitFor(() => expect(toastStore.get().map((t) => t.message)).toContain('Đã chốt nhóm'));
  });

  it('403 từ server hiện thông báo lỗi, không hiện danh sách', async () => {
    map['GET /topics/t1/applications'] = apiErr(403, 'FORBIDDEN', 'Bạn không có quyền xem danh sách ứng viên');
    open('/de-tai/t1/ung-vien');
    expect(await screen.findByText(/không có quyền xem danh sách ứng viên/)).toBeTruthy();
  });
});
