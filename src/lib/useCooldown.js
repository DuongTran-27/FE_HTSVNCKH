import { useCallback, useEffect, useState } from 'react';

export const formatRetryAfter = (seconds) => `Vui lòng thử lại sau ${Math.max(1, Math.ceil(seconds / 60))} phút`;

/**
 * Tắt nút đến hết Retry-After (UI §7, 429 RATE_LIMITED).
 * Dùng: const cd = useCooldown(); onError: cd.start(err.retryAfter); <button disabled={cd.active}>.
 * start() thay cho tham số retryAfter để hai lần 429 liên tiếp cùng số giây vẫn khởi động lại.
 */
export const useCooldown = () => {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const start = useCallback((seconds) => {
    if (!(seconds > 0)) return;
    const t = Date.now();
    setNow(t);
    setUntil(t + seconds * 1000);
  }, []);

  const active = until > now;
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  const remaining = active ? Math.ceil((until - now) / 1000) : 0;
  return { active, remaining, message: active ? formatRetryAfter(remaining) : '', start };
};
