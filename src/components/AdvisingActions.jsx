import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ACTION_LABEL } from '@nckh/shared';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useMyQuota } from '../lib/queries.js';
import { toast } from '../lib/toast.js';
import { ConfirmDialog, btnDanger, btnPrimary } from './ui.jsx';
import { ReasonDialog } from './ReasonDialog.jsx';

/**
 * Nhận / Từ chối hướng dẫn (FR16), dùng ở R6 và R15. `actions` do nơi gọi quyết định
 * (R6: topic.availableActions của server; R15: availableActions(status,'LECTURER') – UI §5.3 ngoại lệ 1).
 * Sau DECLINE không gọi lại GET /api/topics/:id (GV hết quyền xem) → bỏ cache đề tài và về danh sách.
 */
export function AdvisingActions({ topic, actions, redirectOnDecline = true }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState(null); // 'ACCEPT_ADVISING' | 'DECLINE_ADVISING'
  const [error, setError] = useState('');
  const canAccept = actions.includes('ACCEPT_ADVISING');
  const canDecline = actions.includes('DECLINE_ADVISING');
  const quota = useMyQuota(topic.round?.id, user, canAccept).data;

  const refreshLists = () => {
    qc.invalidateQueries({ queryKey: ['advisor-requests'] });
    qc.invalidateQueries({ queryKey: ['lecturers'] });
    qc.invalidateQueries({ queryKey: ['topics'] });
  };
  const send = (body) => api(`/topics/${topic.id}/actions`, { method: 'POST', body: { version: topic.version, ...body } });
  // Trả true nếu đã xử lý bằng toast + tải lại; false → hộp thoại hiện err.message (vd LECTURER_QUOTA_EXCEEDED, hạn mức được tải lại)
  const stale = (err) => {
    refreshLists();
    if (err.code !== 'INVALID_TRANSITION' && err.code !== 'CONCURRENT_UPDATE') return false;
    qc.invalidateQueries({ queryKey: ['topic', topic.id] });
    setDialog(null);
    toast(err.code === 'INVALID_TRANSITION' ? 'Đề nghị không còn hiệu lực' : err.message, { type: 'error' });
    return true;
  };
  const accept = useMutation({
    mutationFn: () => send({ action: 'ACCEPT_ADVISING' }),
    onSuccess: () => { setDialog(null); refreshLists(); qc.invalidateQueries({ queryKey: ['topic', topic.id] }); toast('Đã nhận hướng dẫn', { type: 'success' }); },
    onError: (err) => { if (!err.sessionExpired && !stale(err)) setError(err.message); },
  });
  const decline = async (reason) => {
    try {
      await send({ action: 'DECLINE_ADVISING', reason });
    } catch (err) {
      if (stale(err)) return;
      throw err;
    }
    setDialog(null);
    qc.removeQueries({ queryKey: ['topic', topic.id] });
    refreshLists();
    toast('Đã từ chối hướng dẫn', { type: 'success' });
    if (redirectOnDecline) navigate('/de-nghi-huong-dan', { replace: true });
  };
  const open = (d) => { setError(''); setDialog(d); };

  return (
    <>
      {canAccept && <button type="button" className={btnPrimary} onClick={() => open('ACCEPT_ADVISING')}>{ACTION_LABEL.ACCEPT_ADVISING}</button>}
      {canDecline && <button type="button" className={btnDanger} onClick={() => open('DECLINE_ADVISING')}>{ACTION_LABEL.DECLINE_ADVISING}</button>}
      {dialog === 'ACCEPT_ADVISING' && (
        <ConfirmDialog title="Nhận hướng dẫn" confirmLabel="Nhận hướng dẫn" busy={accept.isPending} error={error}
          message={`${quota ? `Bạn đã nhận ${quota.activeTopicCount}/${quota.maxTopics} đề tài trong đợt này. ` : ''}${quota?.isFull ? 'Bạn đã đủ hạn mức, hệ thống sẽ từ chối. ' : ''}Nhận hướng dẫn đề tài ${topic.code}?`}
          onConfirm={() => accept.mutate()} onCancel={() => setDialog(null)} />
      )}
      {dialog === 'DECLINE_ADVISING' && (
        <ReasonDialog title="Từ chối hướng dẫn" label="Lý do từ chối" confirmLabel="Từ chối" onSubmit={decline} onCancel={() => setDialog(null)} />
      )}
    </>
  );
}
