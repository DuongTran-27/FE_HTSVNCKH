import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ACTION_LABEL } from '@nckh/shared';
import { api } from '../lib/api.js';
import { invalidateAfterAction } from '../lib/queries.js';
import { toast } from '../lib/toast.js';
import { ConfirmDialog, btnDanger, btnGhost, btnPrimary } from './ui.jsx';
import { ReasonDialog } from './ReasonDialog.jsx';

const DONE = { APPROVE: 'Đã duyệt hồ sơ', REQUEST_REVISION: 'Đã yêu cầu chỉnh sửa hồ sơ', REJECT: 'Đã từ chối hồ sơ' };
const RELOAD = ['STALE_SUBMISSION', 'CONCURRENT_UPDATE', 'INVALID_TRANSITION'];
const DECISIONS = ['APPROVE', 'REQUEST_REVISION', 'REJECT'];

/**
 * Quyết định xét duyệt (FR07, UI §4.16). Gửi {action, version, submissionId: lần gửi đang xem, reason?}.
 * Chỉ hiện nút có trong topic.availableActions và khi lần gửi chưa có quyết định.
 * STALE_SUBMISSION / CONCURRENT_UPDATE / INVALID_TRANSITION: đóng hộp, báo người dùng, tải lại cả màn (onSettled/invalidate).
 */
export function ReviewActions({ topic, submission, backTo }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState('');
  const actions = DECISIONS.filter((a) => topic.availableActions.includes(a));

  const send = (action, reason) => api(`/topics/${topic.id}/actions`, {
    method: 'POST', body: { action, version: topic.version, submissionId: submission.id, ...(reason !== undefined && { reason }) },
  });
  // true = đã xử lý bằng toast (màn được tải lại)
  const reload = (err) => {
    if (!RELOAD.includes(err.code)) return false;
    setDialog(null);
    toast(err.code === 'STALE_SUBMISSION' ? 'Hồ sơ vừa được gửi lần mới hoặc đã được xử lý. Đã tải lại hồ sơ mới nhất.' : err.message, { type: 'error' });
    return true;
  };
  const done = (action) => {
    setDialog(null);
    toast(`${DONE[action]} ${topic.code}`, { type: 'success' });
    navigate(backTo, { replace: true });
  };
  const approve = useMutation({
    mutationFn: () => send('APPROVE'),
    onSuccess: () => done('APPROVE'),
    onError: (err) => { if (!err.sessionExpired && !reload(err)) setError(err.message); },
    onSettled: () => invalidateAfterAction(qc, topic.id),
  });
  const withReason = (action) => async (reason) => {
    try {
      await send(action, reason);
    } catch (err) {
      invalidateAfterAction(qc, topic.id);
      if (reload(err)) return;
      throw err;
    }
    invalidateAfterAction(qc, topic.id);
    done(action);
  };
  const open = (d) => { setError(''); setDialog(d); };

  if (submission.decision || actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-3 shadow-sm max-sm:sticky max-sm:bottom-0 max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0" role="group" aria-label="Quyết định">
      {actions.includes('APPROVE') && <button type="button" className={btnPrimary} onClick={() => open('APPROVE')}>Duyệt</button>}
      {actions.includes('REQUEST_REVISION') && <button type="button" className={btnGhost} onClick={() => open('REQUEST_REVISION')}>{ACTION_LABEL.REQUEST_REVISION}</button>}
      {actions.includes('REJECT') && <button type="button" className={btnDanger} onClick={() => open('REJECT')}>{ACTION_LABEL.REJECT}</button>}
      {dialog === 'APPROVE' && (
        <ConfirmDialog title="Duyệt hồ sơ" confirmLabel="Duyệt" message={`Duyệt hồ sơ ${topic.code}, lần gửi ${submission.seq}? Đề tài sẽ chuyển sang Đang thực hiện.`}
          busy={approve.isPending} error={error} onConfirm={() => approve.mutate()} onCancel={() => setDialog(null)} />
      )}
      {dialog === 'REQUEST_REVISION' && <ReasonDialog title="Yêu cầu chỉnh sửa" label="Nội dung cần chỉnh sửa" confirmLabel="Yêu cầu chỉnh sửa" onSubmit={withReason('REQUEST_REVISION')} onCancel={() => setDialog(null)} />}
      {dialog === 'REJECT' && <ReasonDialog title="Từ chối hồ sơ" label="Lý do từ chối" confirmLabel="Từ chối" onSubmit={withReason('REJECT')} onCancel={() => setDialog(null)} />}
    </div>
  );
}
