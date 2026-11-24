import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import './zodConfig.js';

describe('zodConfig', () => {
  it('bật jitless để Zod không gọi new Function dưới CSP', () => {
    expect(z.config().jitless).toBe(true);
    expect(z.object({ a: z.string() }).safeParse({ a: 'x' }).success).toBe(true);
  });
});
