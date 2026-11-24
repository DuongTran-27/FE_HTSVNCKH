import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('../../lib/api.js', () => ({ api: vi.fn() }));
vi.mock('../../lib/format.js', async (orig) => ({ ...(await orig()), downloadCsv: vi.fn() }));
vi.mock('../../components/StatsChart.jsx', () => ({ StatsChart: ({ rows }) => <div data-testid="chart">{rows.length}</div> }));
import { api } from '../../lib/api.js';
import { downloadCsv } from '../../lib/format.js';
import { auth } from '../../lib/auth.js';
import { NotificationBell } from '../../components/NotificationBell.jsx';
import { NotificationsPage } from '../NotificationsPage.jsx';
import { StatsPage } from './StatsPage.jsx';

const mount = (ui, url) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[url]}><Routes><Route path="*" element={ui} /></Routes></MemoryRouter>
  </QueryClientProvider>,
);
const calls = () => api.mock.calls.map((c) => c[0]);
const stuck = (over) => ({ id: 't1', code: 'NCKH-1', title: 'Kẹt', status: 'WAITING_ADVISOR', round: { name: 'Đợt 1', registrationOpen: false, regCloseAt: '2026-01-01T00:00:00Z' }, ...over });

beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (url) => {
    if (url.startsWith('/stats')) return { groupBy: 'status', total: 3, rows: [{ key: 'CLOSED', label: 'Đã đóng', count: 2 }, { key: 'REJECTED', label: 'Bị từ chối', count: 1 }] };
    if (url.startsWith('/topics')) return { items: [stuck()], total: 12, page: 1, pageSize: 10 };
    if (url.startsWith('/notifications/unread-count')) return { count: 3 };
    if (url.startsWith('/notifications')) return { items: [{ id: 'n1', type: 'FEEDBACK_CREATED', title: 'GVHD đã nhận xét', link: '/de-tai/t1', readAt: null, createdAt: '2026-01-01T00:00:00Z' }], total: 1, page: 1, pageSize: 20, unreadCount: 1 };
    return { items: [], total: 0, page: 1, pageSize: 20 };
  });
});
afterEach(cleanup);

describe('Chuông thông báo', () => {
  it('hiện số chưa đọc trong aria-label', async () => {
    mount(<NotificationBell />, '/');
    expect(await screen.findByRole('link', { name: 'Thông báo, 3 chưa đọc' })).toBeTruthy();
  });
});

describe('Trang thông báo', () => {
  it('đánh dấu đã đọc một thông báo và tất cả', async () => {
    mount(<NotificationsPage />, '/thong-bao');
    expect(await screen.findByText('GVHD đã nhận xét')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã đọc' }));
    await waitFor(() => expect(calls()).toContain('/notifications/n1/read'));
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }));
    await waitFor(() => expect(calls()).toContain('/notifications/read-all'));
  });
});

describe('Trang thống kê', () => {
  it('STAFF: bảng có caption, widget đề tài kẹt gọi stuck=true phân trang server, hiện total', async () => {
    auth.setSession({ accessToken: 'x', user: { id: 'u', role: 'STAFF' } });
    mount(<StatsPage />, '/thong-ke');
    expect(await screen.findByRole('table', { name: /Số đề tài theo trạng thái/ })).toBeTruthy();
    expect(await screen.findByText('NCKH-1 – Kẹt')).toBeTruthy();
    expect(await screen.findByText('Tổng cộng 12 đề tài kẹt')).toBeTruthy();
    expect(calls().some((c) => c.startsWith('/topics?stuck=true') && c.includes('pageSize=10'))).toBe(true);
    expect(calls().some((c) => c.includes('status='))).toBe(false);
  });

  it('LECTURER: không có widget kẹt, không có bộ lọc GV; CSV dùng cùng query với bảng', async () => {
    auth.setSession({ accessToken: 'x', user: { id: 'u', role: 'LECTURER' } });
    mount(<StatsPage />, '/thong-ke?groupBy=field&status=CLOSED&lecturerId=abc');
    await screen.findByRole('table');
    expect(screen.queryByText('Đề tài kẹt sau khi đóng đăng ký')).toBeNull();
    expect(calls().filter((c) => c.startsWith('/topics'))).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Xuất CSV' }));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalled());
    expect(calls()).toContain('/stats?groupBy=field&status=CLOSED'); // lecturerId bị bỏ với GV
    expect(calls()).toContain('/stats/export.csv?groupBy=field&status=CLOSED');
  });

  it('lỗi tải CSV hiện error.message', async () => {
    auth.setSession({ accessToken: 'x', user: { id: 'u', role: 'LECTURER' } });
    api.mockImplementation(async (url) => {
      if (url.startsWith('/stats/export')) throw new Error('Thao tác quá nhiều lần');
      return { groupBy: 'status', total: 0, rows: [] };
    });
    mount(<StatsPage />, '/thong-ke');
    await screen.findByText('Không có đề tài nào khớp bộ lọc.');
    fireEvent.click(screen.getByRole('button', { name: 'Xuất CSV' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Thao tác quá nhiều lần');
  });
});
