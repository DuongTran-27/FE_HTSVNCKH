import { describe, expect, it } from 'vitest';
import { qs, searchTerm } from './format.js';

describe('searchTerm (BUG-011)', () => {
  it('chỉ gửi q khi đủ 2 ký tự sau trim', () => {
    expect(searchTerm('')).toBeUndefined();
    expect(searchTerm('a')).toBeUndefined();
    expect(searchTerm(' a ')).toBeUndefined();
    expect(searchTerm(' ab ')).toBe('ab');
    expect(qs({ q: searchTerm('a'), page: 1 })).toBe('?page=1');
  });
});
