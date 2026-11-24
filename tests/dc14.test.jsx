// TASK-DC-14: sinh viên xem bảng tin đề tài tuyển (R26), chi tiết + ứng tuyển (R27), đơn ứng tuyển của tôi (R28), menu theo vai trò.
// Mô phỏng api như dc13.test.jsx, dựng toàn bộ route.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const calls = vi.hoisted(() => ({ api: null }));
vi.mock('../src/lib/api.js', () => ({
  bootstrapSession: vi.fn(() => Promise.resolve()),
  logout: vi.fn(),
  api: (...a) => calls.api(...a),
}));

import { routes } from '../src/routes.jsx';
import { MENU, canVisit } from '../src/lib/nav.js';
import { auth } from '../src/lib/auth.js';
import { clearToasts } from '../src/lib/toast.js';

const apiErr = (status, code, message, details) => Object.assign(new Error(message), { status, code, details });
const item = (o = {}) => ({
  topicId: 't9', code: 'DT-009', title: 'Chatbot hỗ trợ tuyển sinh', summaryExcerpt: 'Xây dựng chatbot', field: { id: 'fd1', name: 'AI' },
  round: { id: 'r1', name: 'Đợt 1', registrationOpen: true }, lecturer: { id: 'gv1', fullName: 'Cô Lan' }, recruitSlots: 3, acceptedCount: 1, myApplication: null, ...o,
});
const detail = (o = {}) => ({ ...item(), summary: 'Tóm tắt đầy đủ', objectives: 'Mục tiêu đề tài', keywords: ['a', 'b'], requirements: 'Biết React', ...o });
const app = (o = {}) => ({
  id: 'ap1', status: 'PENDING', coverLetter: 'Em muốn tham gia vì thích đề tài này', reason: null, createdAt: '2026-11-18T03:00:00Z', respondedAt: null,
  topic: { id: 't9', code: 'DT-009', title: 'Chatbot hỗ trợ tuyển sinh', status: 'RECRUITING' }, student: { id: 's1' }, availableActions: ['WITHDRAW'], ...o,
});
const page = (items, o = {}) => ({ items, page: 1, pageSize: 12, total: items.length, ...o });
const LETTER = 'Em có kinh nghiệm React và muốn tham gia nhóm.';

let map;
const open = (url, role = 'STUDENT') => {
  auth.clear();
  auth.setSession({ accessToken: 't', user: { id: 's1', code: 'SV1', fullName: 'An', role, mustChangePassword: false, facultyId: 'f1' } });
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

beforeEach(() => {
  map = {
    'GET /recruitments': page([item()]),
    'GET /recruitments/t9': { recruitment: detail() },
    'GET /rounds': { items: [{ id: 'r1', name: 'Đợt 1', academicYear: '2026-2027' }] },
    'GET /fields': { items: [{ id: 'fd1', name: 'AI' }] },
    'GET /lecturers': { items: [{ id: 'gv1', code: 'GV1', fullName: 'Cô Lan' }] },
    'GET /applications': page([app()], { pageSize: 20 }),
    'GET /topics': page([]),
    'GET /invitations': page([]),
  };
});
afterEach(() => { cleanup(); clearToasts(); });

describe('R26 bảng tin', () => {
  it('hiện thẻ: chỗ còn lại, đợt đóng đăng ký, trạng thái đơn của tôi', async () => {
    map['GET /recruitments'] = page([item({ round: { id: 'r1', name: 'Đợt 1', registrationOpen: false }, myApplication: { id: 'ap1', status: 'PENDING' } })]);
    open('/tuyen-sinh');
    expect(await screen.findByText('Chatbot hỗ trợ tuyển sinh')).toBeTruthy();
    expect(screen.getByText('Còn 2 chỗ')).toBeTruthy();
    expect(screen.getByText('Đã đóng đăng ký')).toBeTruthy();
    expect(screen.getByText('Đang chờ duyệt')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Chatbot/ }).getAttribute('href')).toBe('/tuyen-sinh/t9');
  });

  it('lọc theo đợt đẩy tham số lên API và ghi vào URL', async () => {
    const router = open('/tuyen-sinh');
    await screen.findByText('Chatbot hỗ trợ tuyển sinh');
    fireEvent.change(await screen.findByLabelText('Đợt'), { target: { value: 'r1' } });
    await waitFor(() => expect(router.state.location.search).toContain('roundId=r1'));
    await waitFor(() => expect(sent('GET', '/recruitments').some(([p]) => p.includes('roundId=r1'))).toBe(true));
    await waitFor(() => expect(sent('GET', '/lecturers')[0][0]).toContain('roundId=r1'));
  });

  it('tìm kiếm gửi q cho API (từ 2 ký tự)', async () => {
    open('/tuyen-sinh?q=chatbot');
    await screen.findByText('Chatbot hỗ trợ tuyển sinh');
    expect(sent('GET', '/recruitments').some(([p]) => p.includes('q=chatbot'))).toBe(true);
  });

  it('rỗng: câu thông báo; có bộ lọc: câu khác', async () => {
    map['GET /recruitments'] = page([]);
    open('/tuyen-sinh');
    expect(await screen.findByText('Hiện chưa có đề tài nào đang tuyển sinh viên.')).toBeTruthy();
    cleanup();
    open('/tuyen-sinh?fieldId=fd1');
    expect(await screen.findByText('Không có đề tài nào khớp bộ lọc.')).toBeTruthy();
  });

  it('phân trang: trang sau gọi page=2', async () => {
    map['GET /recruitments'] = page([item()], { total: 30 });
    open('/tuyen-sinh');
    await screen.findByText('Chatbot hỗ trợ tuyển sinh');
    fireEvent.click(screen.getByRole('button', { name: /Trang sau/ }));
    await waitFor(() => expect(sent('GET', '/recruitments').some(([p]) => p.includes('page=2'))).toBe(true));
  });

  it('lỗi API hiện thông điệp của server', async () => {
    map['GET /recruitments'] = apiErr(500, 'INTERNAL', 'Máy chủ đang bận');
    open('/tuyen-sinh');
    expect(await screen.findByText(/Máy chủ đang bận/)).toBeTruthy();
  });

  it('giảng viên có nút công bố; sinh viên không có', async () => {
    open('/tuyen-sinh', 'LECTURER');
    expect(await screen.findByRole('link', { name: 'Công bố đề tài tuyển sinh viên' })).toBeTruthy();
    cleanup();
    open('/tuyen-sinh');
    await screen.findByText('Chatbot hỗ trợ tuyển sinh');
    expect(screen.queryByRole('link', { name: 'Công bố đề tài tuyển sinh viên' })).toBeNull();
  });

  it('R4 rỗng của sinh viên có nút sang bảng tin', async () => {
    open('/de-tai');
    expect(await screen.findByRole('link', { name: 'Xem đề tài giảng viên đang tuyển' })).toBeTruthy();
  });
});

describe('R27 chi tiết và ứng tuyển', () => {
  it('hiện nội dung đề tài và form lời giới thiệu có bộ đếm', async () => {
    open('/tuyen-sinh/t9');
    expect(await screen.findByRole('heading', { name: 'Chatbot hỗ trợ tuyển sinh' })).toBeTruthy();
    expect(screen.getByText('Biết React')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Lời giới thiệu'), { target: { value: 'abc' } });
    expect(screen.getByText(/3\/2000 ký tự/)).toBeTruthy();
  });

  it('lời giới thiệu ngắn bị chặn ở form, không gọi API', async () => {
    open('/tuyen-sinh/t9');
    fireEvent.change(await screen.findByLabelText('Lời giới thiệu'), { target: { value: 'ngắn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi ứng tuyển' }));
    expect(await screen.findByText('Lời giới thiệu tối thiểu 20 ký tự')).toBeTruthy();
    expect(sent('POST', '/recruitments/t9/applications')).toHaveLength(0);
  });

  it('gửi thành công: body đúng, sau đó tải lại đề tài', async () => {
    map['POST /recruitments/t9/applications'] = { application: app() };
    open('/tuyen-sinh/t9');
    fireEvent.change(await screen.findByLabelText('Lời giới thiệu'), { target: { value: LETTER } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi ứng tuyển' }));
    await waitFor(() => expect(sent('POST', '/recruitments/t9/applications')[0][1].body).toEqual({ coverLetter: LETTER }));
    await waitFor(() => expect(sent('GET', '/recruitments/t9').length).toBeGreaterThan(1));
  });

  it.each([
    ['APPLICATION_EXISTS', 'Bạn đã ứng tuyển đề tài này'],
    ['REGISTRATION_CLOSED', 'Ngoài thời gian đăng ký của đợt'],
    ['STUDENT_TOPIC_LIMIT', 'Bạn đã đạt số đề tài tối đa trong đợt'],
    ['ALREADY_MEMBER', 'Bạn đã là thành viên đề tài này'],
    ['NOT_RECRUITING', 'Đề tài không còn tuyển sinh viên'],
  ])('mã lỗi %s hiện thông điệp tiếng Việt của server', async (code, message) => {
    map['POST /recruitments/t9/applications'] = apiErr(409, code, message);
    open('/tuyen-sinh/t9');
    fireEvent.change(await screen.findByLabelText('Lời giới thiệu'), { target: { value: LETTER } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi ứng tuyển' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', message);
  });

  it('lỗi 400 theo trường hiện dưới ô lời giới thiệu', async () => {
    map['POST /recruitments/t9/applications'] = apiErr(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { coverLetter: 'Lời giới thiệu không hợp lệ' });
    open('/tuyen-sinh/t9');
    fireEvent.change(await screen.findByLabelText('Lời giới thiệu'), { target: { value: LETTER } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi ứng tuyển' }));
    expect(await screen.findByText('Lời giới thiệu không hợp lệ')).toBeTruthy();
  });

  it('đơn đang chờ: ẩn form, hiện "Rút đơn" có xác nhận', async () => {
    map['GET /recruitments/t9'] = { recruitment: detail({ myApplication: { id: 'ap1', status: 'PENDING' } }) };
    map['POST /applications/ap1/withdraw'] = { application: app({ status: 'WITHDRAWN' }) };
    open('/tuyen-sinh/t9');
    expect(await screen.findByText('Đang chờ duyệt')).toBeTruthy();
    expect(screen.queryByLabelText('Lời giới thiệu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rút đơn' }));
    expect(sent('POST', '/applications/ap1/withdraw')).toHaveLength(0);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Rút đơn'));
    await waitFor(() => expect(sent('POST', '/applications/ap1/withdraw')).toHaveLength(1));
  });

  it('đã được nhận: có liên kết vào đề tài, không có form', async () => {
    map['GET /recruitments/t9'] = { recruitment: detail({ myApplication: { id: 'ap1', status: 'ACCEPTED' } }) };
    open('/tuyen-sinh/t9');
    expect((await screen.findByRole('link', { name: 'Vào đề tài' })).getAttribute('href')).toBe('/de-tai/t9');
    expect(screen.queryByLabelText('Lời giới thiệu')).toBeNull();
  });

  it('đơn bị từ chối: cho gửi đơn mới', async () => {
    map['GET /recruitments/t9'] = { recruitment: detail({ myApplication: { id: 'ap1', status: 'DECLINED' } }) };
    open('/tuyen-sinh/t9');
    expect(await screen.findByLabelText('Lời giới thiệu')).toBeTruthy();
  });

  it('giảng viên: chỉ đọc, không có form', async () => {
    open('/tuyen-sinh/t9', 'LECTURER');
    await screen.findByRole('heading', { name: 'Chatbot hỗ trợ tuyển sinh' });
    expect(screen.queryByLabelText('Lời giới thiệu')).toBeNull();
  });

  it('404: "Đề tài không còn tuyển hoặc không tồn tại"', async () => {
    map['GET /recruitments/t9'] = apiErr(404, 'NOT_FOUND', 'Không tìm thấy');
    open('/tuyen-sinh/t9');
    expect(await screen.findByText('Đề tài không còn tuyển hoặc không tồn tại.')).toBeTruthy();
  });
});

describe('R28 đơn ứng tuyển của tôi', () => {
  it('hiện đơn; rút đơn phải xác nhận mới gọi API', async () => {
    map['POST /applications/ap1/withdraw'] = { application: app({ status: 'WITHDRAWN' }) };
    open('/don-ung-tuyen');
    expect(await screen.findByText('Chatbot hỗ trợ tuyển sinh')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rút đơn' }));
    expect(sent('POST', '/applications/ap1/withdraw')).toHaveLength(0);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Rút đơn'));
    await waitFor(() => expect(sent('POST', '/applications/ap1/withdraw')).toHaveLength(1));
  });

  it('hiện GV của đề tài (UI §12.6)', async () => {
    map['GET /applications'] = page([app({ topic: { ...app().topic, advisor: { fullName: 'Cô Lan' } } })]);
    open('/don-ung-tuyen');
    expect(await screen.findByText('GV: Cô Lan')).toBeTruthy();
  });

  it('APPLICATION_CLOSED khi rút hiện trong hộp thoại', async () => {
    map['POST /applications/ap1/withdraw'] = apiErr(409, 'APPLICATION_CLOSED', 'Đơn đã được xử lý');
    open('/don-ung-tuyen');
    await screen.findByText('Chatbot hỗ trợ tuyển sinh');
    fireEvent.click(screen.getByRole('button', { name: 'Rút đơn' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Rút đơn'));
    expect(await screen.findByText('Đơn đã được xử lý')).toBeTruthy();
  });

  it('nút theo availableActions: đơn bị từ chối hiện lý do, không có nút Rút; đơn nhận có "Vào đề tài"', async () => {
    map['GET /applications'] = page([
      app({ id: 'a2', status: 'DECLINED', reason: 'Không phù hợp', availableActions: [] }),
      app({ id: 'a3', status: 'ACCEPTED', availableActions: [] }),
    ]);
    open('/don-ung-tuyen');
    expect(await screen.findByText('Lý do từ chối: Không phù hợp')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rút đơn' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Vào đề tài' })).toBeTruthy();
  });

  it('rỗng: thông báo và nút sang bảng tin', async () => {
    map['GET /applications'] = page([]);
    open('/don-ung-tuyen');
    expect(await screen.findByText('Bạn chưa ứng tuyển đề tài nào.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem đề tài đang tuyển' }).getAttribute('href')).toBe('/tuyen-sinh');
  });
});

describe('menu và quyền dẫn đường', () => {
  it('mục menu theo vai trò', () => {
    const has = (role, to) => MENU[role].some((m) => m.to === to);
    expect(has('STUDENT', '/tuyen-sinh') && has('STUDENT', '/don-ung-tuyen')).toBe(true);
    expect(has('LECTURER', '/tuyen-sinh')).toBe(true);
    expect(has('LECTURER', '/don-ung-tuyen')).toBe(false);
    expect(has('ADMIN', '/tuyen-sinh')).toBe(false);
  });

  it('canVisit: đơn ứng tuyển chỉ sinh viên; bảng tin không có quản trị viên', () => {
    expect(canVisit('STUDENT', '/don-ung-tuyen')).toBe(true);
    expect(canVisit('LECTURER', '/don-ung-tuyen')).toBe(false);
    expect(canVisit('ADMIN', '/tuyen-sinh/t9')).toBe(false);
    expect(canVisit('STAFF', '/tuyen-sinh/t9')).toBe(true);
  });
});
