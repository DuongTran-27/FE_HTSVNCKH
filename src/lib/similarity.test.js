import { describe, expect, it } from 'vitest';
import { justificationState } from './similarity.js';

describe('justificationState', () => {
  it('kết quả cũ (isStale) coi như chưa kiểm: không cho gửi dù mức NONE', () => {
    const st = justificationState({ level: 'NONE', status: 'OK', isStale: true });
    expect(st).toMatchObject({ kind: 'unchecked', ok: false });
  });
  it('NONE mới -> được gửi; HIGH cần đủ từ giải trình', () => {
    expect(justificationState({ level: 'NONE' }).ok).toBe(true);
    const c = { level: 'HIGH', thresholds: { minJustificationWords: 3 } };
    expect(justificationState(c, 'một hai').ok).toBe(false);
    expect(justificationState(c, 'một hai ba').ok).toBe(true);
  });
});
