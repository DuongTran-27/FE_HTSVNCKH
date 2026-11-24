import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ACTION_LABEL } from '@nckh/shared';
import { api } from '../lib/api.js';
import { invalidateAfterAction } from '../lib/queries.js';
import { toast } from '../lib/toast.js';
import { ConfirmDialog, btnDanger, btnPrimary } from './ui.jsx';

/** Action của sinh viên trên R6 (UI §5.1). `actions` là topic.availableActions của server. */
export function StudentActions({ topic, actions }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const withdraw = useMutation({
    mutationFn: () => api(`/topics/${topic.id}/actions`, { method: 'POST', body: { action: 'WITHDRAW_ADVISOR_REQUEST', version: topic.version } }),
    onSuccess: (r) => { qc.setQueryData(['topic', topic.id], r.topic); setOpen(false); toast('Đã rút đề nghị hướng dẫn', { type: 'success' }); },
    onError: (err) => { if (!err.sessionExpired) setError(err.message); },
    onSettled: () => invalidateAfterAction(qc, topic.id),
  });
  const base = `/de-tai/${topic.id}`;
  return (
    <>
      {actions.includes('REQUEST_ADVISOR') && <Link to={`${base}/moi-gvhd`} className={btnPrimary}>{ACTION_LABEL.REQUEST_ADVISOR}</Link>}
      {actions.includes('SUBMIT_FOR_REVIEW') && <Link to={`${base}/gui`} className={btnPrimary}>{ACTION_LABEL.SUBMIT_FOR_REVIEW}</Link>}
      {actions.includes('RESUBMIT') && <Link to={`${base}/gui`} className={btnPrimary}>{ACTION_LABEL.RESUBMIT}</Link>}
      {actions.includes('WITHDRAW_ADVISOR_REQUEST') && <button type="button" className={btnDanger} onClick={() => { setError(''); setOpen(true); }}>{ACTION_LABEL.WITHDRAW_ADVISOR_REQUEST}</button>}
      {open && (
        <ConfirmDialog title="Rút đề nghị hướng dẫn" message="Rút đề nghị? Đề tài sẽ về Nháp." confirmLabel="Rút đề nghị" danger busy={withdraw.isPending} error={error}
          onConfirm={() => withdraw.mutate()} onCancel={() => setOpen(false)} />
      )}
    </>
  );
}
