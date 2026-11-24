import { useSyncExternalStore } from 'react';

// Chế độ sáng/tối: mặc định theo hệ điều hành, người dùng bấm nút thì nhớ trong localStorage (chỉ là tiện ích, lỗi thì bỏ qua).
// Áp lớp `dark` lên <html> ngay khi import (main.jsx) để không nháy màu; không dùng script inline vì CSP script-src 'self'.
const KEY = 'nckh.theme';
const listeners = new Set();
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

const stored = () => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};
export const resolveTheme = (saved, systemDark) => (saved === 'dark' || saved === 'light' ? saved : systemDark ? 'dark' : 'light');
const current = () => resolveTheme(stored(), media?.matches);

const apply = () => {
  document.documentElement.classList.toggle('dark', current() === 'dark');
  listeners.forEach((l) => l());
};

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* bị chặn: chỉ đổi trong phiên này */ }
  document.documentElement.classList.toggle('dark', theme === 'dark');
  listeners.forEach((l) => l());
}

export const useTheme = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => document.documentElement.classList.contains('dark') ? 'dark' : 'light');

if (typeof document !== 'undefined') {
  apply();
  media?.addEventListener?.('change', () => { if (!stored()) apply(); });
}
