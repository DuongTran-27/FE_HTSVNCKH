import { describe, expect, it } from 'vitest';
import { mapServerDetails } from './changeRequests.js';

describe('mapServerDetails', () => {
  it('giữ thông điệp của Error khi đổi tên khóa details (không rơi về "Đã có lỗi xảy ra")', () => {
    const err = Object.assign(new Error('Hồ sơ nghi trùng cao, cần giải trình tối thiểu 50 từ'), { code: 'JUSTIFICATION_REQUIRED', status: 400, details: { similarityCheck: {} } });
    const mapped = mapServerDetails(err);
    expect(mapped.message).toBe('Hồ sơ nghi trùng cao, cần giải trình tối thiểu 50 từ');
    expect(mapped.code).toBe('JUSTIFICATION_REQUIRED');
  });
});
