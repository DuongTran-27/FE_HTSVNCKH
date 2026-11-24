import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

vi.mock('../lib/api.js', () => ({ api: vi.fn() }));
import { api } from '../lib/api.js';
import { auth } from '../lib/auth.js';
import { DashboardPage } from './DashboardPage.jsx';

const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><DashboardPage /></MemoryRouter>
  </QueryClientProvider>,
);
const tile = (name) => screen.getByRole('link', { name: new RegExp(name) });

beforeEach(() => api.mockReset());
afterEach(cleanup);

describe('Tổng quan', () => {
  it('SV: số liệu lấy từ total của API danh sách, ô dẫn tới trang tương ứng', async () => {
    auth.setSession({ accessToken: 'x', user: { id: 'u', role: 'STUDENT', fullName: 'Nguyễn An' } });
    api.mockImplementation(async (url) => ({ items: [], total: String(url).startsWith('/invitations') ? 3 : 1 }));
    mount();
    expect(screen.getByRole('heading', { name: 'Xin chào, Nguyễn An' })).toBeTruthy();
    expect(await screen.findByText('3')).toBeTruthy();
    expect(tile('Lời mời đang chờ').getAttribute('href')).toBe('/loi-moi');
    expect(tile('Cần chỉnh sửa').getAttribute('href')).toBe('/de-tai?status=NEEDS_REVISION');
    expect(screen.queryByText(/Hồ sơ chờ xét duyệt/)).toBeNull();
  });

  it('STAFF: danh sách hồ sơ chờ lâu nhất dẫn tới màn xét duyệt', async () => {
    auth.setSession({ accessToken: 'x', user: { id: 'u', role: 'STAFF', fullName: 'CB' } });
    const t = { id: 't9', code: 'NCKH-2026-0009', title: 'Đề tài chín', status: 'UNDER_REVIEW', updatedAt: '2026-11-01T00:00:00Z' };
    api.mockImplementation(async (url) => (String(url).includes('pageSize=5') ? { items: [t], total: 1 } : { items: [], total: 4 }));
    mount();
    expect((await screen.findByRole('link', { name: /Đề tài chín/ })).getAttribute('href')).toBe('/xet-duyet/t9');
    expect(api.mock.calls.map((c) => c[0])).toContain('/topics?status=UNDER_REVIEW&sort=updatedAt_asc&pageSize=5');
  });

  it('ADMIN chỉ có ô tài khoản và kho, không gọi API nghiệp vụ; lỗi API hiện "Không tải được"', async () => {
    auth.setSession({ accessToken: 'x', user: { id: 'u', role: 'ADMIN', fullName: 'QT' } });
    api.mockImplementation(async (url) => { if (String(url).startsWith('/repository')) throw new Error('x'); return { total: 7 }; });
    mount();
    expect(await screen.findByText('7')).toBeTruthy();
    expect(await screen.findByText('Không tải được')).toBeTruthy();
    expect(api.mock.calls.map((c) => c[0]).sort()).toEqual(['/repository?pageSize=1', '/users?pageSize=1']);
  });
});
