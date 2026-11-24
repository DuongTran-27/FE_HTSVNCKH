import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  ACTION_LABEL,
  ROLE_LABEL,
  REQUEST_STATUS,
  REQUEST_STATUS_LABEL,
  SIMILARITY_LEVEL_LABEL,
  SIMILARITY_LEVEL,
  ROLES,
  DEFAULT_ROUND_CONFIG,
  effectiveRoundConfig,
  roundCreateSchema,
  roundUpdateSchema,
  validateRoundFields,
  roundConfigInputSchema,
  catalogUpdateSchema,
  synonymCreateSchema,
  academicYearSchema,
  catalogCodeSchema,
  isoDateTime,
} from './index.js';

const dates = {
  regOpenAt: '2026-11-01T00:00:00+07:00',
  regCloseAt: '2026-12-01T00:00:00+07:00',
  reviewDeadline: '2027-01-01T00:00:00+07:00',
  endAt: '2027-06-30T00:00:00+07:00',
};
const base = { facultyId: 'f1', name: 'Đợt 1', academicYear: '2026-2027', ...dates };

describe('nhãn enum (API_GD2 §11)', () => {
  it('ACTION_LABEL có khóa đúng bằng TRANSITIONS[].action', () => {
    expect(Object.keys(ACTION_LABEL).sort()).toEqual(TRANSITIONS.map((t) => t.action).sort());
  });
  it('mỗi enum có đủ nhãn', () => {
    expect(Object.keys(ROLE_LABEL).sort()).toEqual(Object.values(ROLES).sort());
    expect(Object.keys(REQUEST_STATUS_LABEL).sort()).toEqual(Object.values(REQUEST_STATUS).sort());
    expect(Object.keys(SIMILARITY_LEVEL_LABEL).sort()).toEqual(Object.values(SIMILARITY_LEVEL).sort());
  });
});

describe('effectiveRoundConfig', () => {
  it('gộp sâu similarity, mảng thay hẳn, không sửa DEFAULT', () => {
    const c = effectiveRoundConfig({
      maxTopicsPerLecturer: 6,
      similarity: { titleHigh: 0.8 },
      allowedFileTypes: ['pdf'],
    });
    expect(c).toMatchObject({ maxTopicsPerLecturer: 6, minMembers: 1, allowedFileTypes: ['pdf'] });
    expect(c.similarity).toEqual({ ...DEFAULT_ROUND_CONFIG.similarity, titleHigh: 0.8 });
    expect(DEFAULT_ROUND_CONFIG.similarity.titleHigh).toBe(0.7);
    expect(effectiveRoundConfig(null)).toEqual(DEFAULT_ROUND_CONFIG);
  });
});

describe('schema đợt', () => {
  it('hợp lệ', () => expect(roundCreateSchema.safeParse(base).success).toBe(true));
  it.each([
    ['regCloseAt', { regCloseAt: dates.regOpenAt }],
    ['reviewDeadline', { reviewDeadline: dates.regCloseAt }],
    ['endAt', { endAt: dates.reviewDeadline }],
  ])('mốc sai thứ tự báo tại %s', (field, over) => {
    const r = roundCreateSchema.safeParse({ ...base, ...over });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].path).toEqual([field]);
    expect(r.error.issues[0].message).toMatch(/theo thứ tự/);
  });
  it('mốc không có múi giờ hoặc quá dài bị từ chối', () => {
    expect(isoDateTime.safeParse('2026-11-01T00:00:00').success).toBe(false);
    expect(isoDateTime.safeParse('x'.repeat(41)).success).toBe(false);
  });
  it('cấu hình hiệu lực phải hợp lệ: min > max, ngưỡng đảo, khóa lạ, vượt trần', () => {
    expect(
      validateRoundFields({ ...base, config: { minMembers: 4, maxMembers: 2 } })['config.minMembers'],
    ).toBeTruthy();
    expect(
      validateRoundFields({ ...base, config: { similarity: { titleReview: 0.9 } } })['config.similarity.titleReview'],
    ).toBeTruthy();
    expect(roundCreateSchema.safeParse({ ...base, config: { lạ: 1 } }).success).toBe(false);
    expect(roundConfigInputSchema.safeParse({ maxFileSizeMB: 11 }).success).toBe(false);
    expect(roundConfigInputSchema.safeParse({ allowedFileTypes: ['pdf', 'pdf'] }).success).toBe(false);
  });
  it('update cần ít nhất một trường; academicYear liên tiếp', () => {
    expect(roundUpdateSchema.safeParse({}).success).toBe(false);
    expect(roundUpdateSchema.safeParse({ name: 'x' }).success).toBe(true);
    expect(academicYearSchema.safeParse('2026-2028').success).toBe(false);
  });
});

describe('schema danh mục', () => {
  it('mã, sửa, từ đồng nghĩa', () => {
    expect(catalogCodeSchema.safeParse('CNTT 1').success).toBe(false);
    expect(catalogCodeSchema.safeParse('CNTT.1-a_b').success).toBe(true);
    expect(catalogUpdateSchema.safeParse({}).success).toBe(false);
    expect(catalogUpdateSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(synonymCreateSchema.parse({ term: ' AI ', canonical: 'Trí tuệ nhân tạo' })).toEqual({
      term: 'ai',
      canonical: 'trí tuệ nhân tạo',
    });
    expect(synonymCreateSchema.safeParse({ term: 'a', canonical: 'A' }).success).toBe(false);
  });
});
