import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { MILESTONE_EVAL_LABEL, documentFeedbackSchema, progressFeedbackSchema } from '@nckh/shared';
import { api } from '../lib/api.js';
import { execSubmit } from '../lib/execution.js';
import { fmtDateTime } from '../lib/format.js';
import { toast } from '../lib/toast.js';
import { FormField } from './FormField.jsx';
import { Badge, FormError, btnPrimary } from './ui.jsx';

/** Danh sách nhận xét (FeedbackView) – giữ tên người viết (FR19) */
export function FeedbackList({ items }) {
  if (!items?.length) return <p className="text-sm text-slate-700">Chưa có nhận xét.</p>;
  return (
    <ul className="space-y-2">
      {items.map((f) => (
        <li key={f.id} className="break-words rounded-md bg-blue-50 p-2 text-sm">
          <p className="font-medium">
            {f.lecturer?.fullName} · {fmtDateTime(f.createdAt)}
            {f.evaluation && <> · <Badge tone={f.evaluation === 'PASSED' ? 'green' : 'amber'}>{MILESTONE_EVAL_LABEL[f.evaluation]}</Badge></>}
          </p>
          <p className="whitespace-pre-wrap">{f.content}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Nhận xét của GVHD (FR12). path: '/documents/:id/feedbacks' hoặc '/progress/:id/feedbacks'.
 * evalMilestone: mốc được phép đánh giá kèm (bản mới nhất, mốc chưa Đạt) – gửi milestoneVersion làm khóa lạc quan.
 */
export function FeedbackForm({ topicId, path, kind, evalMilestone }) {
  const qc = useQueryClient();
  const schema = kind === 'progress' ? progressFeedbackSchema : documentFeedbackSchema;
  const resolver = (v, c, o) => zodResolver(schema)({
    content: v.content, ...(v.evaluation && { evaluation: v.evaluation, milestoneVersion: evalMilestone?.version }),
  }, c, o);
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm({ resolver, defaultValues: { content: '', evaluation: '' } });
  const submit = (body) => execSubmit(qc, topicId, setError, ['content', 'evaluation'], async () => {
    await api(path, { method: 'POST', body });
    reset();
    toast(body.evaluation ? 'Đã nhận xét và đánh giá mốc' : 'Đã gửi nhận xét', { type: 'success' });
  });
  return (
    <form noValidate onSubmit={handleSubmit(submit)} className="space-y-2" aria-label="Nhận xét">
      <FormField label="Nhận xét của giảng viên hướng dẫn" error={errors.content?.message}><textarea rows={3} {...register('content')} /></FormField>
      {evalMilestone && (
        <FormField label="Đánh giá mốc" error={errors.evaluation?.message} hint="Đánh giá luôn gắn với bản nộp mới nhất của mốc">
          <select {...register('evaluation')}>
            <option value="">Không đánh giá</option>
            <option value="PASSED">{MILESTONE_EVAL_LABEL.PASSED}</option>
            <option value="NEEDS_WORK">{MILESTONE_EVAL_LABEL.NEEDS_WORK}</option>
          </select>
        </FormField>
      )}
      {kind === 'progress' && <p className="text-sm text-slate-700">Sau khi nhận xét, sinh viên không sửa được bản cập nhật này.</p>}
      <FormError error={errors.root?.message} />
      <button type="submit" disabled={isSubmitting} className={btnPrimary}>{isSubmitting ? 'Đang xử lý…' : 'Gửi nhận xét'}</button>
    </form>
  );
}
