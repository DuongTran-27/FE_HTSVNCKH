// Giờ Việt Nam cố định +07:00 (không có giờ mùa hè) – UI §1.4, CLAUDE.md quy tắc 8
const TZ = 'Asia/Ho_Chi_Minh';
const OFFSET_MS = 7 * 3600 * 1000;

export const fmtDateTime = (iso) => (iso
  ? new Date(iso).toLocaleString('vi-VN', { timeZone: TZ, hour12: false, dateStyle: 'short', timeStyle: 'short' })
  : '');

/** ISO bất kỳ -> giá trị cho <input type="datetime-local"> theo giờ Việt Nam */
export const toLocalInput = (iso) => (iso ? new Date(new Date(iso).getTime() + OFFSET_MS).toISOString().slice(0, 16) : '');

/** 'YYYY-MM-DDTHH:mm' (giờ VN) -> ISO có +07:00; rỗng giữ rỗng để schema báo lỗi */
export const fromLocalInput = (v) => (v ? `${v}:00+07:00` : '');

/** Tải một Blob xuống máy (CSV, Excel thống kê) */
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/** Tải chuỗi CSV xuống máy (đã qua toCsv) */
export const downloadCsv = (text, filename) => downloadBlob(new Blob([text], { type: 'text/csv;charset=utf-8' }), filename);

// API từ chối q < 2 ký tự (400): chỉ gửi khi đủ 2 ký tự sau trim
export const searchTerm = (v) => (v && v.trim().length >= 2 ? v.trim() : undefined);

export const qs = (params) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

// Điểm chuỗi thập phân của API ("7.25") → hiển thị kiểu Việt Nam "7,25"; không có điểm → "—"
export const fmtScore = (s) => (s == null ? '—' : String(s).replace('.', ','));
