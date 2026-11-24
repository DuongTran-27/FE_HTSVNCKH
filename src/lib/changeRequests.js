import { changeRequestCreateSchema } from '@nckh/shared';

/** Yêu cầu đã đóng / đề tài đã đổi sau khi tạo → tải lại + thông điệp (API_GD6 §12) */
export const GONE_CODES = new Set(['CHANGE_REQUEST_CLOSED', 'STALE_CHANGE_REQUEST']);
/** Sai trạng thái đề tài khi tạo yêu cầu: hai mã, FE xử lý như nhau (API_GD6 §11) */
export const WRONG_STATE_CODES = new Set(['INVALID_TRANSITION', 'TOPIC_NOT_IN_PROGRESS']);

export const invalidateChangeRequests = (qc, topicId) => {
  qc.invalidateQueries({ queryKey: ['change-requests'] });
  if (topicId) qc.invalidateQueries({ queryKey: ['topic', topicId] });
  qc.invalidateQueries({ queryKey: ['topics'] });
};

export const FORM_FIELDS = ['reason', 'newLecturerId', 'title', 'summary', 'objectives', 'keywordsText', 'fieldId', 'addMemberCode', 'justification'];

const splitKeywords = (text) => text.split(',').map((k) => k.trim()).filter(Boolean);
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Giá trị form → body POST /change-requests. TOPIC_CHANGE chỉ gửi các trường khác giá trị hiện tại (API_GD6 §6.2) */
export const toBody = (kind, v, topic) => {
  const reason = v.reason;
  if (kind === 'ADVISOR_CHANGE') return { type: kind, reason, newLecturerId: v.newLecturerId };
  if (kind !== 'TOPIC_CHANGE') return { type: kind, reason };
  const changes = {};
  if (v.title.trim() !== (topic.title ?? '')) changes.title = v.title;
  if (v.summary.trim() !== (topic.summary ?? '')) changes.summary = v.summary;
  if (v.objectives.trim() !== (topic.objectives ?? '')) changes.objectives = v.objectives;
  const kw = splitKeywords(v.keywordsText);
  if (!sameList(kw, topic.keywords ?? [])) changes.keywords = kw;
  if (v.fieldId && v.fieldId !== topic.field?.id) changes.fieldId = v.fieldId;
  return {
    type: kind, reason,
    ...(Object.keys(changes).length ? { changes } : {}),
    ...(v.addMemberCode.trim() ? { addMemberCode: v.addMemberCode.trim() } : {}),
    ...(v.justification.trim() ? { justification: v.justification.trim() } : {}),
  };
};

const fieldOf = (path) => {
  const k = path.filter((p) => p !== 'changes')[0];
  return k === 'keywords' ? 'keywordsText' : k;
};

/** Resolver RHF dùng changeRequestCreateSchema của @nckh/shared (backend vẫn kiểm lại) */
export const makeResolver = (kind, topic) => (values) => {
  const r = changeRequestCreateSchema.safeParse(toBody(kind, values, topic));
  if (r.success) return { values, errors: {} };
  const errors = {};
  for (const i of r.error.issues) {
    const f = fieldOf(i.path);
    const name = FORM_FIELDS.includes(f) ? f : 'root';
    errors[name] ??= { type: 'validation', message: i.message };
  }
  return { values: {}, errors };
};

/** details của lỗi server ('changes.title', 'keywords.2', '_') → tên ô của form */
export const mapServerDetails = (err) => {
  if (!err.details || typeof err.details !== 'object') return err;
  const details = {};
  for (const [k, m] of Object.entries(err.details)) details[fieldOf(k.split('.'))] = m;
  return { ...err, message: err.message, details }; // message của Error không enumerable: spread làm mất
};
