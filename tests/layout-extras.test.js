import { describe, expect, it } from 'vitest';
import { crumbsOf } from '../src/components/Layout.jsx';
import { resolveTheme } from '../src/lib/theme.js';

describe('đường dẫn trang', () => {
  it('mỗi tiền tố khớp một màn trong SCREENS; tiền tố không phải màn bị bỏ', () => {
    expect(crumbsOf('/de-tai/abc/nhom')).toEqual([
      { to: '/de-tai', label: 'Đề tài' }, { to: '/de-tai/abc', label: 'Chi tiết đề tài' }, { to: '/de-tai/abc/nhom', label: 'Nhóm' },
    ]);
    expect(crumbsOf('/de-tai/moi').at(-1).label).toBe('Tạo đề tài'); // không nhầm thành /de-tai/:id
    expect(crumbsOf('/quan-ly/danh-muc/nganh')).toEqual([{ to: '/quan-ly/danh-muc/nganh', label: 'Danh mục ngành' }]);
    expect(crumbsOf('/doi-mat-khau')).toEqual([]);
  });
});

describe('chế độ sáng/tối', () => {
  it('lựa chọn đã lưu thắng hệ điều hành; giá trị lạ thì theo hệ điều hành', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme('xyz', false)).toBe('light');
  });
});
