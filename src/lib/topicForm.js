import { z } from 'zod';
import { topicDraftSchema, topicPublishSchema, topicSubmitSchema, REQUIREMENTS_MAX } from '@nckh/shared';

/** TopicDetail -> giá trị form (UI §4.7). TopicDetail chỉ có field:{id,name}, không có fieldId. */
export const topicToForm = (t) => ({
  title: t.title ?? '',
  summary: t.summary ?? '',
  objectives: t.objectives ?? '',
  keywords: [...(t.keywords ?? [])],
  fieldId: t.field?.id ?? '',
  // Chỉ đề tài GV công bố mới có 2 trường này; đề tài SV gửi chúng lên là 400 (API_GD7 §3.2)
  ...(t.origin === 'LECTURER' && { requirements: t.requirements ?? '', recruitSlots: t.recruitSlots ?? null }),
});

/** Schema form R7: nháp + (đề tài GV) yêu cầu ứng viên và số SV cần tuyển; số hợp lệ 1..maxMembers kiểm khi công bố */
export const editSchemaFor = (topic) => (topic.origin === 'LECTURER'
  ? topicDraftSchema.extend({
    requirements: z.string().trim().max(REQUIREMENTS_MAX, `Yêu cầu ứng viên tối đa ${REQUIREMENTS_MAX} ký tự`),
    recruitSlots: z.int({ error: 'Số sinh viên cần tuyển phải là số nguyên' }).min(1, 'Cần tuyển ít nhất 1 sinh viên').max(topic.round.effectiveConfig.maxMembers, `Tối đa ${topic.round.effectiveConfig.maxMembers} sinh viên (số thành viên tối đa của đợt)`).nullable(),
  })
  : topicDraftSchema);

export const SUBMIT_FIELDS = [['title', 'Tên đề tài'], ['summary', 'Tóm tắt'], ['objectives', 'Mục tiêu'], ['keywords', 'Từ khóa'], ['fieldId', 'Lĩnh vực']];
/** Đề tài GV công bố thêm điều kiện số sinh viên cần tuyển (topicPublishSchema) */
export const PUBLISH_FIELDS = [...SUBMIT_FIELDS, ['recruitSlots', 'Số sinh viên cần tuyển']];

/** Chạy topicSubmitSchema(cfg): trả { trường: thông điệp } cho các trường chưa đạt (rỗng = đủ điều kiện gửi) */
export const submitProblems = (form, cfg, publish = false) => {
  const r = (publish ? topicPublishSchema : topicSubmitSchema)(cfg).safeParse(form);
  const bad = {};
  if (!r.success) for (const i of r.error.issues) bad[i.path[0]] ??= i.message;
  return bad;
};
