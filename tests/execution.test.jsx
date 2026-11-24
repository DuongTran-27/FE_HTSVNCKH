// T406 – UI GĐ4: mốc, tiến độ, tài liệu, nhận xét, kết quả cuối, đóng đề tài (FR09–FR12, FR24, FR27)
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
import { fileError } from '../src/lib/execution.js';
import { fmtDateTime } from '../src/lib/format.js';
import { closeErrorMessage } from '../src/components/CloseActions.jsx';

const U = { STUDENT: { id: 'sv1', code: 'SV1', fullName: 'An', role: 'STUDENT' }, LECTURER: { id: 'gv1', code: 'GV1', fullName: 'Cô Lan', role: 'LECTURER' }, STAFF: { id: 'cb1', code: 'CB1', fullName: 'Cán bộ', role: 'STAFF', staffFacultyIds: ['f1'] } };
const apiErr = (status, code, message, details) => Object.assign(new Error(message), { status, code, details });
const CFG = { allowedFileTypes: ['pdf', 'docx', 'pptx', 'xlsx'], maxFileSizeMB: 10, maxMembers: 5 };
const perms = (o = {}) => ({
  edit: false, invite: false, transferLeader: false, checkSimilarity: false, viewHistory: true, manageMilestones: false, addProgress: false,
  uploadProposal: false, uploadMilestone: false, giveFeedback: false, enterResult: false, readExecution: true, ...o,
});
const topic = (o = {}) => ({
  id: 't1', code: 'DT-001', title: 'Đề tài A', status: 'IN_PROGRESS', version: 5, keywords: [], members: [{ userId: 'sv1', fullName: 'An', code: 'SV1', role: 'LEADER' }],
  round: { id: 'r1', name: 'Đợt 1', academicYear: '2026-2027', ended: false, endAt: '2027-06-30T16:59:59.000Z', effectiveConfig: CFG },
  advisor: { id: 'gv1', fullName: 'Cô Lan' }, availableActions: [], currentResult: null, closeReadiness: null, latestSimilarity: null, latestSubmission: null,
  ...o, permissions: perms(o.permissions),
});
const ms = (o = {}) => ({
  id: 'm1', topicId: 't1', order: 1, name: 'Báo cáo giữa kỳ', output: 'Báo cáo PDF', dueAt: '2027-03-01T16:59:59.000Z', required: true,
  evaluation: 'PENDING', version: 2, isOverdue: false, latestDocument: null, dueChangeCount: 0, createdAt: '2027-01-01T00:00:00.000Z', ...o,
});
const doc = (o = {}) => ({
  id: 'd7', topicId: 't1', milestoneId: 'm1', stage: 'MIDTERM', kind: 'FILE', version: 3, fileName: 'bao-cao.pdf', mimeType: 'application/pdf', sizeBytes: 812345,
  externalUrl: null, isLate: true, isLatest: true, uploadedBy: { id: 'sv1', fullName: 'An' }, uploadedAt: '2027-03-02T01:00:00.000Z', feedbackCount: 0, ...o,
});
const prog = (o = {}) => ({
  id: 'p1', topicId: 't1', author: { id: 'sv1', code: 'SV1', fullName: 'An' }, done: 'Làm khảo sát', issues: '', nextPlan: 'Viết báo cáo', percent: 40,
  selfReported: true, lockedAt: null, createdAt: '2027-02-01T03:00:00.000Z', updatedAt: '2027-02-01T03:00:00.000Z', feedbacks: [], ...o,
});

let map;
const open = (url, role, t = topic()) => {
  auth.clear();
  auth.setSession({ accessToken: 't', user: { mustChangePassword: false, facultyId: 'f1', ...U[role] } });
  map['GET /topics/t1'] = { topic: t };
  calls.api = vi.fn(async (path, opts = {}) => {
    const h = map[`${opts.method ?? 'GET'} ${path.split('?')[0]}`];
    if (!h) throw apiErr(404, 'NOT_FOUND', `không mock ${path}`);
    const r = typeof h === 'function' ? h(path, opts) : h;
    if (r instanceof Error) throw r;
    return r;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><RouterProvider router={createMemoryRouter(routes, { initialEntries: [url] })} /></QueryClientProvider>);
};
const sent = (method, path) => calls.api.mock.calls.filter(([p, o]) => p.split('?')[0] === path && (o?.method ?? 'GET') === method);
const type = (label, value, root = screen) => fireEvent.change(root.getByLabelText(label), { target: { value } });

beforeEach(() => {
  map = {
    'GET /topics/t1/milestones': { items: [ms()] },
    'GET /topics/t1/progress': { items: [prog()], page: 1, pageSize: 20, total: 1 },
    'GET /topics/t1/documents': { items: [doc()] },
    'GET /topics/t1/feedbacks': { items: [], page: 1, pageSize: 100, total: 0 },
    'GET /topics/t1/results': { current: null, items: [] },
  };
});
afterEach(() => { cleanup(); clearToasts(); vi.restoreAllMocks(); });

describe('Tab Mốc – FR09', () => {
  it('GVHD tạo mốc: lỗi theo trường khi rỗng (không gọi API), hạn giờ VN gửi ISO +07:00', async () => {
    map['POST /topics/t1/milestones'] = { milestone: ms({ id: 'm2' }) };
    open('/de-tai/t1/moc', 'LECTURER', topic({ permissions: { manageMilestones: true } }));
    expect(await screen.findByText('1. Báo cáo giữa kỳ')).toBeTruthy();
    expect(fmtDateTime('2027-03-01T16:59:59.000Z')).toContain('23:59'); // hiển thị theo Asia/Ho_Chi_Minh
    expect(screen.getByText(`Hạn: ${fmtDateTime('2027-03-01T16:59:59.000Z')}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm mốc' }));
    const form = screen.getByRole('form', { name: 'Thêm mốc' });
    fireEvent.click(within(form).getByRole('button', { name: 'Lưu' }));
    expect(await within(form).findByText('Nhập tên mốc')).toBeTruthy();
    expect(sent('POST', '/topics/t1/milestones')).toHaveLength(0);
    type('Tên mốc', 'Báo cáo cuối kỳ', within(form));
    type('Đầu ra yêu cầu', 'Báo cáo + slide', within(form));
    type('Hạn (giờ Việt Nam)', '2027-05-01T17:00', within(form));
    fireEvent.click(within(form).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/milestones')[0][1].body).toEqual({
      name: 'Báo cáo cuối kỳ', output: 'Báo cáo + slide', dueAt: '2027-05-01T17:00:00+07:00', required: true,
    }));
  });

  it('đổi hạn gửi version + lý do; 409 CONCURRENT_UPDATE hiện thông điệp và tải lại danh sách mốc', async () => {
    map['POST /milestones/m1/due-changes'] = apiErr(409, 'CONCURRENT_UPDATE', 'Mốc vừa được người khác cập nhật');
    open('/de-tai/t1/moc', 'STAFF', topic({ permissions: { manageMilestones: true } }));
    fireEvent.click(await screen.findByRole('button', { name: 'Đổi hạn' }));
    const form = screen.getByRole('form', { name: 'Đổi hạn mốc' });
    expect(within(form).getByLabelText('Hạn mới (giờ Việt Nam)').value).toBe('2027-03-01T23:59');
    type('Hạn mới (giờ Việt Nam)', '2027-03-15T23:59', within(form));
    type('Lý do đổi hạn', 'Gia hạn do nghỉ lễ', within(form));
    const before = sent('GET', '/topics/t1/milestones').length;
    fireEvent.click(within(form).getByRole('button', { name: 'Đổi hạn' }));
    expect(await within(form).findByText(/Mốc vừa được người khác cập nhật.*Dữ liệu đã được tải lại/)).toBeTruthy();
    expect(sent('POST', '/milestones/m1/due-changes')[0][1].body).toEqual({ newDueAt: '2027-03-15T23:59:00+07:00', reason: 'Gia hạn do nghỉ lễ', version: 2 });
    await waitFor(() => expect(sent('GET', '/topics/t1/milestones').length).toBeGreaterThan(before));
    expect(within(form).getByLabelText('Lý do đổi hạn').value).toBe('Gia hạn do nghỉ lễ'); // giữ dữ liệu đã nhập
  });

  it('SV chỉ xem: không có nút quản lý; thấy quá hạn, nộp muộn, lịch sử đổi hạn', async () => {
    map['GET /topics/t1/milestones'] = { items: [ms({ isOverdue: true, dueChangeCount: 1, latestDocument: { id: 'd7', version: 3, uploadedAt: '2027-03-02T01:00:00.000Z', isLate: true } })] };
    map['GET /milestones/m1/due-changes'] = { items: [{ id: 'dc1', oldDueAt: '2027-02-01T16:59:59.000Z', newDueAt: '2027-03-01T16:59:59.000Z', reason: 'Gia hạn do nghỉ lễ', changedBy: { fullName: 'Cô Lan' }, changedAt: '2027-01-20T02:00:00.000Z' }] };
    open('/de-tai/t1/moc', 'STUDENT');
    expect(await screen.findByText('Quá hạn')).toBeTruthy();
    expect(screen.getByText('Nộp muộn')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thêm mốc' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sửa mốc' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Lịch sử đổi hạn' }));
    expect(await screen.findByText('Lý do: Gia hạn do nghỉ lễ')).toBeTruthy();
  });

  it('lỗi tải hiện error.message + Thử lại; rỗng hiện câu thông báo', async () => {
    map['GET /topics/t1/milestones'] = apiErr(500, 'INTERNAL', 'Lỗi hệ thống, vui lòng thử lại');
    open('/de-tai/t1/moc', 'STUDENT');
    expect(await screen.findByText('Lỗi hệ thống, vui lòng thử lại')).toBeTruthy();
    map['GET /topics/t1/milestones'] = { items: [] };
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Chưa có mốc thực hiện nào.')).toBeTruthy();
  });
});

describe('Tab Tiến độ – FR10', () => {
  it('SV: nhãn Tự khai; % ngoài 0–100 báo lỗi tại ô; tạo gửi percent là số', async () => {
    map['POST /topics/t1/progress'] = { progress: prog() };
    open('/de-tai/t1/tien-do', 'STUDENT', topic({ permissions: { addProgress: true } }));
    expect(await screen.findByText('Tự khai')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeTruthy(); // chính tác giả, chưa khóa
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật tiến độ' }));
    const form = screen.getByRole('form', { name: 'Cập nhật tiến độ' });
    type('Việc đã làm', 'Thu thập dữ liệu', within(form));
    type('Kế hoạch tới', 'Huấn luyện mô hình', within(form));
    type('Phần trăm hoàn thành (tự khai, 0–100)', '150', within(form));
    fireEvent.click(within(form).getByRole('button', { name: 'Lưu' }));
    expect(await within(form).findByText('Từ 0 đến 100')).toBeTruthy();
    expect(sent('POST', '/topics/t1/progress')).toHaveLength(0);
    type('Phần trăm hoàn thành (tự khai, 0–100)', '60', within(form));
    fireEvent.click(within(form).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/progress')[0][1].body).toEqual({ done: 'Thu thập dữ liệu', issues: '', nextPlan: 'Huấn luyện mô hình', percent: 60 }));
  });

  it('bản đã khóa / của người khác không có nút Sửa; sửa bị khóa giữa chừng → 409 PROGRESS_LOCKED hiện thông điệp', async () => {
    map['GET /topics/t1/progress'] = { items: [prog({ lockedAt: '2027-02-02T00:00:00.000Z', feedbacks: [{ id: 'f1', content: 'Tốt', lecturer: { fullName: 'Cô Lan' }, createdAt: '2027-02-02T00:00:00.000Z' }] }), prog({ id: 'p2', author: { id: 'sv2', code: 'SV2', fullName: 'Bình' } }), prog({ id: 'p3' })], page: 1, pageSize: 20, total: 3 };
    map['PATCH /progress/p3'] = apiErr(409, 'PROGRESS_LOCKED', 'Cập nhật tiến độ đã được GVHD nhận xét, không sửa được nữa');
    open('/de-tai/t1/tien-do', 'STUDENT', topic({ permissions: { addProgress: true } }));
    expect(await screen.findByText('Đã được giảng viên hướng dẫn nhận xét – không sửa được')).toBeTruthy();
    expect(screen.getByText('Tốt')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Sửa' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    const form = screen.getByRole('form', { name: 'Sửa tiến độ' });
    fireEvent.click(within(form).getByRole('button', { name: 'Lưu' }));
    expect(await within(form).findByText(/không sửa được nữa\. Dữ liệu đã được tải lại/)).toBeTruthy();
    expect(sent('PATCH', '/progress/p3')[0][1].body).toEqual({ done: 'Làm khảo sát', issues: '', nextPlan: 'Viết báo cáo', percent: 40 });
  });

  it('GVHD nhận xét tiến độ; SV không thấy form nhận xét', async () => {
    map['POST /progress/p1/feedbacks'] = { feedback: {}, progress: prog() };
    open('/de-tai/t1/tien-do', 'LECTURER', topic({ permissions: { giveFeedback: true } }));
    const form = await screen.findByRole('form', { name: 'Nhận xét' });
    expect(screen.queryByRole('button', { name: 'Cập nhật tiến độ' })).toBeNull();
    type('Nhận xét của giảng viên hướng dẫn', 'Cần bổ sung số liệu', within(form));
    fireEvent.click(within(form).getByRole('button', { name: 'Gửi nhận xét' }));
    await waitFor(() => expect(sent('POST', '/progress/p1/feedbacks')[0][1].body).toEqual({ content: 'Cần bổ sung số liệu' }));
    cleanup();
    open('/de-tai/t1/tien-do', 'STUDENT');
    expect(await screen.findByText('Tự khai')).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Nhận xét' })).toBeNull();
  });
});

describe('Tab Tài liệu – FR11, FR24, FR12', () => {
  it('SV nộp file: sai loại báo lỗi tại ô (không gọi API); file đúng gửi FormData stage/milestoneId/file', async () => {
    map['POST /topics/t1/documents'] = { document: doc() };
    open('/de-tai/t1/tai-lieu', 'STUDENT', topic({ permissions: { uploadMilestone: true } }));
    const form = await screen.findByRole('form', { name: 'Nộp tài liệu' });
    await within(form).findByRole('option', { name: /Báo cáo giữa kỳ/ });
    fireEvent.change(within(form).getByLabelText('Mốc'), { target: { value: 'm1' } });
    const input = within(form).getByLabelText('File');
    fireEvent.change(input, { target: { files: [new File(['x'], 'virus.exe')] } });
    fireEvent.click(within(form).getByRole('button', { name: 'Nộp' }));
    expect(await within(form).findByText('Chỉ nhận file PDF, DOCX, PPTX, XLSX')).toBeTruthy();
    expect(sent('POST', '/topics/t1/documents')).toHaveLength(0);
    const pdf = new File(['%PDF-1.4'], 'bao-cao.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [pdf] } });
    fireEvent.click(within(form).getByRole('button', { name: 'Nộp' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/documents')).toHaveLength(1));
    const fd = sent('POST', '/topics/t1/documents')[0][1].body;
    expect(fd).toBeInstanceOf(FormData);
    expect([fd.get('stage'), fd.get('milestoneId'), fd.get('file').name]).toEqual(['MIDTERM', 'm1', 'bao-cao.pdf']);
  });

  it('nộp link: http bị từ chối; https gửi JSON; 413 từ server gắn vào ô file', async () => {
    map['POST /topics/t1/documents/links'] = { document: doc({ kind: 'LINK' }) };
    map['POST /topics/t1/documents'] = apiErr(413, 'PAYLOAD_TOO_LARGE', 'File vượt quá dung lượng cho phép');
    open('/de-tai/t1/tai-lieu', 'STUDENT', topic({ status: 'NEEDS_REVISION', permissions: { uploadProposal: true } }));
    const form = await screen.findByRole('form', { name: 'Nộp tài liệu' });
    expect(within(form).queryByLabelText('Mốc')).toBeNull(); // đề cương không gắn mốc
    fireEvent.change(within(form).getByLabelText('File'), { target: { files: [new File(['%PDF'], 'de-cuong.pdf')] } });
    fireEvent.click(within(form).getByRole('button', { name: 'Nộp' }));
    expect(await within(form).findByText('File vượt quá dung lượng cho phép')).toBeTruthy();
    expect(sent('POST', '/topics/t1/documents')[0][1].body.get('milestoneId')).toBeNull();
    fireEvent.click(within(form).getByLabelText(/Đường dẫn \(mã nguồn/));
    type('Tên tài liệu', 'Mã nguồn', within(form));
    type('Đường dẫn (https)', 'http://github.com/x', within(form));
    fireEvent.click(within(form).getByRole('button', { name: 'Nộp' }));
    expect(await within(form).findByText('Chỉ nhận đường dẫn https')).toBeTruthy();
    type('Đường dẫn (https)', 'https://github.com/x', within(form));
    fireEvent.click(within(form).getByRole('button', { name: 'Nộp' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/documents/links')[0][1].body).toEqual({ stage: 'PROPOSAL', title: 'Mã nguồn', url: 'https://github.com/x' }));
  });

  it('danh sách phiên bản: nhãn nộp muộn, mới nhất; Tải về xin URL ký mỗi lần rồi chuyển trang; link ngoài mở trực tiếp', async () => {
    map['GET /topics/t1/documents'] = { items: [doc(), doc({ id: 'd6', version: 2, isLatest: false, isLate: false }), doc({ id: 'd8', milestoneId: null, stage: 'PROPOSAL', kind: 'LINK', version: 1, fileName: 'Mã nguồn', externalUrl: 'https://github.com/x', sizeBytes: null, isLate: false })] };
    map['POST /documents/d7/download-url'] = { url: 'https://api.cloudinary.com/v1_1/x/raw/download?sig=1', expiresAt: '2027-03-02T01:05:00.000Z' };
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign });
    open('/de-tai/t1/tai-lieu', 'STAFF');
    expect(await screen.findByText('Mốc: Báo cáo giữa kỳ')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Đề cương' })).toBeTruthy();
    expect(screen.getAllByText('Nộp muộn')).toHaveLength(1);
    expect(screen.getAllByText('Mới nhất')).toHaveLength(2);
    expect(screen.queryByRole('form', { name: 'Nộp tài liệu' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Mở đường dẫn' }).getAttribute('href')).toBe('https://github.com/x');
    fireEvent.click(screen.getAllByRole('button', { name: 'Tải về' })[0]);
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://api.cloudinary.com/v1_1/x/raw/download?sig=1'));
    expect(sent('POST', '/documents/d7/download-url')[0][1]).toEqual({ method: 'POST', body: {} });
  });

  it('GVHD nhận xét + đánh giá mốc trên bản mới nhất gửi milestoneVersion; 409 STALE_DOCUMENT hiện thông điệp', async () => {
    map['POST /documents/d7/feedbacks'] = apiErr(409, 'STALE_DOCUMENT', 'Chỉ đánh giá mốc trên bản nộp mới nhất');
    open('/de-tai/t1/tai-lieu', 'LECTURER', topic({ permissions: { giveFeedback: true } }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nhận xét (0)' }));
    const form = await screen.findByRole('form', { name: 'Nhận xét' });
    expect(await screen.findByText('Chưa có nhận xét.')).toBeTruthy();
    type('Nhận xét của giảng viên hướng dẫn', 'Đạt yêu cầu', within(form));
    fireEvent.change(within(form).getByLabelText('Đánh giá mốc'), { target: { value: 'PASSED' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Gửi nhận xét' }));
    expect(await within(form).findByText(/Chỉ đánh giá mốc trên bản nộp mới nhất/)).toBeTruthy();
    expect(sent('POST', '/documents/d7/feedbacks')[0][1].body).toEqual({ content: 'Đạt yêu cầu', evaluation: 'PASSED', milestoneVersion: 2 });
    expect(sent('GET', '/topics/t1/feedbacks')[0][0]).toContain('documentId=d7');
  });

  it('bản cũ hoặc mốc đã Đạt: chỉ nhận xét, không có ô đánh giá', async () => {
    map['GET /topics/t1/milestones'] = { items: [ms({ evaluation: 'PASSED' })] };
    open('/de-tai/t1/tai-lieu', 'LECTURER', topic({ permissions: { giveFeedback: true } }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nhận xét (0)' }));
    const form = await screen.findByRole('form', { name: 'Nhận xét' });
    expect(within(form).queryByLabelText('Đánh giá mốc')).toBeNull();
  });

  it('fileError: thiếu file, sai đuôi, quá dung lượng theo cấu hình đợt', () => {
    const cfg = { allowedFileTypes: ['pdf'], maxFileSizeMB: 1 };
    expect(fileError(undefined, cfg)).toBe('Chọn file cần nộp');
    expect(fileError({ name: 'a.PDF', size: 10 }, cfg)).toBeNull();
    expect(fileError({ name: 'a', size: 10 }, cfg)).toBe('Chỉ nhận file PDF');
    expect(fileError({ name: 'a.pdf', size: 1048577 }, cfg)).toBe('File vượt quá 1 MB');
  });
});

describe('Kết quả cuối + đóng đề tài – FR12, FR27', () => {
  const result = (o = {}) => ({ id: 'rv1', version: 1, result: 'PASS', summary: 'Hoàn thành đủ nội dung đăng ký', reason: null, isCurrent: true, createdBy: { fullName: 'Cô Lan' }, createdAt: '2027-05-01T00:00:00.000Z', ...o });

  it('SV thấy kết quả GVHD vừa nhập và tab thực hiện; không có form nhập', async () => {
    map['GET /topics/t1/results'] = { current: result(), items: [result()] };
    open('/de-tai/t1', 'STUDENT', topic({ currentResult: { version: 1, result: 'PASS', createdAt: '2027-05-01T00:00:00.000Z' } }));
    expect(await screen.findByText('Hoàn thành đủ nội dung đăng ký')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mốc' }).getAttribute('href')).toBe('/de-tai/t1/moc');
    expect(screen.getByRole('link', { name: 'Tiến độ' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tài liệu' })).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Nhập kết quả cuối' })).toBeNull();
  });

  it('GVHD nhập lại kết quả: gửi expectedVersion = phiên bản đang thấy; thiếu nhận xét tổng kết báo lỗi tại ô', async () => {
    map['GET /topics/t1/results'] = { current: result(), items: [result()] };
    map['POST /topics/t1/results'] = { result: result({ version: 2 }) };
    open('/de-tai/t1', 'LECTURER', topic({ permissions: { enterResult: true }, closeReadiness: { requiredMilestonesPassed: false, hasFinalResult: true, requiredMilestoneCount: 2, pendingMilestones: 1, requiredRemovedCount: 1 } }));
    const form = await screen.findByRole('form', { name: 'Nhập kết quả cuối' });
    expect(screen.getByText(/1\/2 Đạt – Chưa đạt/)).toBeTruthy();
    expect(screen.getByText(/1 mốc chưa Đạt đã bị bỏ cờ bắt buộc/)).toBeTruthy();
    fireEvent.change(within(form).getByLabelText('Kết quả'), { target: { value: 'GOOD' } });
    type('Nhận xét tổng kết', 'Ngắn', within(form));
    fireEvent.click(within(form).getByRole('button', { name: 'Lưu kết quả' }));
    expect(await within(form).findByText('Nhận xét tổng kết tối thiểu 20 ký tự')).toBeTruthy();
    type('Nhận xét tổng kết', 'Nhóm hoàn thành tốt, sản phẩm chạy ổn định', within(form));
    fireEvent.click(within(form).getByRole('button', { name: 'Lưu kết quả' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/results')[0][1].body).toEqual({ result: 'GOOD', summary: 'Nhóm hoàn thành tốt, sản phẩm chạy ổn định', expectedVersion: 1 }));
  });

  it('GVHD gửi đóng: body {action, version}; MILESTONES_NOT_PASSED hiện tên mốc trong hộp', async () => {
    map['POST /topics/t1/actions'] = apiErr(409, 'MILESTONES_NOT_PASSED', 'Còn mốc bắt buộc chưa Đạt', { milestones: [{ id: 'm1', name: 'Báo cáo giữa kỳ' }] });
    open('/de-tai/t1', 'LECTURER', topic({ availableActions: ['REQUEST_CLOSE'] }));
    fireEvent.click(await screen.findByRole('button', { name: 'Đề nghị đóng đề tài' }));
    const dlg = screen.getByRole('dialog');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Đề nghị đóng đề tài' }));
    expect(await within(dlg).findByText('Còn mốc bắt buộc chưa Đạt: Báo cáo giữa kỳ')).toBeTruthy();
    expect(sent('POST', '/topics/t1/actions')[0][1].body).toEqual({ action: 'REQUEST_CLOSE', version: 5 });
  });

  it('cán bộ: Đóng do quá hạn bắt buộc lý do, có cảnh báo đợt chưa hết; Trả lại gửi reason; Xác nhận đóng', async () => {
    const waiting = topic({ status: 'WAITING_CLOSE', availableActions: ['RETURN_TO_ADVISOR', 'CONFIRM_CLOSE'] });
    map['POST /topics/t1/actions'] = (p, o) => ({ topic: o.body.action === 'CONFIRM_CLOSE' ? topic({ status: 'CLOSED' }) : topic() });
    open('/de-tai/t1', 'STAFF', topic({ availableActions: ['CLOSE_EXPIRED'] }));
    fireEvent.click(await screen.findByRole('button', { name: 'Đóng do quá hạn' }));
    let dlg = screen.getByRole('dialog');
    expect(within(dlg).getByText(/Đợt chưa kết thúc/)).toBeTruthy();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Đóng do quá hạn' }));
    await waitFor(() => expect(within(dlg).getByRole('textbox').getAttribute('aria-invalid')).toBe('true'));
    expect(sent('POST', '/topics/t1/actions')).toHaveLength(0);
    fireEvent.change(within(dlg).getByRole('textbox'), { target: { value: 'Hết hạn, nhóm không nộp' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Đóng do quá hạn' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/actions')[0][1].body).toEqual({ action: 'CLOSE_EXPIRED', version: 5, reason: 'Hết hạn, nhóm không nộp' }));

    cleanup();
    open('/de-tai/t1', 'STAFF', waiting);
    fireEvent.click(await screen.findByRole('button', { name: 'Trả lại giảng viên' }));
    dlg = screen.getByRole('dialog');
    fireEvent.change(within(dlg).getByRole('textbox'), { target: { value: 'Thiếu minh chứng' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Trả lại giảng viên' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/actions')[0][1].body).toEqual({ action: 'RETURN_TO_ADVISOR', version: 5, reason: 'Thiếu minh chứng' }));

    cleanup();
    open('/de-tai/t1', 'STAFF', waiting);
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận đóng đề tài' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận đóng đề tài' }));
    await waitFor(() => expect(sent('POST', '/topics/t1/actions')[0][1].body).toEqual({ action: 'CONFIRM_CLOSE', version: 5 }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('không có quyền đọc thực hiện → không có tab; action đóng chỉ theo availableActions', async () => {
    open('/de-tai/t1', 'LECTURER', topic({ permissions: { readExecution: false } }));
    expect(await screen.findByText('Đề tài A')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Mốc' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Đề nghị đóng đề tài' })).toBeNull();
    expect(screen.queryByText('Kết quả cuối')).toBeNull();
  });

  it('closeErrorMessage: chỉ thêm tên mốc với MILESTONES_NOT_PASSED', () => {
    expect(closeErrorMessage({ code: 'NO_FINAL_RESULT', message: 'Chưa có kết quả' })).toBe('Chưa có kết quả');
    expect(closeErrorMessage({ code: 'MILESTONES_NOT_PASSED', message: 'Còn mốc', details: { milestones: [{ name: 'A' }, { name: 'B' }] } })).toBe('Còn mốc: A, B');
  });
});
