// T206: schema danh mục và đợt (API_GD2 §1.7, §4, §11).
import { z } from 'zod';
import { DEFAULT_ROUND_CONFIG } from './enums.js';

// Gộp mặc định + ghi đè của đợt; `similarity` gộp sâu, mảng thay hẳn.
export const effectiveRoundConfig = (config) => ({
  ...DEFAULT_ROUND_CONFIG,
  ...(config ?? {}),
  allowedFileTypes: [...(config?.allowedFileTypes ?? DEFAULT_ROUND_CONFIG.allowedFileTypes)],
  similarity: { ...DEFAULT_ROUND_CONFIG.similarity, ...(config?.similarity ?? {}) },
  defenseGrades: { ...DEFAULT_ROUND_CONFIG.defenseGrades, ...(config?.defenseGrades ?? {}) },
});

export const idSchema = z.string().trim().min(1, 'Vui lòng chọn một mục').max(64, 'Mã không hợp lệ');

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const isoDateTime = z
  .string()
  .max(40, 'Thời điểm không hợp lệ')
  .pipe(z.iso.datetime({ offset: true, error: 'Thời điểm phải theo ISO 8601 có múi giờ' }));

export const academicYearSchema = z
  .string()
  .max(9)
  .regex(/^\d{4}-\d{4}$/, 'Năm học dạng 2026-2027')
  .refine((s) => Number(s.slice(5)) === Number(s.slice(0, 4)) + 1, 'Năm sau phải bằng năm trước + 1');

export const catalogCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, 'Mã chỉ gồm chữ, số, . _ -');
export const catalogNameSchema = z.string().trim().min(1).max(300);

export const facultyCreateSchema = z.object({ code: catalogCodeSchema, name: catalogNameSchema });
export const majorCreateSchema = z.object({ facultyId: idSchema, code: catalogCodeSchema, name: catalogNameSchema });
export const classCreateSchema = z.object({ majorId: idSchema, code: catalogCodeSchema });
export const fieldCreateSchema = z.object({ code: catalogCodeSchema, name: catalogNameSchema });
export const catalogUpdateSchema = z
  .object({ name: catalogNameSchema.optional(), isActive: z.boolean().optional() })
  .refine((v) => v.name !== undefined || v.isActive !== undefined, 'Cần ít nhất một trường để sửa');

const synonymTerm = z.string().trim().toLowerCase().min(1).max(60);
export const synonymCreateSchema = z
  .object({ term: synonymTerm, canonical: synonymTerm })
  .refine((v) => v.term !== v.canonical, { error: 'Từ và từ chuẩn phải khác nhau', path: ['canonical'] });

export const catalogListQuerySchema = z.object({
  includeInactive: z.enum(['true', 'false']).default('false'),
  facultyId: idSchema.optional(),
  majorId: idSchema.optional(),
  q: z.string().trim().max(200).optional(),
});

const unit = (min, max) => z.number().int().min(min).max(max);
const ratio = z.number().min(0).max(1);
const similarityShape = {
  titleReview: ratio,
  titleHigh: ratio,
  contentReview: ratio,
  contentHigh: ratio,
  minJustificationWords: unit(0, 500),
};
// GĐ7 §2.4: ngưỡng quy đổi điểm bảo vệ (thang 10)
const grade = z.number().min(0).max(10);
const defenseGradesShape = { excellent: grade, good: grade, pass: grade };
const configShape = {
  minMembers: unit(1, 20),
  maxMembers: unit(1, 20),
  maxActiveTopicsPerStudent: unit(1, 5),
  maxTopicsPerLecturer: unit(1, 50),
  advisorReminderDays: unit(1, 30),
  dueReminderDays: unit(1, 30),
  minSummaryWords: unit(1, 500),
  minKeywords: unit(1, 10),
  maxKeywords: unit(1, 10),
  maxFileSizeMB: unit(1, 10),
  allowedFileTypes: z
    .array(z.enum(['pdf', 'docx', 'pptx', 'xlsx']))
    .min(1)
    .max(4)
    .refine((a) => new Set(a).size === a.length, 'Loại file không được lặp'),
  requireDefense: z.boolean(),
};

const configOrder = (c, ctx) => {
  const bad = (path, message) => ctx.addIssue({ code: 'custom', path, message });
  if (c.minMembers > c.maxMembers) bad(['minMembers'], 'Số thành viên tối thiểu không được lớn hơn tối đa');
  if (c.minKeywords > c.maxKeywords) bad(['minKeywords'], 'Số từ khóa tối thiểu không được lớn hơn tối đa');
  if (c.similarity.titleReview >= c.similarity.titleHigh) {
    bad(['similarity', 'titleReview'], 'Ngưỡng xem xét phải nhỏ hơn ngưỡng cao');
  }
  if (c.similarity.contentReview >= c.similarity.contentHigh) {
    bad(['similarity', 'contentReview'], 'Ngưỡng xem xét phải nhỏ hơn ngưỡng cao');
  }
  const g = c.defenseGrades;
  if (g.pass !== 5) bad(['defenseGrades', 'pass'], 'Ngưỡng Đạt cố định 5,0 theo đề cương');
  if (g.good < g.pass) bad(['defenseGrades', 'good'], 'Ngưỡng Tốt không được nhỏ hơn ngưỡng Đạt');
  if (g.excellent < g.good) bad(['defenseGrades', 'excellent'], 'Ngưỡng Xuất sắc không được nhỏ hơn ngưỡng Tốt');
};

// Đầy đủ (sau khi gộp mặc định)
export const roundConfigSchema = z
  .object({ ...configShape, similarity: z.object(similarityShape), defenseGrades: z.object(defenseGradesShape) })
  .superRefine(configOrder);

// Phần ghi đè của một đợt: mọi khóa tùy chọn, khóa lạ bị từ chối
const optional = (shape) => Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, v.optional()]));
export const roundConfigInputSchema = z.strictObject({
  ...optional(configShape),
  similarity: z.strictObject(optional(similarityShape)).optional(),
  defenseGrades: z.strictObject(optional(defenseGradesShape)).optional(),
});

/** GĐ7 §7.4 (FR37): điểm trung bình bảo vệ (số hoặc chuỗi thập phân) → kết quả theo `defenseGrades` của đợt */
export const gradeFromDefenseScore = (score, grades = DEFAULT_ROUND_CONFIG.defenseGrades) => {
  const x = Number(score);
  if (x >= grades.excellent) return 'EXCELLENT';
  if (x >= grades.good) return 'GOOD';
  if (x >= grades.pass) return 'PASS';
  return 'FAIL';
};

export const ROUND_ORDER_MESSAGE = 'Các mốc phải theo thứ tự: mở đăng ký < đóng đăng ký < hạn xét duyệt < hạn kết thúc';

/** Mốc sai đầu tiên: { field, message } hoặc null. Nhận Date hoặc chuỗi ISO. */
export const checkRoundOrder = (r) => {
  const t = (k) => new Date(r[k]).getTime();
  for (const [a, b] of [
    ['regOpenAt', 'regCloseAt'],
    ['regCloseAt', 'reviewDeadline'],
    ['reviewDeadline', 'endAt'],
  ]) {
    if (!(t(a) < t(b))) return { field: b, message: ROUND_ORDER_MESSAGE };
  }
  return null;
};

/** Kiểm mốc + cấu hình hiệu lực. Trả map trường -> thông điệp ({} nếu hợp lệ). */
export const validateRoundFields = (r) => {
  const out = {};
  const order = checkRoundOrder(r);
  if (order) out[order.field] = order.message;
  const parsed = roundConfigSchema.safeParse(effectiveRoundConfig(r.config));
  if (!parsed.success) {
    for (const i of parsed.error.issues.slice(0, 50)) out[['config', ...i.path].join('.')] ??= i.message;
  }
  return out;
};

const roundFields = {
  name: catalogNameSchema,
  academicYear: academicYearSchema,
  regOpenAt: isoDateTime,
  regCloseAt: isoDateTime,
  reviewDeadline: isoDateTime,
  endAt: isoDateTime,
  config: roundConfigInputSchema,
};
const addRoundIssues = (v, ctx) => {
  for (const [path, message] of Object.entries(validateRoundFields(v))) {
    ctx.addIssue({ code: 'custom', path: path.split('.'), message });
  }
};
export const roundCreateSchema = z
  .object({ facultyId: idSchema, ...roundFields, config: roundConfigInputSchema.optional() })
  .superRefine(addRoundIssues);
// Sửa một phần: service gộp với giá trị hiện tại rồi gọi validateRoundFields
export const roundUpdateSchema = z
  .object(optional(roundFields))
  .refine((v) => Object.keys(v).length > 0, 'Cần ít nhất một trường để sửa');
export const roundListQuerySchema = paginationQuery.extend({
  facultyId: idSchema.optional(),
  academicYear: academicYearSchema.optional(),
});
