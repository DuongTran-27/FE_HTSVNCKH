import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { qs } from './format.js';

/** Danh mục (không phân trang): GET /api/<path>?... → mảng items. Khóa ['catalog', path, params] */
export const useCatalog = (path, params = {}, options = {}) => useQuery({
  queryKey: ['catalog', path, params],
  queryFn: async () => (await api(`/${path}${qs(params)}`)).items,
  staleTime: 60_000,
  ...options,
});

/** Khoa người dùng được chọn: ADMIN mọi khoa; cán bộ chỉ khoa trong phạm vi (gợi ý, backend kiểm) */
export const useScopedFaculties = (user) => {
  const q = useCatalog('faculties');
  const data = q.data && user?.role === 'STAFF' ? q.data.filter((f) => user.staffFacultyIds?.includes(f.id)) : q.data;
  return { ...q, data };
};

/** Hạn mức của chính giảng viên trong đợt: GET /api/lecturers?roundId=&q={code}, lấy dòng id = user.id (API_GD2 §6) */
export const useMyQuota = (roundId, user, enabled = true) => useQuery({
  queryKey: ['lecturers', 'mine', roundId, user?.id],
  enabled: enabled && !!roundId && user?.role === 'LECTURER',
  queryFn: async () => (await api(`/lecturers${qs({ roundId, q: user.code, pageSize: 100 })}`)).items.find((l) => l.id === user.id) ?? null,
});

/** Kết quả kiểm tra tương tự gần nhất (API §7.1): { similarityCheck | null } */
export const useSimilarityLatest = (id, enabled = true) => useQuery({
  queryKey: ['similarity-latest', id],
  enabled,
  queryFn: async () => (await api(`/topics/${id}/similarity-checks/latest`)).similarityCheck,
});

/** Invalidate sau mọi lần gọi /actions, kể cả lỗi có ghi dữ liệu (UI §9.2) – dùng ở onSettled */
export const invalidateAfterAction = (qc, id) => [
  ['topic', id], ['similarity-latest', id], ['topics'], ['submissions', id], ['submission', id],
  ['status-history', id], ['advisor-requests'], ['lecturers'], ['invitations'],
  ['recruitments'], ['applications'], ['topic-applications', id], // DC-13: công bố/ngừng tuyển/chốt nhóm đổi bảng tin và danh sách đơn (UI §12.12)
].forEach((queryKey) => qc.invalidateQueries({ queryKey }));

export const useTopic = (id, enabled = true) => useQuery({ queryKey: ['topic', id], enabled, queryFn: async () => (await api(`/topics/${id}`)).topic });

/** Danh sách lần gửi (seq giảm dần) – API §8.4 */
export const useSubmissions = (id, enabled = true) => useQuery({
  queryKey: ['submissions', id], enabled, queryFn: async () => (await api(`/topics/${id}/submissions`)).items,
});

/** Một snapshot – API §8.4 */
export const useSubmission = (id, seq, enabled = true) => useQuery({
  queryKey: ['submission', id, seq], enabled, queryFn: async () => (await api(`/topics/${id}/submissions/${seq}`)).submission,
});
