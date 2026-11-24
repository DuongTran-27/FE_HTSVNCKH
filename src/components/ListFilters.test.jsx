import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DebouncedInput } from './ListFilters.jsx';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('ô tìm kiếm chỉ gọi onCommit sau 400 ms, đã cắt khoảng trắng', () => {
  const onCommit = vi.fn();
  render(<DebouncedInput label="Tìm kiếm" value="" onCommit={onCommit} />);
  const input = screen.getByLabelText('Tìm kiếm');
  fireEvent.change(input, { target: { value: ' ab ' } });
  fireEvent.change(input, { target: { value: ' abc ' } });
  act(() => vi.advanceTimersByTime(399));
  expect(onCommit).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(onCommit).toHaveBeenCalledWith('abc');
});

it('URL đổi từ ngoài (Xóa bộ lọc) thì ô nhập được xóa theo', () => {
  const { rerender } = render(<DebouncedInput label="Tìm kiếm" value="abc" onCommit={() => {}} />);
  expect(screen.getByLabelText('Tìm kiếm').value).toBe('abc');
  rerender(<DebouncedInput label="Tìm kiếm" value="" onCommit={() => {}} />);
  expect(screen.getByLabelText('Tìm kiếm').value).toBe('');
});
