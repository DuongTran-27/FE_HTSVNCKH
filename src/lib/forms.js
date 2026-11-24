// Mã lỗi có details là map trường { 'đường.dẫn': 'thông điệp' } (API_GD2 §1.3a)
const FIELD_MAP_CODES = new Set(['VALIDATION_ERROR', 'TOPIC_INCOMPLETE', 'DUPLICATE']);

const matchField = (key, fieldNames) => fieldNames.find((n) => key === n || key.startsWith(`${n}.`));

/**
 * Gắn lỗi server vào form React Hook Form (UI §7).
 * - Khóa thuộc fieldNames (kể cả 'keywords.2' khi có 'keywords') → setError(khóa), focus ô đầu tiên theo thứ tự fieldNames.
 * - Khóa '_' hoặc khóa lạ → lỗi cấp form.
 * Trả mảng thông điệp lỗi cấp form (rỗng nếu mọi lỗi đã gắn vào ô).
 */
export const applyServerErrors = (error, setError, fieldNames = []) => {
  const details = error?.details;
  if (!FIELD_MAP_CODES.has(error?.code) || !details || typeof details !== 'object') {
    return [error?.message ?? 'Đã có lỗi xảy ra'];
  }
  const formErrors = [];
  const fieldErrors = [];
  for (const [key, message] of Object.entries(details)) {
    const field = matchField(key, fieldNames);
    if (field) fieldErrors.push({ key, message, order: fieldNames.indexOf(field) });
    else formErrors.push(message);
  }
  fieldErrors.sort((a, b) => a.order - b.order);
  fieldErrors.forEach(({ key, message }, i) => setError(key, { type: 'server', message }, { shouldFocus: i === 0 }));
  if (!fieldErrors.length && !formErrors.length) formErrors.push(error.message);
  return formErrors;
};
