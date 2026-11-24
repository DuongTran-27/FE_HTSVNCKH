import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ACTION_LABEL } from '@nckh/shared';
import { api } from '../lib/api.js';
import { invalidateAfterAction } from '../lib/queries.js';
import { toast } from '../lib/toast.js';
import { ConfirmDialog, btnDanger, btnPrimary } from './ui.jsx';
import { ReasonDialog } from './ReasonDialog.jsx';

export const RECRUIT_ACTIONS = ['PUBLISH_RECRUITMENT', 'UNPUBLISH_RECRUITMENT', 'FINALIZE_GROUP'];

/**
 * Action tuyển sinh viên của giảng viên (FR31, FR33; UI §12.5), dùng ở R6 và R29. `actions` là topic.availableActions của server.
 * Công bố đi qua trang riêng (kiểm trùng FR06 ở đó); ngừng tuyển cần lý do; chốt nhóm cần xác nhận.
 * Lỗi nghiệp vụ (GROUP_TOO_SMALL, CONCURRENT_UPDATE...) hiện ngay trong hộp thoại bằng err.message của server.
 */
export function RecruitActions({ topic, actions }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null); // 'UNPUBLISH_RECRUITMENT' | 'FINALIZE_GROUP'
  const [error, setError] = useState('');
  const send = (body) => api(`/topics/${topic.id}/actions`, { method: 'POST', body: { version: topic.version, ...body } });
  const done = (r, message) => { qc.setQueryData(['topic', topic.id], r.topic); setDialog(null); toast(message, { type: 'success' }); };
  const finalize = useMutation({
    mutationFn: () => send({ action: 'FINALIZE_GROUP' }),
    onSuccess: (r) => done(r, 'Đã chốt nhóm'),
    onError: (err) => { if (!err.sessionExpired) setError(err.message); },
    onSettled: () => invalidateAfterAction(qc, topic.id),
  });
  const unpublish = async (reason) => {
    try {
      done(await send({ action: 'UNPUBLISH_RECRUITMENT', reason }), 'Đã ngừng tuyển, đề tài về Nháp');
    } finally { invalidateAfterAction(qc, topic.id); }
  };
  const open = (d) => { setError(''); setDialog(d); };
  const accepted = topic.acceptedCount ?? 0;
  return (
    <>
      {actions.includes('PUBLISH_RECRUITMENT') && <Link to={`/de-tai/${topic.id}/cong-bo`} className={btnPrimary}>{ACTION_LABEL.PUBLISH_RECRUITMENT}</Link>}
      {actions.includes('FINALIZE_GROUP') && <button type="button" className={btnPrimary} onClick={() => open('FINALIZE_GROUP')}>{ACTION_LABEL.FINALIZE_GROUP}</button>}
      {actions.includes('UNPUBLISH_RECRUITMENT') && <button type="button" className={btnDanger} onClick={() => open('UNPUBLISH_RECRUITMENT')}>{ACTION_LABEL.UNPUBLISH_RECRUITMENT}</button>}
      {dialog === 'FINALIZE_GROUP' && (
        <ConfirmDialog title="Chốt nhóm" confirmLabel="Chốt nhóm" busy={finalize.isPending} error={error}
          message={`Đóng ứng tuyển với ${accepted} sinh viên đã nhận. Các đơn còn chờ sẽ bị từ chối và đề tài chuyển sang bước gửi xét duyệt.`}
          onConfirm={() => finalize.mutate()} onCancel={() => setDialog(null)} />
      )}
      {dialog === 'UNPUBLISH_RECRUITMENT' && (
        <ReasonDialog title="Ngừng tuyển" label="Lý do ngừng tuyển" confirmLabel="Ngừng tuyển" onSubmit={unpublish} onCancel={() => setDialog(null)}
          message={(
            <>
              Đề tài về Nháp; các đơn đang chờ bị từ chối.
              {accepted > 0 && <strong className="mt-1 block text-red-700">{accepted} sinh viên đã nhận sẽ bị gỡ khỏi đề tài.</strong>}
            </>
          )} />
      )}
    </>
  );
}
