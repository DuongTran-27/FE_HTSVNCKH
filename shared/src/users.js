// T207a: schema tài khoản (API_GD2 §3.2, §11). `.max()` đứng trước regex/pipe (QD_ZOD §5.1).
import { z } from 'zod';
import { ROLES } from './enums.js';
import { idSchema, catalogCodeSchema, paginationQuery } from './catalog.js';

const roleSchema = z.enum(Object.values(ROLES));
const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email('Email không hợp lệ'));
const fullNameSchema = z.string().trim().min(1).max(300);
const scopeIds = z.array(idSchema).min(1, 'Cần ít nhất một khoa').max(20);

export const userCreateSchema = z
  .object({
    code: catalogCodeSchema,
    email: emailSchema,
    fullName: fullNameSchema,
    role: roleSchema,
    facultyId: idSchema.optional(),
    classId: idSchema.optional(),
    staffFacultyIds: scopeIds.optional(),
  })
  .superRefine((v, ctx) => {
    const add = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (v.role === ROLES.ADMIN) {
      if (v.facultyId) add('facultyId', 'Quản trị viên không thuộc khoa nào');
    } else if (!v.facultyId) add('facultyId', 'Chọn khoa');
    if (v.role === ROLES.STUDENT && !v.classId) add('classId', 'Chọn lớp');
    if (v.role !== ROLES.STUDENT && v.classId) add('classId', 'Chỉ sinh viên mới có lớp');
    if (v.role === ROLES.STAFF && !v.staffFacultyIds) add('staffFacultyIds', 'Cán bộ khoa cần ít nhất một khoa phụ trách');
    if (v.role !== ROLES.STAFF && v.staffFacultyIds) add('staffFacultyIds', 'Chỉ cán bộ khoa mới có phạm vi khoa');
  });

export const userUpdateSchema = z
  .object({
    email: emailSchema.optional(),
    fullName: fullNameSchema.optional(),
    classId: idSchema.optional(),
    facultyId: idSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Cần ít nhất một trường để sửa');

export const staffScopesSchema = z.object({ facultyIds: scopeIds });

export const userListQuerySchema = paginationQuery.extend({
  role: roleSchema.optional(),
  facultyId: idSchema.optional(),
  classId: idSchema.optional(),
  isLocked: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(200).optional(),
});

// T207b: nhập CSV tài khoản (API_GD2 §3.2, QD_ZOD §4.4). Backend và frontend dùng chung để kiểm trước khi upload.
export const USER_IMPORT_HEADERS = Object.freeze(['code', 'email', 'fullName', 'role', 'classCode']);
export const USER_IMPORT_MAX_ROWS = 2000;
export const USER_IMPORT_MAX_BYTES = 1024 * 1024;

// Một dòng CSV (ô trống ở classCode -> không có lớp). Lỗi theo trường để báo `errors[].field`.
export const userImportRowSchema = z
  .object({
    code: catalogCodeSchema,
    email: emailSchema,
    fullName: fullNameSchema,
    role: z.enum([ROLES.STUDENT, ROLES.LECTURER]),
    classCode: z.string().trim().max(64).optional().transform((v) => v || undefined),
  })
  .superRefine((v, ctx) => {
    const add = (message) => ctx.addIssue({ code: 'custom', path: ['classCode'], message });
    if (v.role === ROLES.STUDENT && !v.classCode) add('Sinh viên cần mã lớp');
    if (v.role === ROLES.LECTURER && v.classCode) add('Chỉ sinh viên mới có lớp');
  });

// API_GD7 §10.1 (FR30): số di động VN, chuẩn hóa (bỏ khoảng trắng, dấu chấm, gạch) trước khi so khớp; rỗng/null = xóa.
export const PHONE_REGEX = /^(0|\+84)(3|5|7|8|9)\d{8}$/;
export const profileUpdateSchema = z.strictObject({
  phone: z
    .string({ error: 'Số điện thoại không hợp lệ' })
    .max(40, 'Số điện thoại không hợp lệ')
    .nullable()
    .transform((v) => (v == null ? '' : v.replace(/[\s.-]/g, '')))
    .refine((v) => v === '' || PHONE_REGEX.test(v), 'Số điện thoại không hợp lệ')
    .transform((v) => v || null),
});
