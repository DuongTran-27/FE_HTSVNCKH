// T215 – schema dùng chung trên zod 4 (QD_ZOD §2, §5, §6)
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { topicDraftSchema, topicSubmitSchema, loginSchema, changePasswordSchema, documentLinkSchema, nextPathSchema } from './index.js';

const validTopic = {
  title: 'Hệ thống quản lý đề tài NCKH',
  summary: Array.from({ length: 120 }, (_, i) => `tu${i}`).join(' '),
  objectives: 'Xây dựng website quản lý toàn bộ quy trình',
  keywords: ['web', 'nckh', 'quản lý'],
  fieldId: 'f1',
};

describe('Schema zod 4 (T215)', () => {
  it('mảng vượt .max() bị cắt sớm: refine phần tử chạy 0 lần (GHSA-mrhx-c7xc-m3w5)', () => {
    const spy = vi.fn(() => true);
    const r = z.array(z.string().refine(spy)).max(2).safeParse(new Array(10_000).fill('a'));
    expect(r.success).toBe(false);
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it('keywords 5.000 phần tử chỉ sinh lỗi giới hạn mảng (nháp và gửi)', () => {
    const keywords = new Array(5000).fill('a');
    for (const schema of [topicDraftSchema, topicSubmitSchema()]) {
      const r = schema.safeParse({ ...validTopic, keywords });
      expect(r.success).toBe(false);
      expect(r.error.issues).toHaveLength(1);
      expect(r.error.issues[0].path).toEqual(['keywords']);
    }
  });

  it('summary 5001 ký tự → đúng 1 issue, countWords không chạy (abort)', () => {
    const r = topicSubmitSchema().safeParse({ ...validTopic, summary: 'a'.repeat(5001) });
    expect(r.success).toBe(false);
    expect(r.error.issues).toHaveLength(1);
    expect(r.error.issues[0].message).toBe('Tóm tắt tối đa 5000 ký tự');
  });

  it('summary đủ dài nhưng ít từ vẫn bị refine bắt', () => {
    const r = topicSubmitSchema().safeParse({ ...validTopic, summary: 'a b' });
    expect(r.error.issues.map((i) => i.message)).toEqual(['Tóm tắt tối thiểu 100 từ']);
  });

  it('thiếu fieldId → "Chọn lĩnh vực" (bỏ required_error)', () => {
    const { fieldId: _omit, ...rest } = validTopic;
    const r = topicSubmitSchema().safeParse(rest);
    expect(r.error.issues).toHaveLength(1);
    expect(r.error.issues[0]).toMatchObject({ path: ['fieldId'], message: 'Chọn lĩnh vực' });
  });

  it('hồ sơ hợp lệ vẫn qua, nháp rỗng nhận giá trị mặc định', () => {
    expect(topicSubmitSchema().safeParse(validTopic).success).toBe(true);
    expect(topicDraftSchema.parse({})).toEqual({ title: '', summary: '', objectives: '', keywords: [] });
  });

  it.each([
    ['loginSchema.identifier', loginSchema, { identifier: 'a'.repeat(301), password: 'x' }, 'identifier'],
    ['loginSchema.password', loginSchema, { identifier: 'SV001', password: 'a'.repeat(129) }, 'password'],
    ['changePasswordSchema.currentPassword', changePasswordSchema, { currentPassword: 'a'.repeat(129), newPassword: 'Moi12345' }, 'currentPassword'],
    ['changePasswordSchema.newPassword', changePasswordSchema, { currentPassword: 'x', newPassword: `A1${'a'.repeat(127)}` }, 'newPassword'],
    ['topicSubmitSchema.objectives', topicSubmitSchema(), { ...validTopic, objectives: 'a'.repeat(3001) }, 'objectives'],
    ['topicSubmitSchema.keywords[i]', topicSubmitSchema(), { ...validTopic, keywords: ['web', 'nckh', 'a'.repeat(61)] }, 'keywords.2'],
    ['topicSubmitSchema.fieldId', topicSubmitSchema(), { ...validTopic, fieldId: 'a'.repeat(65) }, 'fieldId'],
    ['topicDraftSchema.fieldId', topicDraftSchema, { fieldId: 'a'.repeat(65) }, 'fieldId'],
  ])('%s vượt .max() bị từ chối (QD_ZOD §5)', (_name, schema, input, path) => {
    const r = schema.safeParse(input);
    expect(r.success).toBe(false);
    expect(r.error.issues.map((i) => i.path.join('.'))).toContain(path);
  });

  it('đúng mức .max() vẫn hợp lệ (biên)', () => {
    expect(loginSchema.safeParse({ identifier: 'a'.repeat(300), password: 'a'.repeat(128) }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: `A1${'a'.repeat(126)}` }).success).toBe(true);
  });

  it('thông điệp mặc định tiếng Việt (z.locales.vi)', () => {
    const r = loginSchema.safeParse({ identifier: 'SV001', password: 1 });
    expect(r.error.issues[0].message).toBe('Đầu vào không hợp lệ: mong đợi string, nhận được số');
  });
});

describe('documentLinkSchema (T406)', () => {
  it('URL không hợp lệ trả lỗi kiểm tra, không ném TypeError', () => {
    for (const url of ['', 'abc']) {
      const r = documentLinkSchema.safeParse({ stage: 'PROPOSAL', title: 'Mã nguồn', url });
      expect(r.success).toBe(false);
      expect(r.error.issues.map((i) => i.path.join('.'))).toEqual(['url']);
    }
    expect(documentLinkSchema.safeParse({ stage: 'PROPOSAL', title: 'a', url: 'https://u:p@x.com' }).success).toBe(false);
    expect(documentLinkSchema.safeParse({ stage: 'PROPOSAL', title: 'a', url: 'https://x.com' }).success).toBe(true);
  });
});

// TASK-DC-12 (m3 BM DC-03): một quy tắc `next` cho API (start SSO) và web (đăng nhập, /dang-nhap/google)
describe('nextPathSchema', () => {
  it.each(['/de-tai', '/de-tai?x=1&y=2', `/${'a'.repeat(511)}`])('nhận %s', (v) => expect(nextPathSchema.safeParse(v).success).toBe(true));
  it.each(['//evil.com', '/\\evil.com', 'https://evil.com', 'de-tai', '', '/\t/evil.com', '/\n/x', '/\u007f', `/${'a'.repeat(512)}`, ['/a'], null, undefined])('từ chối %j', (v) => {
    expect(nextPathSchema.safeParse(v).success).toBe(false);
  });
});
