// TASK-DC-18: nút "Xuất Excel" ở /thong-ke (UI §12.11, FR39) – cùng chuỗi query với bảng/CSV, lỗi server → toast
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('../../lib/api.js', () => ({ api: vi.fn() }));
vi.mock('../../lib/format.js', async (orig) => ({ ...(await orig()), downloadBlob: vi.fn() }));
vi.mock('../../components/StatsChart.jsx', () => ({ StatsChart: () => <div /> }));
import { api } from '../../lib/api.js';
import { downloadBlob } from '../../lib/format.js';
import { auth } from '../../lib/auth.js';
import { clearToasts, toastStore } from '../../lib/toast.js';
import { StatsPage } from './StatsPage.jsx';

const mount = (url) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[url]}><Routes><Route path="*" element={<StatsPage />} /></Routes></MemoryRouter>
  </QueryClientProvider>,
);
let exportResult;
beforeEach(() => {
  auth.setSession({ accessToken: 'x', user: { id: 'u', role: 'LECTURER' } });
  api.mockReset();
  api.mockImplementation(async (url) => {
    if (url.startsWith('/stats/export.xlsx')) { if (exportResult instanceof Error) throw exportResult; return exportResult; }
    if (url.startsWith('/stats')) return { groupBy: 'field', total: 0, rows: [] };
    return { items: [], total: 0, page: 1, pageSize: 20 };
  });
});
afterEach(() => { cleanup(); clearToasts(); });

describe('Xuất Excel', () => {
  it('gọi export.xlsx cùng query với bảng, tải blob tên .xlsx, nút "Đang xuất…" khi chờ', async () => {
    let release;
    exportResult = new Promise((r) => { release = r; });
    mount('/thong-ke?groupBy=field&status=CLOSED');
    await screen.findByText('Không có đề tài nào khớp bộ lọc.');
    fireEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));
    const busy = await screen.findByRole('button', { name: 'Đang xuất…' });
    expect(busy.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Xuất CSV' }).disabled).toBe(true);
    const blob = new Blob(['x']);
    release(blob);
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    expect(api.mock.calls.map((c) => c[0])).toContain('/stats/export.xlsx?groupBy=field&status=CLOSED');
    const [sentBlob, name] = downloadBlob.mock.calls[0];
    expect(sentBlob).toBe(blob);
    expect(name).toMatch(/^thong-ke-field-\d{8}\.xlsx$/);
  });

  it('VALIDATION_ERROR (quá 5.000 đề tài) → toast thông điệp server', async () => {
    exportResult = Object.assign(new Error('Quá 5.000 đề tài, hãy thu hẹp bộ lọc'), { status: 400, code: 'VALIDATION_ERROR' });
    mount('/thong-ke');
    await screen.findByText('Không có đề tài nào khớp bộ lọc.');
    fireEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));
    await waitFor(() => expect(toastStore.get().map((t) => t.message)).toContain('Quá 5.000 đề tài, hãy thu hẹp bộ lọc'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
