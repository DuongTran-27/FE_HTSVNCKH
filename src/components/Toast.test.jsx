import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ToastViewport } from './Toast.jsx';
import { toast, toastStore } from '../lib/toast.js';

afterEach(cleanup);

it('Toast có nút hành động (503 → "Thử lại", UI §7): bấm gọi onClick và đóng toast', () => {
  const onClick = vi.fn();
  render(<ToastViewport />);
  act(() => { toast('Hệ thống đang bận, vui lòng thử lại', { type: 'error', action: { label: 'Thử lại', onClick } }); });
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Hệ thống đang bận, vui lòng thử lại')).toBeNull();
  expect(toastStore.get()).toHaveLength(0);
});
