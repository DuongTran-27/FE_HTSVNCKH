import { expect, it } from 'vitest';
import { shouldRetryQuery } from './queryClient.js';

it('shouldRetryQuery: thử lại tối đa 2 lần, chỉ mất mạng (0) và 503 (UI §6)', () => {
  expect(shouldRetryQuery(0, { status: 0 })).toBe(true);
  expect(shouldRetryQuery(1, { status: 503 })).toBe(true);
  expect(shouldRetryQuery(2, { status: 0 })).toBe(false);
  expect(shouldRetryQuery(0, { status: 500 })).toBe(false);
  expect(shouldRetryQuery(0, { status: 401 })).toBe(false);
  expect(shouldRetryQuery(0, { status: 404 })).toBe(false);
});
