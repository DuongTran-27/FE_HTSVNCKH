// Bảo mật T302: `next` chứa ký tự điều khiển (tab/xuống dòng) – trình duyệt bỏ khi phân tích URL nên '/\t/evil.com' thành '//evil.com'
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from '../../src/pages/LoginPage.jsx';
import { safeNext } from '../../src/lib/nav.js';
import { auth } from '../../src/lib/auth.js';

beforeEach(() => { auth.clear(); vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ accessToken: 't', user: { id: 'u', role: 'STUDENT', mustChangePassword: false } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(['/\t/evil.com', '/\n/evil.com', '/\r/evil.com'])('safeNext(%j) phải bị chặn', (n) => {
  expect(safeNext(n)).toBeNull();
});

it('đăng nhập với next=/%09/evil.com vẫn ở cùng origin và về trang chủ vai trò', async () => {
  window.history.replaceState(null, '', '/dang-nhap?next=%2F%09%2Fevil.com');
  const router = createBrowserRouter([{ path: '/dang-nhap', element: <LoginPage /> }, { path: '*', element: <p>khac</p> }]);
  const client = new QueryClient();
  client.setQueryData(['auth-providers'], { google: false }); // DC-12: SSO tắt, fetch giả chỉ phục vụ đăng nhập
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText('Mã hoặc email'), { target: { value: 'SV22001' } });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'x' } });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
  await waitFor(() => expect(window.location.pathname).toBe('/de-tai'));
});
