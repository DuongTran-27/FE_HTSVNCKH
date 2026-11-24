import { describe, expect, it } from 'vitest';
import { pickEnum, pickPage, pickYear, withParam } from './urlParams.js';

describe('urlParams', () => {
  it('đổi bộ lọc thì bỏ page; đổi page thì giữ bộ lọc', () => {
    expect(withParam('status=DRAFT&page=3', 'q', 'abc').toString()).toBe('status=DRAFT&q=abc');
    expect(withParam('status=DRAFT', 'page', '2').toString()).toBe('status=DRAFT&page=2');
  });
  it('giá trị rỗng xóa khóa', () => expect(withParam('q=a&page=2', 'q', '').toString()).toBe(''));
  it('giá trị không hợp lệ trên URL bị bỏ qua', () => {
    expect(pickEnum('XYZ', ['A', 'B'])).toBe('');
    expect(pickEnum('A', ['A', 'B'])).toBe('A');
    expect(pickYear('2026-2027')).toBe('2026-2027');
    expect(pickYear('abc')).toBe('');
    expect([pickPage('0'), pickPage('-1'), pickPage('x'), pickPage('1.5'), pickPage(null), pickPage('4')]).toEqual([1, 1, 1, 1, 1, 4]);
  });
});
