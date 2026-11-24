// T209: schema hồ sơ dùng chung (nháp/gửi/tạo/sửa) – FR05
import { describe, it, expect } from 'vitest';
import { topicDraftSchema, topicSubmitSchema, topicCreateSchema, topicUpdateSchema, SUMMARY_MAX, KEYWORDS_HARD_MAX } from './schemas.js';

const words = (n) => Array.from({ length: n }, (_, i) => `từ${i}`).join(' ');
const full = { title: 'Hệ thống quản lý NCKH', summary: words(100), objectives: 'Mục tiêu đủ dài hai mươi ký tự', keywords: ['a', 'b', 'c'], fieldId: 'f1' };
const paths = (r) => r.error.issues.map((i) => i.path.join('.'));

describe('topicSubmitSchema (kiểm trường bắt buộc khi gửi)', () => {
  it('đủ trường -> đạt', () => expect(topicSubmitSchema().safeParse(full).success).toBe(true));
  it.each([
    ['title', { title: 'ngắn' }],
    ['summary', { summary: words(99) }],
    ['objectives', { objectives: 'ngắn' }],
    ['keywords', { keywords: ['a', 'b'] }],
    ['fieldId', { fieldId: '' }],
  ])('thiếu/yếu %s -> lỗi đúng trường', (field, patch) => {
    const r = topicSubmitSchema().safeParse({ ...full, ...patch });
    expect(paths(r)).toEqual([field]);
  });
  it('minSummaryWords/maxKeywords theo cấu hình đợt', () => {
    expect(topicSubmitSchema({ minSummaryWords: 10, minKeywords: 1, maxKeywords: 2 }).safeParse({ ...full, summary: words(10), keywords: ['a'] }).success).toBe(true);
    expect(paths(topicSubmitSchema({ minSummaryWords: 10, minKeywords: 1, maxKeywords: 2 }).safeParse({ ...full, keywords: ['a', 'b', 'c'] }))).toEqual(['keywords']);
  });
});

describe('topicDraftSchema / create / update', () => {
  it('trần cứng từ khóa là KEYWORDS_HARD_MAX (không còn 5), summary tối đa SUMMARY_MAX', () => {
    expect(topicDraftSchema.safeParse({ keywords: Array(KEYWORDS_HARD_MAX).fill('a') }).success).toBe(true);
    expect(paths(topicDraftSchema.safeParse({ keywords: Array(KEYWORDS_HARD_MAX + 1).fill('a') }))).toEqual(['keywords']);
    expect(topicDraftSchema.safeParse({ summary: 'a'.repeat(SUMMARY_MAX) }).success).toBe(true);
    expect(topicDraftSchema.safeParse({ summary: 'a'.repeat(SUMMARY_MAX + 1) }).success).toBe(false);
  });
  it('create cần roundId; update cần version nguyên >= 0', () => {
    expect(topicCreateSchema.safeParse({}).success).toBe(false);
    expect(topicCreateSchema.parse({ roundId: 'r1' })).toMatchObject({ roundId: 'r1', title: '', keywords: [] });
    expect(topicUpdateSchema.safeParse({}).success).toBe(false);
    expect(topicUpdateSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(topicUpdateSchema.safeParse({ version: 0 }).success).toBe(true);
  });
});
