import { describe, it, expect } from 'vitest';
import { parseCsv, toCsv, USER_IMPORT_HEADERS, USER_IMPORT_MAX_ROWS, USER_IMPORT_MAX_BYTES, userImportRowSchema } from './index.js';

describe('parseCsv', () => {
  it('đọc CRLF/LF, ô có ngoặc kép, dấu phẩy, xuống dòng, "" và bỏ dòng trống', () => {
    expect(parseCsv('a,b\r\n"x, y","l1\nl2"\n\n"q""r",\n')).toEqual([['a', 'b'], ['x, y', 'l1\nl2'], ['q"r', '']]);
  });
  it('không có xuống dòng cuối vẫn đọc dòng cuối', () => expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]));
  it('ném lỗi khi ngoặc kép không đóng', () => expect(() => parseCsv('a,"b\n1')).toThrow());
  it('đọc lại được kết quả toCsv (bỏ BOM), kể cả ô bị tiền tố chống injection', () => {
    const csv = toCsv([{ a: 'x,"y"', b: '=1' }], [{ key: 'a', header: 'A' }, { key: 'b', header: 'B' }]);
    expect(parseCsv(csv.slice(1))).toEqual([['A', 'B'], ['x,"y"', "'=1"]]);
  });
});

describe('hằng và schema nhập CSV', () => {
  it('hằng đúng hợp đồng', () => {
    expect(USER_IMPORT_HEADERS).toEqual(['code', 'email', 'fullName', 'role', 'classCode']);
    expect([USER_IMPORT_MAX_ROWS, USER_IMPORT_MAX_BYTES]).toEqual([2000, 1048576]);
  });
  const ok = { code: 'SV1', email: ' A@B.vn ', fullName: ' A ', role: 'STUDENT', classCode: 'L1' };
  it('chuẩn hóa dòng hợp lệ; classCode trống thành undefined', () => {
    expect(userImportRowSchema.parse(ok)).toEqual({ code: 'SV1', email: 'a@b.vn', fullName: 'A', role: 'STUDENT', classCode: 'L1' });
    expect(userImportRowSchema.parse({ ...ok, role: 'LECTURER', classCode: ' ' }).classCode).toBeUndefined();
  });
  it.each([
    [{ classCode: '' }, 'classCode'],
    [{ role: 'LECTURER' }, 'classCode'],
    [{ role: 'ADMIN' }, 'role'],
    [{ role: 'STAFF' }, 'role'],
    [{ code: 'có dấu' }, 'code'],
    [{ email: 'x' }, 'email'],
  ])('từ chối %j', (patch, field) => {
    expect(userImportRowSchema.safeParse({ ...ok, ...patch }).error.issues.map((i) => i.path[0])).toContain(field);
  });
});
