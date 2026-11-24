import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { ACTION_LABEL, topicActionSchema } from '@nckh/shared';
import { api } from '../lib/api.js';
import { invalidateExec } from '../lib/execution.js';
import { applyServerErrors } from '../lib/forms.js';
import { invalidateAfterAction } from '../lib/queries.js';
import { toast } from '../lib/toast.js';
import { closeErrorMessage } from './CloseActions.jsx';
import { FormField } from './FormField.jsx';
import { ReasonDialog } from './ReasonDialog.jsx';
import { btnGhost, btnPrimary, keepOpenOnEscIf, keepOpenOnOutside, useReturnFocus } from './ui.jsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export const DEFENSE_ACTIONS = ['REQUEST_DEFENSE', 'RETURN_FROM_DEFENSE'];

/**
 * Ra hội đồng trên R6 (FR34, FR35; UI §12.7, API_GD7 §5.1, §5.4). `actions` lấy từ topic.availableActions của server.
 * GVHD: "Đề nghị ra hội đồng" (điểm quá trình + nhận xét). Cán bộ: "Trả về đang thực hiện" (lý do bắt buộc).
 */
export function DefenseActions({ topic: t, actions }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null);
  // Mọi lần gửi (thành công hay lỗi) đều tải lại đề tài, dữ liệu thực hiện và hội đồng (phân công có thể bị hủy)
  const after = () => {
    invalidateAfterAction(qc, t.id);
    invalidateExec(qc, t.id);
    qc.invalidateQueries({ queryKey: ['councils'] });
    qc.invalidateQueries({ queryKey: ['council'] });
  };
  const done = (r, message) => { qc.setQueryData(['topic', t.id], r.topic); setDialog(null); toast(`${message} ${t.code}`, { type: 'success' }); };
  const send = (body) => api(`/topics/${t.id}/actions`, { method: 'POST', body: { ...body, version: t.version } }); // version mới nhất (đề tài tải lại sau lỗi 409)
  const returnBack = async (reason) => {
    try {
      done(await send({ action: 'RETURN_FROM_DEFENSE', reason }), 'Đã trả về đang thực hiện đề tài');
    } finally { after(); }
  };
  return (
    <>
      {actions.includes('REQUEST_DEFENSE') && <button type="button" className={btnPrimary} onClick={() => setDialog('REQUEST_DEFENSE')}>{ACTION_LABEL.REQUEST_DEFENSE}</button>}
      {actions.includes('RETURN_FROM_DEFENSE') && <button type="button" className={btnGhost} onClick={() => setDialog('RETURN_FROM_DEFENSE')}>{ACTION_LABEL.RETURN_FROM_DEFENSE}</button>}
      {dialog === 'REQUEST_DEFENSE' && (
        <RequestDefenseDialog topic={t} send={send} onDone={(r) => done(r, 'Đã đề nghị ra hội đồng đề tài')} onSettled={after} onCancel={() => setDialog(null)} />
      )}
      {dialog === 'RETURN_FROM_DEFENSE' && (
        <ReasonDialog title="Trả về đang thực hiện" label="Lý do trả về" confirmLabel={ACTION_LABEL.RETURN_FROM_DEFENSE}
          message="Đề tài về Đang thực hiện. Phân công hội đồng chưa chốt sẽ bị hủy (điểm đã chấm giữ làm lịch sử)."
          onSubmit={returnBack} onCancel={() => setDialog(null)} />
      )}
    </>
  );
}

// Hộp "Đề nghị ra hội đồng": validate bằng topicActionSchema dùng chung (nhánh REQUEST_DEFENSE), server kiểm lại.
// Điểm < 5 chỉ gợi ý tại chỗ, vẫn cho gửi (server trả PROCESS_SCORE_TOO_LOW – UI §12.7).
function RequestDefenseDialog({ topic: t, send, onDone, onSettled, onCancel }) {
  const returnFocus = useReturnFocus();
  const { register, handleSubmit, setError, watch, formState: { errors, isDirty, isSubmitting } } = useForm({
    resolver: zodResolver(topicActionSchema),
    defaultValues: { action: 'REQUEST_DEFENSE', version: t.version, processScore: undefined, processComment: '' },
  });
  const [errorCode, setErrorCode] = useState('');
  const score = watch('processScore');
  const submit = async (body) => {
    setErrorCode('');
    let r;
    try {
      r = await send(body);
    } catch (err) {
      onSettled();
      if (err.sessionExpired) return;
      setErrorCode(err.code);
      const msgs = err.code === 'MILESTONES_NOT_PASSED' ? [closeErrorMessage(err)] : applyServerErrors(err, setError, ['processScore', 'processComment']);
      if (msgs.length) setError('root', { message: msgs.join(' ') });
      return;
    }
    onSettled();
    onDone(r);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent showCloseButton={false} {...keepOpenOnOutside} {...keepOpenOnEscIf(isDirty)} {...returnFocus} className="sm:max-w-lg">
        <form noValidate onSubmit={handleSubmit(submit)} className="space-y-3">
          <DialogTitle>Đề nghị ra hội đồng</DialogTitle>
          <DialogDescription className="text-amber-900">Sau khi gửi, sinh viên không nộp hoặc sửa tài liệu được nữa.</DialogDescription>
          <FormField label="Điểm quá trình (thang 10)" error={errors.processScore?.message}
            hint={Number.isFinite(score) && score < 5 ? 'Không đủ điều kiện ra hội đồng (dưới 5,0). Hãy nhập kết quả Không đạt và gửi đóng.' : 'Tối đa 2 chữ số thập phân, ví dụ 7,25'}>
            <input type="number" inputMode="decimal" min={0} max={10} step={0.25} {...register('processScore', { valueAsNumber: true })} />
          </FormField>
          <FormField label="Nhận xét quá trình" error={errors.processComment?.message} hint="Tối thiểu 20 ký tự">
            <textarea rows={5} maxLength={5000} {...register('processComment')} />
          </FormField>
          {errors.root?.message && (
            <p role="alert" className="break-words text-sm text-red-700">
              {errors.root.message}
              {errorCode === 'NO_FINAL_REPORT' && <> <Link to={`/de-tai/${t.id}/tai-lieu`} className="font-medium underline underline-offset-4">Mở tab Tài liệu</Link></>}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onCancel} className={btnGhost}>Hủy</button>
            <button type="submit" disabled={isSubmitting} className={btnPrimary}>{isSubmitting ? 'Đang xử lý…' : 'Gửi đề nghị'}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
