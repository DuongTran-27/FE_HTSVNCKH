import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { invalidateChangeRequests } from '../lib/changeRequests.js';
import { fmtDateTime } from '../lib/format.js';
import { toast } from '../lib/toast.js';
import { ReasonDialog } from './ReasonDialog.jsx';
import { Badge, ConfirmDialog, btnDanger, btnGhost } from './ui.jsx';

/** FR21 – rời nhóm trước duyệt (`permissions.leave`): POST /leave, xong về /de-tai (API_GD6 §5.1) */
export function LeaveGroupButton({ topic }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const leave = useMutation({
    mutationFn: () => api(`/topics/${topic.id}/leave`, { method: 'POST', body: { version: topic.version } }),
    onSuccess: () => {
      toast('Bạn đã rời nhóm', { type: 'success' });
      qc.removeQueries({ queryKey: ['topic', topic.id] });
      navigate('/de-tai');
    },
    onError: (err) => {
      if (err.sessionExpired) return;
      if (err.code === 'LEAVE_NEEDS_APPROVAL') { setOpen(false); navigate(`/de-tai/${topic.id}/yeu-cau`, { state: { open: 'LEAVE_GROUP' } }); return; }
      setError(err.code === 'LEADER_CANNOT_LEAVE' ? `${err.message}. Vào "Quản lý nhóm" để chuyển quyền trưởng nhóm.` : err.message);
    },
    onSettled: () => invalidateChangeRequests(qc, topic.id),
  });
  if (!topic.permissions?.leave) return null;
  return (
    <>
      <button type="button" className={btnDanger} onClick={() => { setError(''); setOpen(true); }}>Rời nhóm</button>
      {open && (
        <ConfirmDialog title="Rời nhóm" message="Bạn sẽ mất quyền xem đề tài này ngay sau khi rời. Chắc chắn rời nhóm?" confirmLabel="Rời nhóm" danger
          busy={leave.isPending} error={error} onConfirm={() => { setError(''); leave.mutate(); }} onCancel={() => setOpen(false)} />
      )}
    </>
  );
}

/** FR19.4 – cán bộ cấp/thu hồi quyền chỉ đọc cho giảng viên cũ. Ẩn khi `formerAdvisors` rỗng */
export function FormerAdvisors({ topic }) {
  const qc = useQueryClient();
  const [target, setTarget] = useState(null);
  const list = topic.formerAdvisors ?? [];
  if (!topic.permissions?.manageFormerAdvisorAccess || list.length === 0) return null;
  const submit = async (reason) => {
    try {
      await api(`/topics/${topic.id}/former-advisors/${target.lecturerId}/read-access`, { method: 'PUT', body: { granted: !target.readOnlyGranted, reason } });
    } finally {
      qc.invalidateQueries({ queryKey: ['topic', topic.id] });
    }
    setTarget(null);
    toast('Đã cập nhật quyền đọc', { type: 'success' });
  };
  return (
    <div>
      <h2 className="font-bold">Giảng viên hướng dẫn trước đây</h2>
      <ul className="space-y-2">
        {list.map((f) => (
          <li key={f.lecturerId} className="flex flex-wrap items-center gap-2">
            <span className="break-words">{f.fullName} ({fmtDateTime(f.startAt)} – {fmtDateTime(f.endAt)})</span>
            <Badge tone={f.readOnlyGranted ? 'green' : 'slate'}>{f.readOnlyGranted ? 'Được đọc' : 'Không có quyền'}</Badge>
            <button type="button" className={btnGhost} onClick={() => setTarget(f)}>{f.readOnlyGranted ? 'Thu hồi quyền đọc' : 'Cho phép đọc'}</button>
          </li>
        ))}
      </ul>
      {target && (
        <ReasonDialog title={target.readOnlyGranted ? 'Thu hồi quyền đọc' : 'Cho phép đọc'} confirmLabel={target.readOnlyGranted ? 'Thu hồi' : 'Cho phép'}
          message={`Giảng viên ${target.fullName} ${target.readOnlyGranted ? 'sẽ không còn đọc được đề tài' : 'chỉ được đọc, không ghi được gì'}.`}
          onSubmit={submit} onCancel={() => setTarget(null)} />
      )}
    </div>
  );
}

export const ReadOnlyBanner = ({ topic }) => (topic.readOnlyAccess
  ? <p role="note" className="rounded-lg border border-blue-100 bg-blue-50 p-4">Bạn chỉ có quyền đọc đề tài này (giảng viên hướng dẫn trước đây).</p> : null);
