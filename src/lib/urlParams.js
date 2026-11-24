import { useSearchParams } from 'react-router';

export const YEAR_RE = /^\d{4}-\d{4}$/;

/** Đặt/xóa một khóa; đổi bộ lọc thì về trang 1 (UI §1.3) */
export const withParam = (old, k, v) => {
  const n = new URLSearchParams(old);
  if (v) n.set(k, v); else n.delete(k);
  if (k !== 'page') n.delete('page');
  return n;
};

/** Giá trị không hợp lệ trên URL → bỏ qua (UI §1.3) */
export const pickEnum = (v, allowed) => (allowed.includes(v) ? v : '');
export const pickYear = (v) => (YEAR_RE.test(v ?? '') ? v : '');
export const pickPage = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : 1; };

/** Bộ lọc/trang nằm trên query string: get(k) đọc, set(k, v) ghi, clear() xóa hết (giữ nguyên lịch sử Back) */
export function useUrlParams() {
  const [sp, setSp] = useSearchParams();
  return {
    get: (k) => sp.get(k) ?? '',
    set: (k, v) => setSp((old) => withParam(old, k, v)),
    clear: () => setSp(new URLSearchParams()),
    any: [...sp.keys()].some((k) => k !== 'page'),
  };
}
