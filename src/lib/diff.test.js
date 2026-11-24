import { describe, expect, it } from 'vitest';
import { wordDiff } from './diff.js';

describe('wordDiff', () => {
  it('giống nhau -> một đoạn same', () => expect(wordDiff('a b', 'a b')).toEqual([{ type: 'same', text: 'a b' }]));
  it('thêm và bớt từ', () => {
    const d = wordDiff('học máy cơ bản', 'học máy nâng cao');
    expect(d.filter((p) => p.type === 'del').map((p) => p.text.trim())).toEqual(['cơ bản']);
    expect(d.filter((p) => p.type === 'add').map((p) => p.text.trim())).toEqual(['nâng cao']);
  });
  it('rỗng -> toàn bộ là thêm', () => expect(wordDiff('', 'x')).toEqual([{ type: 'add', text: 'x' }]));
});

describe('wordDiff khoảng trắng', () => {
  it('đoạn giữ nguyên: text theo bản mới, old theo bản cũ khi khác nhau', () => {
    expect(wordDiff('a  b', 'a b')).toEqual([{ type: 'same', text: 'a b', old: 'a  b' }]);
  });
  it('bản cũ và mới cùng khoảng trắng thì không có old', () => {
    expect(wordDiff('a b c', 'a b d').find((p) => p.type === 'same')).toEqual({ type: 'same', text: 'a b ' });
  });
});
