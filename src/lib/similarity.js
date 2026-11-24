import { countWords } from '@nckh/shared';

/**
 * Trạng thái ô giải trình ở R10 (UI §4.10, FR06). Không bao giờ coi "lỗi/chưa kiểm" là "không trùng".
 * kind: unchecked (chưa có kết quả hoặc kết quả đã cũ) | error (Chưa kiểm tra được) | none | review | high
 */
export const justificationState = (check, text = '') => {
  if (!check || check.isStale) return { kind: 'unchecked', required: false, ok: false, words: 0, min: 0 };
  if (check.status === 'ERROR' || !check.level) return { kind: 'error', required: false, ok: true, words: 0, min: 0 };
  const words = countWords(text);
  const min = check.thresholds?.minJustificationWords ?? 0;
  const required = check.level === 'HIGH';
  return { kind: check.level.toLowerCase(), required, words, min, ok: !required || words >= min };
};

/** Kết quả kiểm cần chạy lại: chưa có, đã cũ nội dung, hoặc quá 24 giờ (Giả định U3) */
export const needsFreshCheck = (check, now = Date.now()) =>
  !check || check.isStale === true || now - new Date(check.createdAt).getTime() > 24 * 3600 * 1000;
