import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FINAL_RESULT, FINAL_RESULT_LABEL, finalResultSchema, resultCorrectionSchema } from '@nckh/shared';
import { api } from '../lib/api.js';
import { EXEC_STATUSES, execSubmit } from '../lib/execution.js';
import { fmtDateTime } from '../lib/format.js';
import { toast } from '../lib/toast.js';
import { FormField } from './FormField.jsx';
import { Badge, FormError, Options, QueryBox, btnGhost, btnPrimary } from './ui.jsx';

const ResultLine = ({ r }) => (
  <>
    <p className="flex flex-wrap items-center gap-2">
      <Badge tone={r.result === 'FAIL' ? 'red' : 'green'}>{FINAL_RESULT_LABEL[r.result] ?? r.result}</Badge>
      {r.source === 'COUNCIL' && <Badge tone="blue">Biên bản hội đồng</Badge>}
      <span className="text-sm text-slate-700">Phiên bản {r.version} · {r.createdBy?.fullName} · {fmtDateTime(r.createdAt)}</span>
    </p>
    <p className="whitespace-pre-wrap break-words">{r.summary}</p>
    {r.reason && <p className="whitespace-pre-wrap break-words text-sm">Lý do sửa: {r.reason}</p>}
  </>
);

/**
 * Kết quả cuối có phiên bản (FR12, API_GD45 §6.4) + điều kiện đóng (closeReadiness, §7.4) trên R6.
 * SV thấy kết quả ngay khi GVHD nhập (CAU_HOI #9). Nhập khi permissions.enterResult.
 */
export function ResultSection({ topic: t }) {
  const show = t.permissions?.readExecution && EXEC_STATUSES.includes(t.status);
  const q = useQuery({ queryKey: ['results', t.id], enabled: !!show, queryFn: () => api(`/topics/${t.id}/results`) });
  if (!show) return null;
  return (
    <div className="space-y-2">
      <h2 className="font-bold">Kết quả cuối</h2>
      <CloseReadiness r={t.closeReadiness} />
      <QueryBox query={q}>
        {({ current, items }) => (
          <>
            {current ? <ResultLine r={current} /> : <p className="text-slate-700">Chưa có kết quả cuối.</p>}
            {items.length > 1 && (
              <details>
                <summary className="min-h-11 cursor-pointer py-2 text-blue-700 underline-offset-4 hover:underline">Các phiên bản trước ({items.length - 1})</summary>
                <ul className="space-y-2">{items.filter((r) => !r.isCurrent).map((r) => <li key={r.id} className="rounded-md bg-slate-50 p-2"><ResultLine r={r} /></li>)}</ul>
              </details>
            )}
            {/* Kết quả hiện hành do hội đồng chốt: GVHD không nhập lại (UI §12.9; server trả COUNCIL_RESULT_LOCKED nếu cố gửi) */}
            {t.permissions?.enterResult && (current?.source === 'COUNCIL'
              ? <p role="note" className="rounded-md bg-blue-50 p-3 text-sm text-blue-900">Kết quả do hội đồng quyết định.</p>
              : <ResultForm topic={t} expectedVersion={current?.version ?? 0} />)}
            {t.permissions?.correctResult && current && <CorrectResult topic={t} current={current} />}
          </>
        )}
      </QueryBox>
    </div>
  );
}

function CloseReadiness({ r }) {
  if (!r) return null;
  const ok = (v) => (v ? 'Đạt' : 'Chưa đạt');
  return (
    <div role="note" className="rounded-md bg-slate-50 p-3 text-sm">
      <p className="font-medium">Điều kiện đóng đề tài</p>
      <ul className="list-disc pl-5">
        <li>
          Mốc bắt buộc: {r.requiredMilestoneCount === 0 ? 'chưa có mốc bắt buộc nào' : `${r.requiredMilestoneCount - r.pendingMilestones}/${r.requiredMilestoneCount} Đạt`} – {ok(r.requiredMilestonesPassed)}
        </li>
        <li>Kết quả cuối và nhận xét tổng kết của giảng viên hướng dẫn – {r.hasFinalResult ? 'đã có' : 'chưa có'}</li>
      </ul>
      {r.requiredRemovedCount > 0 && <p className="mt-1 text-amber-800">Lưu ý: {r.requiredRemovedCount} mốc chưa Đạt đã bị bỏ cờ bắt buộc.</p>}
    </div>
  );
}

function ResultForm({ topic, expectedVersion }) {
  const qc = useQueryClient();
  // expectedVersion = phiên bản hiện hành GV đang thấy lúc bấm gửi (khóa lạc quan); form không dựng lại khi tải lại để giữ chữ đã nhập
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(finalResultSchema), defaultValues: { result: '', summary: '', expectedVersion: 0 },
  });
  const submit = (body) => execSubmit(qc, topic.id, setError, ['result', 'summary'], async () => {
    await api(`/topics/${topic.id}/results`, { method: 'POST', body: { ...body, expectedVersion } });
    reset();
    toast('Đã lưu kết quả cuối', { type: 'success' });
  });
  return (
    <form noValidate onSubmit={handleSubmit(submit)} className="max-w-xl space-y-4 rounded-xl border bg-card p-5 shadow-sm" aria-label="Nhập kết quả cuối">
      <p className="font-medium">{expectedVersion ? 'Nhập lại kết quả (tạo phiên bản mới)' : 'Nhập kết quả cuối'}</p>
      <FormField label="Kết quả" error={errors.result?.message}>
        <select {...register('result')}><Options placeholder="Chọn kết quả" options={Object.values(FINAL_RESULT).map((v) => ({ value: v, label: FINAL_RESULT_LABEL[v] }))} /></select>
      </FormField>
      <FormField label="Nhận xét tổng kết" error={errors.summary?.message}><textarea rows={4} {...register('summary')} /></FormField>
      <FormError error={errors.root?.message} />
      <button type="submit" disabled={isSubmitting} className={btnPrimary}>{isSubmitting ? 'Đang xử lý…' : 'Lưu kết quả'}</button>
    </form>
  );
}

/** FR23 – cán bộ sửa sai kết quả đã đóng (permissions.correctResult): tạo phiên bản mới kèm lý do, API_GD6 §7 */
function CorrectResult({ topic, current }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className={btnGhost} onClick={() => setOpen(true)}>Sửa kết quả</button>;
  return <CorrectionForm topic={topic} current={current} onClose={() => setOpen(false)} />;
}

function CorrectionForm({ topic, current, onClose }) {
  const qc = useQueryClient();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    // summary bỏ trống / không đổi = giữ nhận xét tổng kết hiện hành (không gửi)
    resolver: (v, c, o) => zodResolver(resultCorrectionSchema)(strip(v, current), c, o),
    defaultValues: { result: current.result, summary: current.summary, reason: '' },
  });
  const submit = async (v) => {
    // expectedVersion = phiên bản hiện hành cán bộ đang thấy lúc bấm gửi (khóa lạc quan)
    const err = await execSubmit(qc, topic.id, setError, ['result', 'summary', 'reason'], async () => {
      await api(`/topics/${topic.id}/result-corrections`, { method: 'POST', body: { ...strip(v, current), expectedVersion: current.version } });
      toast('Đã sửa kết quả, tạo phiên bản mới', { type: 'success' });
      onClose();
    });
    if (err?.status === 429) setError('root', { message: err.message });
  };
  return (
    <form noValidate onSubmit={handleSubmit(submit)} className="max-w-xl space-y-4 rounded-xl border bg-card p-5 shadow-sm" aria-label="Sửa kết quả">
      <p className="font-medium">Sửa kết quả (tạo phiên bản {current.version + 1}, phiên bản cũ vẫn được lưu)</p>
      <FormField label="Kết quả" error={errors.result?.message}>
        <select {...register('result')}><Options options={Object.values(FINAL_RESULT).map((v) => ({ value: v, label: FINAL_RESULT_LABEL[v] }))} /></select>
      </FormField>
      <FormField label="Nhận xét tổng kết" hint="Giữ nguyên nếu không cần đổi" error={errors.summary?.message}><textarea rows={4} {...register('summary')} /></FormField>
      <FormField label="Lý do sửa" error={errors.reason?.message}><textarea rows={3} {...register('reason')} /></FormField>
      <FormError error={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={isSubmitting} className={btnPrimary}>{isSubmitting ? 'Đang xử lý…' : 'Lưu phiên bản mới'}</button>
        <button type="button" onClick={onClose} className={btnGhost}>Hủy</button>
      </div>
    </form>
  );
}

const strip = (v, current) => {
  const summary = v.summary?.trim();
  return { result: v.result, reason: v.reason, expectedVersion: current.version, ...(summary && summary !== current.summary?.trim() ? { summary } : {}) };
};
