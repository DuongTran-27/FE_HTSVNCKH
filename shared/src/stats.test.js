import { describe, it, expect } from 'vitest';
import { statsQuerySchema, formatVnDate, STATS_GROUP_BY, STATS_DIMENSION_LABEL } from './index.js';

describe('statsQuerySchema (FR14)', () => {
  it('groupBy bắt buộc, thuộc danh sách trắng', () => {
    expect(statsQuerySchema.safeParse({}).success).toBe(false);
    expect(statsQuerySchema.safeParse({ groupBy: 't.id' }).success).toBe(false);
    for (const g of STATS_GROUP_BY) expect(statsQuerySchema.safeParse({ groupBy: g }).success).toBe(true);
  });
  it('status không nhận DRAFT; khóa lặp (mảng) bị từ chối; chuỗi rỗng = không lọc', () => {
    expect(statsQuerySchema.safeParse({ groupBy: 'status', status: 'DRAFT' }).success).toBe(false);
    expect(statsQuerySchema.safeParse({ groupBy: 'status', roundId: ['a', 'b'] }).success).toBe(false);
    expect(statsQuerySchema.parse({ groupBy: 'status', fieldId: '' }).fieldId).toBeUndefined();
    expect(statsQuerySchema.safeParse({ groupBy: 'status', facultyId: 'x'.repeat(65) }).success).toBe(false);
  });
  it('mỗi chiều có tên cột tiếng Việt', () => {
    expect(Object.keys(STATS_DIMENSION_LABEL).sort()).toEqual([...STATS_GROUP_BY].sort());
  });
});

describe('formatVnDate', () => {
  it('theo giờ Asia/Ho_Chi_Minh (UTC+7)', () => {
    expect(formatVnDate(new Date('2026-12-31T16:59:59Z'))).toBe('20261231');
    expect(formatVnDate(new Date('2026-12-31T17:00:00Z'))).toBe('20270101');
  });
});
