import { describe, it, expect } from 'vitest';
import { userCreateSchema, userUpdateSchema, staffScopesSchema, userListQuerySchema, profileUpdateSchema } from './users.js';

const base = { code: 'SV001', email: ' SV001@St.edu.vn ', fullName: ' Nguyễn Văn A ', role: 'STUDENT', facultyId: 'f1', classId: 'c1' };
const issues = (v) => userCreateSchema.safeParse(v).error?.issues.map((i) => i.path[0]);

describe('userCreateSchema', () => {
  it('chuẩn hóa email (trim, chữ thường) và tên', () => {
    const r = userCreateSchema.parse(base);
    expect(r.email).toBe('sv001@st.edu.vn');
    expect(r.fullName).toBe('Nguyễn Văn A');
  });
  it.each([
    [{ classId: undefined }, 'classId'],
    [{ role: 'LECTURER' }, 'classId'],
    [{ facultyId: undefined }, 'facultyId'],
    [{ role: 'STAFF', classId: undefined }, 'staffFacultyIds'],
    [{ staffFacultyIds: ['f1'] }, 'staffFacultyIds'],
    [{ role: 'ADMIN', classId: undefined }, 'facultyId'],
    [{ code: 'có dấu' }, 'code'],
    [{ email: 'khong-phai-email' }, 'email'],
    [{ role: 'SUPERUSER' }, 'role'],
    [{ fullName: 'x'.repeat(301) }, 'fullName'],
  ])('từ chối %j', (patch, field) => {
    expect(issues({ ...base, ...patch })).toContain(field);
  });
  it('STAFF cần ít nhất một khoa; ADMIN không cần khoa', () => {
    expect(userCreateSchema.safeParse({ ...base, role: 'STAFF', classId: undefined, staffFacultyIds: ['f1'] }).success).toBe(true);
    expect(userCreateSchema.safeParse({ ...base, role: 'STAFF', classId: undefined, staffFacultyIds: [] }).success).toBe(false);
    expect(userCreateSchema.safeParse({ code: 'QT1', email: 'a@b.vn', fullName: 'A', role: 'ADMIN' }).success).toBe(true);
  });
});

describe('schema khác', () => {
  it('userUpdateSchema cần ít nhất một trường và bỏ role/code/password', () => {
    expect(userUpdateSchema.safeParse({}).success).toBe(false);
    expect(userUpdateSchema.parse({ fullName: 'B', role: 'ADMIN', code: 'X', password: 'p' })).toEqual({ fullName: 'B' });
  });
  it('staffScopesSchema 1..20 khoa', () => {
    expect(staffScopesSchema.safeParse({ facultyIds: [] }).success).toBe(false);
    expect(staffScopesSchema.safeParse({ facultyIds: Array.from({ length: 21 }, (_, i) => `f${i}`) }).success).toBe(false);
    expect(staffScopesSchema.safeParse({ facultyIds: ['f1'] }).success).toBe(true);
  });
  it('userListQuerySchema ép trang, từ chối isLocked lạ và q quá dài', () => {
    expect(userListQuerySchema.parse({ page: '2', isLocked: 'true' })).toMatchObject({ page: 2, pageSize: 20, isLocked: 'true' });
    expect(userListQuerySchema.safeParse({ isLocked: 'yes' }).success).toBe(false);
    expect(userListQuerySchema.safeParse({ q: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('profileUpdateSchema (FR30, API_GD7 §10.1)', () => {
  const ok = (phone) => profileUpdateSchema.safeParse({ phone });
  it.each([['0912345678', '0912345678'], [' 091 234-5678 ', '0912345678'], ['+84.912.345.678', '+84912345678'], ['0351234567', '0351234567']])(
    'chuẩn hóa %s', (input, out) => expect(ok(input).data.phone).toBe(out));
  it.each([[null], [''], ['  ']])('%j = xóa số', (v) => expect(ok(v).data.phone).toBeNull());
  it.each([['0212345678'], ['091234567'], ['09123456789'], ['abc'], ['84912345678'], ['0912 345 67a']])('từ chối %s', (v) => {
    const r = ok(v);
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe('Số điện thoại không hợp lệ');
  });
  it('strict: trường lạ, thiếu phone, sai kiểu bị từ chối', () => {
    expect(profileUpdateSchema.safeParse({ phone: null, role: 'ADMIN' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({}).success).toBe(false);
    expect(ok(912345678).success).toBe(false);
  });
});
