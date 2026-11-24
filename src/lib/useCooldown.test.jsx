import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { formatRetryAfter, useCooldown } from './useCooldown.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useCooldown', () => {
  it('khởi đầu không khóa; start(n) khóa n giây rồi tự mở', () => {
    const { result } = renderHook(() => useCooldown());
    expect(result.current.active).toBe(false);
    act(() => result.current.start(90));
    expect(result.current).toMatchObject({ active: true, remaining: 90, message: 'Vui lòng thử lại sau 2 phút' });
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current).toMatchObject({ active: true, remaining: 60, message: 'Vui lòng thử lại sau 1 phút' });
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current).toMatchObject({ active: false, remaining: 0, message: '' });
  });

  it('bỏ qua retryAfter rỗng/không hợp lệ (không có header)', () => {
    const { result } = renderHook(() => useCooldown());
    act(() => result.current.start(null));
    act(() => result.current.start(0));
    expect(result.current.active).toBe(false);
  });

  it('hai lần 429 liên tiếp cùng số giây vẫn khóa lại', () => {
    const { result } = renderHook(() => useCooldown());
    act(() => result.current.start(5));
    act(() => vi.advanceTimersByTime(6000));
    expect(result.current.active).toBe(false);
    act(() => result.current.start(5));
    expect(result.current.active).toBe(true);
  });

  it('formatRetryAfter làm tròn lên phút, tối thiểu 1', () => {
    expect(formatRetryAfter(1)).toBe('Vui lòng thử lại sau 1 phút');
    expect(formatRetryAfter(900)).toBe('Vui lòng thử lại sau 15 phút');
    expect(formatRetryAfter(901)).toBe('Vui lòng thử lại sau 16 phút');
  });
});
