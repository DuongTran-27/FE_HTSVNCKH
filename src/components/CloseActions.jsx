import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ACTION_LABEL } from '@nckh/shared';
import { api } from '../lib/api.js';
import { invalidateExec } from '../lib/execution.js';
import { fmtDateTime } from '../lib/format.js';
import { invalidateAfterAction } from '../lib/queries.js';
import { toast } from '../lib/toast.js';
import { ConfirmDialog, btnDanger, btnGhost, btnPrimary } from './ui.jsx';
import { ReasonDialog } from './ReasonDialog.jsx';

export const CLOSE_ACTIONS = ['REQUEST_CLOSE', 'CONFIRM_CLOSE', 'RETURN_TO_ADVISOR', 'CLOSE_EXPIRED'];
const DONE = {
  REQUEST_CLOSE: 'Đã gửi đề nghị đóng đề tài', CONFIRM_CLOSE: 'Đã đóng đề tài',
  RETURN_TO_ADVISOR: 'Đã trả lại giảng viên hướng dẫn', CLOSE_EXPIRED: 'Đã đóng đề tài với kết quả Không đạt',
};

/** Thông điệp lỗi đóng đề tài; MILESTONES_NOT_PASSED kèm tên mốc chưa Đạt (API_GD45 §2) */
export const closeErrorMessage = (err) => {
  const names = err.code === 'MILESTONES_NOT_PASSED' ? (err.details?.milestones ?? []).map((m) => m.name) : [];
  return names.length ? `${err.message}: ${names.join(', ')}` : err.message;
};

const readinessText = (r) => (r
  ? ` Mốc bắt buộc: ${r.requiredMilestoneCount - r.pendingMilestones}/${r.requiredMilestoneCount} Đạt; kết quả cuối: ${r.hasFinalResult ? 'đã có' : 'chưa có'}.`
    + (r.requiredRemovedCount > 0 ? ` Lưu ý: ${r.requiredRemovedCount} mốc chưa Đạt đã bị bỏ cờ bắt buộc.` : '')
  : '');

/**
 * Đóng đề tài – FR27 (API_GD45 §7). `actions` lấy từ topic.availableActions của server; điều kiện dữ liệu (closeReadiness,
 * round.ended) chỉ để gợi ý, không ẩn nút – backend kiểm lại dưới khóa.
 * CONCURRENT_UPDATE / INVALID_TRANSITION: đóng hộp, toast, tải lại. Lỗi điều kiện (409 khác): hiện trong hộp, tải lại.
 */
export function CloseActions({ topic: t, actions }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState('');
  const after = () => { invalidateAfterAction(qc, t.id); invalidateExec(qc, t.id); };
  const send = (action, reason) => api(`/topics/${t.id}/actions`, { method: 'POST', body: { action, version: t.version, ...(reason !== undefined && { reason }) } });
  const ok = (action, r) => { qc.setQueryData(['topic', t.id], r.topic); setDialog(null); toast(`${DONE[action]} ${t.code}`, { type: 'success' }); };
  // true = đã xử lý bằng toast (hộp đóng, dữ liệu tải lại)
  const stale = (err) => {
    if (err.code !== 'CONCURRENT_UPDATE' && err.code !== 'INVALID_TRANSITION') return false;
    setDialog(null);
    toast(`${err.message}. Đã tải lại đề tài.`, { type: 'error' });
    return true;
  };
  const confirm = useMutation({
    mutationFn: (action) => send(action),
    onSuccess: (r, action) => ok(action, r),
    onError: (err) => { if (!err.sessionExpired && !stale(err)) setError(closeErrorMessage(err)); },
    onSettled: after,
  });
  const withReason = (action) => async (reason) => {
    let r;
    try {
      r = await send(action, reason);
    } catch (err) {
      after();
      if (stale(err)) return;
      throw err;
    }
    after();
    ok(action, r);
  };
  const open = (d) => { setError(''); setDialog(d); };
  const has = (a) => actions.includes(a);
  return (
    <>
      {has('REQUEST_CLOSE') && <button type="button" className={btnPrimary} onClick={() => open('REQUEST_CLOSE')}>{ACTION_LABEL.REQUEST_CLOSE}</button>}
      {has('CONFIRM_CLOSE') && <button type="button" className={btnPrimary} onClick={() => open('CONFIRM_CLOSE')}>{ACTION_LABEL.CONFIRM_CLOSE}</button>}
      {has('RETURN_TO_ADVISOR') && <button type="button" className={btnGhost} onClick={() => open('RETURN_TO_ADVISOR')}>{ACTION_LABEL.RETURN_TO_ADVISOR}</button>}
      {has('CLOSE_EXPIRED') && <button type="button" className={btnDanger} onClick={() => open('CLOSE_EXPIRED')}>{ACTION_LABEL.CLOSE_EXPIRED}</button>}
      {(dialog === 'REQUEST_CLOSE' || dialog === 'CONFIRM_CLOSE') && (
        <ConfirmDialog
          title={ACTION_LABEL[dialog]} confirmLabel={ACTION_LABEL[dialog]} busy={confirm.isPending} error={error}
          message={(dialog === 'REQUEST_CLOSE'
            ? `Gửi đề nghị đóng đề tài ${t.code}? Cán bộ khoa sẽ xem lại; trong lúc chờ không sửa được mốc, tiến độ, tài liệu, kết quả.`
              // DC-15 (UI §12.7): đợt bắt buộc bảo vệ → nhắc trước; server vẫn trả DEFENSE_REQUIRED nếu chưa đủ điều kiện
              + (t.round?.effectiveConfig?.requireDefense ? ' Đợt này bắt buộc bảo vệ trước hội đồng (trừ kết quả Không đạt hoặc kết quả do hội đồng chốt).' : '')
            : `Đóng đề tài ${t.code}? Hệ thống kiểm tra lại điều kiện theo đánh giá hiện hành; sau khi đóng hồ sơ chỉ đọc.`) + readinessText(t.closeReadiness)}
          onConfirm={() => confirm.mutate(dialog)} onCancel={() => setDialog(null)}
        />
      )}
      {dialog === 'RETURN_TO_ADVISOR' && (
        <ReasonDialog title="Trả lại giảng viên hướng dẫn" message="Đề tài về Đang thực hiện; kết quả và mốc giữ nguyên." label="Lý do trả lại"
          confirmLabel={ACTION_LABEL.RETURN_TO_ADVISOR} onSubmit={withReason('RETURN_TO_ADVISOR')} onCancel={() => setDialog(null)} />
      )}
      {dialog === 'CLOSE_EXPIRED' && (
        <ReasonDialog title="Đóng đề tài – kết quả Không đạt" label="Lý do đóng" confirmLabel={ACTION_LABEL.CLOSE_EXPIRED}
          message={`${t.round?.ended ? 'Đợt đã kết thúc.' : `Đợt chưa kết thúc (kết thúc ${fmtDateTime(t.round?.endAt)}) – hệ thống sẽ từ chối.`} Đề tài sẽ đóng với kết quả Không đạt, không hoàn tác được. Có thể gia hạn mốc thay vì đóng.`}
          onSubmit={withReason('CLOSE_EXPIRED')} onCancel={() => setDialog(null)} />
      )}
    </>
  );
}
