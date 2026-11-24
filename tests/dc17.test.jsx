// TASK-DC-17: Kanban R36 (UI §12.10, API_GD7 §10.2) – hàm thuần kanbanColumn, kéo thả HTML5 chỉ cho GVHD hiện hành,
// menu "Chuyển sang…" (bàn phím/cảm ứng), hộp nhận xét/lý do bắt buộc, không cập nhật lạc quan, aria-live, chỉ xem cho vai trò khác.
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
import { canVisit } from '../src/lib/nav.js';
import { clearToasts, toastStore } from '../src/lib/toast.js';
import { kanbanColumn, kanbanTargets } from '../src/pages/topics/KanbanPage.jsx';

const apiErr = (status, code, message, details) => Object.assign(new Error(message), { status, code, details });
const topic = (o = {}) => ({
  id: 't1', code: 'DT-001', title: 'Hệ thống gợi ý học tập', status: 'IN_PROGRESS', version: 3,
  members: [{ userId: 's1', fullName: 'An', code: 'SV1', role: 'LEADER' }], advisor: { id: 'gv1', fullName: 'Thầy Hướng' },
  availableActions: [], permissions: { readExecution: true, manageMilestones: true }, ...o,
});
const doc = (id, version, o = {}) => ({ id, version, uploadedAt: '2026-11-19T02:00:00Z', isLate: false, ...o });
const ms = (id, o = {}) => ({
  id, topicId: 't1', order: 1, name: `Mốc ${id}`, output: 'Báo cáo', dueAt: '2026-12-01T10:00:00Z', required: true,
  evaluation: 'PENDING', version: 4, isOverdue: false, latestDocument: null, awaitingFeedback: false, dueChangeCount: 0, reopenCount: 0, lastReopen: null, ...o,
});
const MILESTONES = [
  ms('m1', { name: 'Đề cương', isOverdue: true }),
  ms('m2', { name: 'Báo cáo giữa kỳ', order: 2, latestDocument: doc('d2', 3, { isLate: true }), awaitingFeedback: true, version: 5 }),
  ms('m3', { name: 'Thực nghiệm', order: 3, evaluation: 'NEEDS_WORK', latestDocument: doc('d3', 1), required: false }),
  ms('m4', { name: 'Báo cáo cuối', order: 4, evaluation: 'PASSED', latestDocument: doc('d4', 2), version: 9 }),
];
const USERS = {
  LECTURER: { id: 'gv1', code: 'GV1', fullName: 'Thầy Hướng', role: 'LECTURER' },
  OTHER_LECTURER: { id: 'gv2', code: 'GV2', fullName: 'Cô Hội đồng', role: 'LECTURER' },
  STUDENT: { id: 's1', code: 'SV1', fullName: 'An', role: 'STUDENT' },
  STAFF: { id: 'cb1', code: 'CB1', fullName: 'Cán bộ', role: 'STAFF', staffFacultyIds: ['f1'] },
};

let map;
const open = (url, who = 'LECTURER') => {
  auth.clear();
  auth.setSession({ accessToken: 't', user: { ...USERS[who], mustChangePassword: false, facultyId: 'f1' } });
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
const column = (label) => screen.getByRole('region', { name: label, hidden: true }) // hidden: vẫn tìm được khi hộp thoại modal đang mở;
const card = (id) => screen.getByTestId(`kanban-card-${id}`);
// DataTransfer giả cho jsdom (không có sẵn)
const dt = () => ({ setData: vi.fn(), getData: vi.fn(), effectAllowed: '', dropEffect: '' });
const openMenu = async (name) => {
  fireEvent.keyDown(screen.getByRole('button', { name: `Chuyển ${name} sang…` }), { key: 'Enter' });
  return screen.findByRole('menu');
};

beforeEach(() => {
  map = {
    'GET /topics/t1': { topic: topic() },
    'GET /topics/t1/milestones': { items: MILESTONES },
  };
});
afterEach(() => { cleanup(); clearToasts(); });

describe('kanbanColumn, kanbanTargets (hàm thuần)', () => {
  it('PASSED → Đạt; awaitingFeedback → Chờ đánh giá; NEEDS_WORK → Cần bổ sung; còn lại → Chưa nộp', () => {
    expect(kanbanColumn({ evaluation: 'PASSED', awaitingFeedback: false })).toBe('PASSED');
    expect(kanbanColumn({ evaluation: 'PASSED', awaitingFeedback: true })).toBe('PASSED'); // Đạt ưu tiên
    expect(kanbanColumn({ evaluation: 'PENDING', awaitingFeedback: true })).toBe('AWAITING');
    expect(kanbanColumn({ evaluation: 'NEEDS_WORK', awaitingFeedback: true })).toBe('AWAITING'); // nộp lại sau Cần bổ sung
    expect(kanbanColumn({ evaluation: 'NEEDS_WORK', awaitingFeedback: false })).toBe('NEEDS_WORK');
    expect(kanbanColumn({ evaluation: 'PENDING', awaitingFeedback: false })).toBe('TODO');
  });
  it('cột đích hợp lệ: Chờ đánh giá → Đạt/Cần bổ sung; Đạt → Cần bổ sung; cột khác không có', () => {
    expect(kanbanTargets({ evaluation: 'PENDING', awaitingFeedback: true })).toEqual(['PASSED', 'NEEDS_WORK']);
    expect(kanbanTargets({ evaluation: 'PASSED' })).toEqual(['NEEDS_WORK']);
    expect(kanbanTargets({ evaluation: 'NEEDS_WORK', awaitingFeedback: false })).toEqual([]);
    expect(kanbanTargets({ evaluation: 'PENDING', awaitingFeedback: false })).toEqual([]);
  });
});

describe('R36 hiển thị', () => {
  it('route cho SV, GV, cán bộ (không ADMIN); tab Kanban cạnh Mốc', async () => {
    expect(['STUDENT', 'LECTURER', 'STAFF'].every((r) => canVisit(r, '/de-tai/t1/kanban'))).toBe(true);
    expect(canVisit('ADMIN', '/de-tai/t1/kanban')).toBe(false);
    open('/de-tai/t1/kanban');
    expect((await screen.findByRole('link', { name: 'Kanban' })).getAttribute('href')).toBe('/de-tai/t1/kanban');
  });

  it('4 cột có số thẻ, thẻ đúng cột, hạn đỏ khi quá hạn, Bắt buộc, phiên bản + Nộp muộn, link tới tab Mốc, aria-describedby', async () => {
    open('/de-tai/t1/kanban');
    await screen.findByText('2. Báo cáo giữa kỳ');
    expect(within(column('Chưa nộp')).getByRole('heading').textContent).toContain('(1)');
    expect(within(column('Chưa nộp')).getByText('1. Đề cương')).toBeTruthy();
    expect(within(column('Chờ đánh giá')).getByText('2. Báo cáo giữa kỳ')).toBeTruthy();
    expect(within(column('Cần bổ sung')).getByText('3. Thực nghiệm')).toBeTruthy();
    expect(within(column('Đạt')).getByText('4. Báo cáo cuối')).toBeTruthy();
    expect(within(card('m1')).getByText(/quá hạn/).className).toContain('text-red-700');
    expect(within(card('m2')).getByText('Bản nộp phiên bản 3')).toBeTruthy();
    expect(within(card('m2')).getByText('Nộp muộn')).toBeTruthy();
    expect(within(card('m2')).getByText('Bắt buộc')).toBeTruthy();
    expect(within(card('m3')).queryByText('Bắt buộc')).toBeNull();
    expect(screen.getByRole('link', { name: '2. Báo cáo giữa kỳ' }).getAttribute('href')).toBe('/de-tai/t1/moc#moc-m2');
    const desc = document.getElementById(card('m2').getAttribute('aria-describedby'));
    expect(desc.textContent).toBe('Cột hiện tại: Chờ đánh giá');
  });

  it('dưới lg: thu gọn được từng cột', async () => {
    open('/de-tai/t1/kanban');
    await screen.findByText('1. Đề cương');
    const btn = within(column('Chưa nộp')).getByRole('button', { name: 'Thu gọn' });
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(within(column('Chưa nộp')).getByRole('list', { hidden: true }).className).toContain('hidden');
  });

  it('chưa có mốc → trạng thái rỗng', async () => {
    map['GET /topics/t1/milestones'] = { items: [] };
    open('/de-tai/t1/kanban');
    expect(await screen.findByText('Chưa có mốc thực hiện nào.')).toBeTruthy();
  });
});

describe('chỉ xem cho người không phải GVHD hiện hành', () => {
  const readOnly = async () => {
    await screen.findByText('2. Báo cáo giữa kỳ');
    expect(screen.queryByRole('button', { name: /Chuyển .* sang…/ })).toBeNull();
    expect(document.querySelector('[draggable="true"]')).toBeNull();
  };
  it('sinh viên', async () => {
    map['GET /topics/t1'] = { topic: topic({ permissions: { readExecution: true } }) };
    open('/de-tai/t1/kanban', 'STUDENT');
    await readOnly();
  });
  it('cán bộ (manageMilestones true nhưng không phải GVHD)', async () => {
    open('/de-tai/t1/kanban', 'STAFF');
    await readOnly();
  });
  it('thành viên hội đồng (GV khác)', async () => {
    map['GET /topics/t1'] = { topic: topic({ status: 'WAITING_DEFENSE', permissions: { readExecution: true } }) };
    open('/de-tai/t1/kanban', 'OTHER_LECTURER');
    await readOnly();
  });
  it('GVHD nhưng đề tài không còn IN_PROGRESS', async () => {
    map['GET /topics/t1'] = { topic: topic({ status: 'WAITING_DEFENSE' }) };
    open('/de-tai/t1/kanban');
    await readOnly();
  });
});

describe('GVHD hiện hành chuyển cột', () => {
  it('chỉ thẻ có cột đích hợp lệ mới kéo được; menu liệt kê đúng cột đích', async () => {
    open('/de-tai/t1/kanban');
    await screen.findByText('2. Báo cáo giữa kỳ');
    expect(card('m1').getAttribute('draggable')).toBeNull();
    expect(card('m3').getAttribute('draggable')).toBeNull();
    expect(card('m2').getAttribute('draggable')).toBe('true');
    expect(card('m4').getAttribute('draggable')).toBe('true');
    const menu = await openMenu('Báo cáo giữa kỳ');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Đạt', 'Cần bổ sung']);
    fireEvent.keyDown(menu, { key: 'Escape' });
    const menu2 = await openMenu('Báo cáo cuối');
    expect(within(menu2).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Cần bổ sung']);
  });

  it('kéo thả: chỉ cột hợp lệ nhận thả; Chờ đánh giá → Đạt mở hộp nhận xét bắt buộc rồi gửi feedback, aria-live báo', async () => {
    let list = MILESTONES;
    map['GET /topics/t1/milestones'] = () => ({ items: list });
    map['POST /documents/d2/feedbacks'] = () => {
      list = MILESTONES.map((m) => (m.id === 'm2' ? { ...m, evaluation: 'PASSED', awaitingFeedback: false } : m));
      return { feedback: { id: 'f1' } };
    };
    open('/de-tai/t1/kanban');
    await screen.findByText('2. Báo cáo giữa kỳ');
    const data = dt();
    fireEvent.dragStart(card('m2'), { dataTransfer: data });
    expect(data.setData).toHaveBeenCalledWith('text/plain', 'm2');
    // Cột không hợp lệ: dropEffect none, thả không mở hộp thoại
    const bad = dt();
    fireEvent.dragOver(column('Chưa nộp'), { dataTransfer: bad });
    expect(bad.dropEffect).toBe('none');
    fireEvent.drop(column('Chưa nộp'), { dataTransfer: bad });
    expect(screen.queryByRole('dialog')).toBeNull();
    // Cột hợp lệ: viền nổi bật, dropEffect move
    fireEvent.dragStart(card('m2'), { dataTransfer: data });
    expect(column('Đạt').className).toContain('ring-2');
    expect(column('Chưa nộp').className).not.toContain('ring-2');
    const good = dt();
    fireEvent.dragOver(column('Đạt'), { dataTransfer: good });
    expect(good.dropEffect).toBe('move');
    fireEvent.drop(column('Đạt'), { dataTransfer: good });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Đánh giá “Báo cáo giữa kỳ”: Đạt')).toBeTruthy();
    // Nhận xét bắt buộc
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi đánh giá' }));
    expect(await within(dialog).findByText('Nhập nội dung nhận xét')).toBeTruthy();
    expect(sent('POST', '/documents/d2/feedbacks')).toHaveLength(0);
    // Chưa gửi thành công thì thẻ vẫn ở cột cũ (không lạc quan)
    expect(within(column('Chờ đánh giá')).getByText('2. Báo cáo giữa kỳ')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Nhận xét'), { target: { value: 'Tốt, đạt yêu cầu' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi đánh giá' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sent('POST', '/documents/d2/feedbacks')[0][1].body).toEqual({ content: 'Tốt, đạt yêu cầu', evaluation: 'PASSED', milestoneVersion: 5 });
    await waitFor(() => expect(within(column('Đạt')).getByText('2. Báo cáo giữa kỳ')).toBeTruthy());
    expect(screen.getByText('Đã chuyển Báo cáo giữa kỳ sang Đạt').getAttribute('aria-live')).toBe('polite');
  });

  it('bàn phím: menu "Chuyển sang…" → Cần bổ sung gửi evaluation NEEDS_WORK', async () => {
    map['POST /documents/d2/feedbacks'] = { feedback: { id: 'f1' } };
    open('/de-tai/t1/kanban');
    await screen.findByText('2. Báo cáo giữa kỳ');
    const menu = await openMenu('Báo cáo giữa kỳ');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Cần bổ sung' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Nhận xét'), { target: { value: 'Bổ sung số liệu' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi đánh giá' }));
    await waitFor(() => expect(sent('POST', '/documents/d2/feedbacks')).toHaveLength(1));
    expect(sent('POST', '/documents/d2/feedbacks')[0][1].body).toEqual({ content: 'Bổ sung số liệu', evaluation: 'NEEDS_WORK', milestoneVersion: 5 });
    expect(await screen.findByText('Đã chuyển Báo cáo giữa kỳ sang Cần bổ sung')).toBeTruthy();
  });

  it('Đạt → Cần bổ sung dùng ReasonDialog (lý do ≥ 5 ký tự) → POST reopen { version, reason }', async () => {
    map['POST /milestones/m4/reopen'] = { milestone: {} };
    open('/de-tai/t1/kanban');
    await screen.findByText('4. Báo cáo cuối');
    const menu = await openMenu('Báo cáo cuối');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Cần bổ sung' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Mở lại mốc “Báo cáo cuối”')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Lý do'), { target: { value: 'Thiếu phụ lục' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mở lại' }));
    await waitFor(() => expect(sent('POST', '/milestones/m4/reopen')).toHaveLength(1));
    expect(sent('POST', '/milestones/m4/reopen')[0][1].body).toEqual({ version: 9, reason: 'Thiếu phụ lục' });
  });

  it.each([
    ['STALE_DOCUMENT', 'Chỉ đánh giá mốc trên bản nộp mới nhất'],
    ['MILESTONE_ALREADY_PASSED', 'Mốc đã Đạt; muốn thay đổi cần mở lại mốc'],
    ['CONCURRENT_UPDATE', 'Dữ liệu vừa được người khác cập nhật, vui lòng tải lại'],
  ])('409 %s → toast thông điệp server, đóng hộp, tải lại, thẻ ở cột cũ', async (code, message) => {
    map['POST /documents/d2/feedbacks'] = apiErr(409, code, message);
    open('/de-tai/t1/kanban');
    await screen.findByText('2. Báo cáo giữa kỳ');
    const before = sent('GET', '/topics/t1/milestones').length;
    const menu = await openMenu('Báo cáo giữa kỳ');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Đạt' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Nhận xét'), { target: { value: 'Đạt' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi đánh giá' }));
    await waitFor(() => expect(toasts()).toContain(message));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(sent('GET', '/topics/t1/milestones').length).toBeGreaterThan(before));
    expect(within(column('Chờ đánh giá')).getByText('2. Báo cáo giữa kỳ')).toBeTruthy();
    expect(screen.queryByText(/^Đã chuyển/)).toBeNull();
  });

  it('lỗi mạng → toast "Mạng gián đoạn, cập nhật thất bại", thẻ ở cột cũ', async () => {
    map['POST /milestones/m4/reopen'] = apiErr(0, 'NETWORK_ERROR', 'Không kết nối được máy chủ.');
    open('/de-tai/t1/kanban');
    await screen.findByText('4. Báo cáo cuối');
    const menu = await openMenu('Báo cáo cuối');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Cần bổ sung' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Lý do'), { target: { value: 'Thiếu phụ lục' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mở lại' }));
    await waitFor(() => expect(toasts()).toContain('Mạng gián đoạn, cập nhật thất bại'));
    expect(within(column('Đạt')).getByText('4. Báo cáo cuối')).toBeTruthy();
    // hộp vẫn mở, giữ lý do đã gõ để gửi lại (MINOR reviewer DC-17)
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(within(screen.getByRole('dialog')).getByLabelText('Lý do').value).toBe('Thiếu phụ lục');
  });
});

describe('tab Mốc nhận neo từ thẻ Kanban', () => {
  it('mỗi mốc có id moc-<id>', async () => {
    open('/de-tai/t1/moc#moc-m2');
    await screen.findByText('2. Báo cáo giữa kỳ');
    expect(document.getElementById('moc-m2')).toBeTruthy();
  });
});
