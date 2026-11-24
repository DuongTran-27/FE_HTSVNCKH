// TASK-DC-07 (FR34, FR37 – API_GD7 §2.4, §5.1, §11): scoreSchema, gradeFromDefenseScore, cấu hình đợt hội đồng, nhánh action.
import { describe, it, expect } from 'vitest';
import { scoreSchema, gradeFromDefenseScore, DEFAULT_ROUND_CONFIG, effectiveRoundConfig, roundConfigSchema, roundConfigInputSchema, validateRoundFields, topicActionSchema, NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABEL, COUNCIL_ROLE_LABEL, DEFENSE_DECISION_LABEL, RESULT_SOURCE_LABEL } from './index.js';

describe('scoreSchema (GD7 §11)', () => {
  it('nhận 0..10, tối đa 2 chữ số thập phân', () => {
    for (const x of [0, 5, 7.25, 0.29, 4.99, 9.99, 10, 8.1]) expect(scoreSchema.safeParse(x).success, String(x)).toBe(true);
  });
  it('từ chối 10.001, 5.555, -0.01, 11, chuỗi, NaN, Infinity, null với thông điệp tiếng Việt', () => {
    for (const x of [10.001, 5.555, -0.01, 11, 'abc', '7', NaN, Infinity, null, undefined]) {
      const r = scoreSchema.safeParse(x);
      expect(r.success, String(x)).toBe(false);
      expect(r.error.issues[0].message).toBe('Điểm phải từ 0 đến 10, tối đa 2 chữ số thập phân');
    }
  });
});

describe('gradeFromDefenseScore (GD7 §7.4, CAU_HOI #13)', () => {
  it('biên mặc định 4.99/5/6.99/7/8.99/9 và chuỗi thập phân', () => {
    expect([4.99, 5, 6.99, 7, 8.99, 9, 10, 0].map((x) => gradeFromDefenseScore(x))).toEqual(['FAIL', 'PASS', 'PASS', 'GOOD', 'GOOD', 'EXCELLENT', 'EXCELLENT', 'FAIL']);
    expect(gradeFromDefenseScore('7.42')).toBe('GOOD');
  });
  it('theo thang cấu hình của đợt', () => {
    const g = { excellent: 8.5, good: 6.5, pass: 5 };
    expect([8.5, 8.49, 6.5, 6.49, 5].map((x) => gradeFromDefenseScore(x, g))).toEqual(['EXCELLENT', 'GOOD', 'GOOD', 'PASS', 'PASS']);
  });
});

describe('Cấu hình đợt requireDefense/defenseGrades (GD7 §2.4)', () => {
  it('mặc định: không bắt buộc hội đồng, 9/7/5; gộp sâu khi đợt chỉ ghi đè một phần', () => {
    expect(DEFAULT_ROUND_CONFIG.requireDefense).toBe(false);
    expect(DEFAULT_ROUND_CONFIG.defenseGrades).toEqual({ excellent: 9, good: 7, pass: 5 });
    expect(effectiveRoundConfig({}).requireDefense).toBe(false);
    expect(effectiveRoundConfig({ requireDefense: true, defenseGrades: { good: 6.5 } })).toMatchObject({ requireDefense: true, defenseGrades: { excellent: 9, good: 6.5, pass: 5 } });
    expect(roundConfigSchema.safeParse(effectiveRoundConfig({})).success).toBe(true);
  });
  it('pass cố định 5; pass ≤ good ≤ excellent; 0..10; requireDefense boolean; khóa lạ bị từ chối', () => {
    const err = (config) => validateRoundFields({ regOpenAt: 1, regCloseAt: 2, reviewDeadline: 3, endAt: 4, config });
    expect(err({ defenseGrades: { pass: 4 } })).toHaveProperty(['config.defenseGrades.pass']);
    expect(err({ defenseGrades: { good: 4.5 } })).toHaveProperty(['config.defenseGrades.good']);
    expect(err({ defenseGrades: { excellent: 6, good: 7 } })).toHaveProperty(['config.defenseGrades.excellent']);
    expect(err({ defenseGrades: { excellent: 9.5, good: 7.5 }, requireDefense: true })).toEqual({});
    expect(roundConfigInputSchema.safeParse({ defenseGrades: { excellent: 11 } }).success).toBe(false);
    expect(roundConfigInputSchema.safeParse({ defenseGrades: { other: 1 } }).success).toBe(false);
    expect(roundConfigInputSchema.safeParse({ requireDefense: 'yes' }).success).toBe(false);
    expect(roundConfigInputSchema.safeParse({ requireDefense: true, defenseGrades: { good: 6 } }).success).toBe(true);
  });
});

describe('topicActionSchema – REQUEST_DEFENSE, RETURN_FROM_DEFENSE (GD7 §5.1, §5.4)', () => {
  const p = (o) => topicActionSchema.safeParse({ version: 0, ...o });
  const comment = 'Nhóm hoàn thành tốt các mốc, báo cáo đầy đủ.';
  it('REQUEST_DEFENSE: điểm theo scoreSchema, nhận xét trim 20..5000', () => {
    expect(p({ action: 'REQUEST_DEFENSE', processScore: 7.25, processComment: comment }).success).toBe(true);
    for (const processScore of [10.001, 5.555, 'abc']) {
      expect(p({ action: 'REQUEST_DEFENSE', processScore, processComment: comment }).error.issues[0].path).toEqual(['processScore']);
    }
    expect(p({ action: 'REQUEST_DEFENSE', processScore: 7, processComment: '   ngắn quá          ' }).error.issues[0].path).toEqual(['processComment']);
    expect(p({ action: 'REQUEST_DEFENSE', processScore: 7, processComment: 'x'.repeat(5001) }).success).toBe(false);
    expect(p({ action: 'REQUEST_DEFENSE', processComment: comment }).success).toBe(false);
  });
  it('RETURN_FROM_DEFENSE: lý do tùy chọn ở schema (checkTransition trả REASON_REQUIRED), tối đa 2000', () => {
    expect(p({ action: 'RETURN_FROM_DEFENSE' }).success).toBe(true);
    expect(p({ action: 'RETURN_FROM_DEFENSE', reason: 'x'.repeat(2001) }).success).toBe(false);
  });
});

it('nhãn: 2 loại thông báo mới, vai trò hội đồng, quyết định, nguồn kết quả', () => {
  for (const t of ['DEFENSE_REQUESTED', 'DEFENSE_RETURNED']) { expect(NOTIFICATION_TYPES).toContain(t); expect(NOTIFICATION_TYPE_LABEL[t]).toBeTruthy(); }
  expect(COUNCIL_ROLE_LABEL).toEqual({ CHAIR: 'Chủ tịch', SECRETARY: 'Thư ký', MEMBER: 'Ủy viên' });
  expect(DEFENSE_DECISION_LABEL).toEqual({ PASSED: 'Đạt', FAILED: 'Không đạt' });
  expect(Object.keys(RESULT_SOURCE_LABEL)).toEqual(['ADVISOR', 'COUNCIL', 'STAFF']);
});
