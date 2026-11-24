import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { applyServerErrors } from './forms.js';

// Trạng thái có dữ liệu thực hiện (mốc, tiến độ, kết quả) – chỉ để chọn tab hiển thị, quyền do server quyết.
// DC-15: thêm WAITING_DEFENSE để GVHD, nhóm và thành viên hội đồng vẫn đọc được mốc/tiến độ khi chờ bảo vệ (API_GD7 §1.1)
export const EXEC_STATUSES = ['IN_PROGRESS', 'WAITING_DEFENSE', 'WAITING_CLOSE', 'CLOSED'];

/** Mốc của đề tài (API_GD45 §3.2) – mảng MilestoneView, sắp theo order */
export const useMilestones = (topicId, enabled = true) => useQuery({
  queryKey: ['milestones', topicId], enabled, queryFn: async () => (await api(`/topics/${topicId}/milestones`)).items,
});

/** Tải lại mọi dữ liệu GĐ4 của đề tài (sau ghi thành công hoặc lỗi 403/404/409 – UI §7) */
export const invalidateExec = (qc, topicId) => [
  ['topic', topicId], ['milestones', topicId], ['due-changes'], ['reopens'], ['progress', topicId],
  ['documents', topicId], ['feedbacks', topicId], ['results', topicId],
].forEach((queryKey) => qc.invalidateQueries({ queryKey }));

/**
 * Chạy fn (gọi API ghi) cho form React Hook Form; lỗi → gắn vào ô (`fields`) hoặc lỗi cấp form ('root').
 * Luôn tải lại dữ liệu GĐ4 sau khi xong (thành công hay 409 đều cần dữ liệu mới). Trả lỗi (hoặc null) để màn xử lý thêm (429).
 */
export const execSubmit = async (qc, topicId, setError, fields, fn) => {
  try {
    await fn();
    return null;
  } catch (err) {
    if (err.sessionExpired) return err;
    if (err.code === 'PAYLOAD_TOO_LARGE' && fields.includes('file')) {
      setError('file', { type: 'server', message: err.message }, { shouldFocus: true });
      return err;
    }
    const msgs = applyServerErrors(err, setError, fields);
    if (msgs.length) setError('root', { type: 'server', message: `${msgs.join(' ')}${err.status === 409 ? '. Dữ liệu đã được tải lại.' : ''}` });
    return err;
  } finally {
    invalidateExec(qc, topicId);
  }
};

/** Lỗi phía máy khách cho file nộp (backend vẫn kiểm lại – FR11) */
export const fileError = (file, cfg) => {
  if (!file) return 'Chọn file cần nộp';
  const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
  if (!cfg.allowedFileTypes.includes(ext)) return `Chỉ nhận file ${cfg.allowedFileTypes.join(', ').toUpperCase()}`;
  if (file.size > cfg.maxFileSizeMB * 1048576) return `File vượt quá ${cfg.maxFileSizeMB} MB`;
  return null;
};

export const fmtSize = (bytes) => (bytes == null ? '' : bytes < 1048576 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`);
