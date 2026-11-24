import { describe, expect, it, vi } from 'vitest';
import { applyServerErrors } from './forms.js';
import { ApiError } from './api.js';

const fields = ['title', 'summary', 'keywords', 'fieldId'];

describe('applyServerErrors', () => {
  it('gắn lỗi theo trường (kể cả đường dẫn chấm), focus ô đầu theo thứ tự form, khóa lạ/_ → lỗi cấp form', () => {
    const setError = vi.fn();
    const error = new ApiError({
      status: 400, code: 'VALIDATION_ERROR', message: 'Dữ liệu không hợp lệ',
      details: { fieldId: 'Chọn lĩnh vực', 'keywords.2': 'Từ khóa quá dài', _: 'Lỗi chung', other: 'Lỗi lạ', title: 'Tên quá ngắn' },
    });
    const formErrors = applyServerErrors(error, setError, fields);
    expect(formErrors).toEqual(['Lỗi chung', 'Lỗi lạ']);
    expect(setError.mock.calls).toEqual([
      ['title', { type: 'server', message: 'Tên quá ngắn' }, { shouldFocus: true }],
      ['keywords.2', { type: 'server', message: 'Từ khóa quá dài' }, { shouldFocus: false }],
      ['fieldId', { type: 'server', message: 'Chọn lĩnh vực' }, { shouldFocus: false }],
    ]);
  });

  it('không nhầm tiền tố: "titleX" không khớp "title"', () => {
    const setError = vi.fn();
    const out = applyServerErrors({ code: 'DUPLICATE', message: 'x', details: { titleX: 'Đã tồn tại' } }, setError, ['title']);
    expect(setError).not.toHaveBeenCalled();
    expect(out).toEqual(['Đã tồn tại']);
  });

  it('DUPLICATE và TOPIC_INCOMPLETE cũng là map trường', () => {
    const setError = vi.fn();
    expect(applyServerErrors({ code: 'DUPLICATE', message: 'x', details: { email: 'Đã tồn tại' } }, setError, ['code', 'email'])).toEqual([]);
    expect(applyServerErrors({ code: 'TOPIC_INCOMPLETE', message: 'x', details: { summary: 'Thiếu' } }, setError, fields)).toEqual([]);
    expect(setError).toHaveBeenCalledTimes(2);
  });

  it('mã không có map trường (details dạng riêng hoặc không có) → chỉ thông điệp cấp form', () => {
    const setError = vi.fn();
    expect(applyServerErrors({ code: 'STUDENT_TOPIC_LIMIT', message: 'Đã đạt giới hạn', details: { codes: ['SV1'] } }, setError, ['codes']))
      .toEqual(['Đã đạt giới hạn']);
    expect(applyServerErrors({ code: 'FORBIDDEN', message: 'Không có quyền' }, setError, fields)).toEqual(['Không có quyền']);
    expect(applyServerErrors({ code: 'VALIDATION_ERROR', message: 'Dữ liệu không hợp lệ', details: {} }, setError, fields))
      .toEqual(['Dữ liệu không hợp lệ']);
    expect(setError).not.toHaveBeenCalled();
  });
});
