import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const calls = vi.hoisted(() => ({ api: null }));
vi.mock('../src/lib/api.js', () => ({ api: (...a) => calls.api(...a) }));
import { StuckTopics } from '../src/components/StuckTopics.jsx';

const view = (roundId) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><StuckTopics key={roundId} roundId={roundId} /></MemoryRouter>
  </QueryClientProvider>
);

describe('StuckTopics', () => {
  afterEach(cleanup);
  it('đổi roundId thì về trang 1 (B8)', async () => {
    calls.api = vi.fn(async () => ({ items: [{ id: 't', code: 'DT', title: 'x', status: 'PENDING' }], page: 1, pageSize: 10, total: 25 }));
    const { rerender } = render(view('r1'));
    await screen.findByText(/Tổng cộng 25/);
    fireEvent.click(screen.getAllByRole('button', { name: /sau|tiếp|2/i })[0]);
    await waitFor(() => expect(calls.api.mock.calls.some(([p]) => p.includes('page=2'))).toBe(true));
    calls.api.mockClear();
    rerender(view('r2'));
    await waitFor(() => expect(calls.api).toHaveBeenCalled());
    expect(calls.api.mock.calls.every(([p]) => p.includes('roundId=r2') && p.includes('page=1'))).toBe(true);
  });
});
