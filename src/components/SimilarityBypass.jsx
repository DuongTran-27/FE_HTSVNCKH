import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { fmtDateTime } from '../lib/format.js';
import { invalidateAfterAction } from '../lib/queries.js';
import { toast } from '../lib/toast.js';
import { ReasonDialog } from './ReasonDialog.jsx';
import { btnGhost } from './ui.jsx';

/** Thông báo "đã được cho phép gửi" (mọi người xem được `similarityBypass`) – dùng ở chi tiết đề tài và trang gửi */
export const BypassNote = ({ bypass }) => (bypass ? (
  <p role="note" className="break-words rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
    Cán bộ đã cho phép gửi dù chưa kiểm tra được trùng lặp ({bypass.grantedBy?.fullName}, {fmtDateTime(bypass.createdAt)}). Quyền chỉ áp dụng cho một lần gửi kế tiếp; hệ thống sẽ tự kiểm tra lại khi hết lỗi.
    {bypass.reason && <> Lý do: {bypass.reason}</>}
  </p>
) : null);

/** G5 (API_GD6 §9.2): cán bộ cho phép gửi khi FR06 lỗi – nút theo permissions.grantSimilarityBypass */
export function GrantBypass({ topic }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  if (!topic.permissions?.grantSimilarityBypass) return null;
  const submit = async (reason) => {
    try {
      await api(`/topics/${topic.id}/similarity-bypasses`, { method: 'POST', body: { reason } });
    } finally {
      invalidateAfterAction(qc, topic.id); // 409 (đã có quyền / kiểm tra không lỗi) cũng cần dữ liệu mới
    }
    setOpen(false);
    toast('Đã cho phép gửi khi chưa kiểm tra', { type: 'success' });
  };
  return (
    <>
      <button type="button" className={btnGhost} onClick={() => setOpen(true)}>Cho phép gửi khi chưa kiểm tra</button>
      {open && (
        <ReasonDialog title="Cho phép gửi khi chưa kiểm tra" confirmLabel="Cho phép" onSubmit={submit} onCancel={() => setOpen(false)}
          message="Nhóm được gửi hồ sơ đúng một lần dù hệ thống chưa kiểm tra được trùng lặp. Hồ sơ mang cờ chưa kiểm tra và hệ thống tự kiểm tra lại khi hết lỗi." />
      )}
    </>
  );
}
