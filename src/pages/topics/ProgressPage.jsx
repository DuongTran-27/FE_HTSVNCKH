import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { progressCreateSchema, progressUpdateSchema } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { execSubmit } from '../../lib/execution.js';
import { fmtDateTime, qs } from '../../lib/format.js';
import { toast } from '../../lib/toast.js';
import { useCooldown } from '../../lib/useCooldown.js';
import { ExecShell } from '../../components/ExecShell.jsx';
import { FeedbackForm, FeedbackList } from '../../components/Feedback.jsx';
import { FormField } from '../../components/FormField.jsx';
import { Badge, FormError, Pager, QueryBox, btnGhost, btnPrimary } from '../../components/ui.jsx';

// Tab Tiến độ – FR10 (API_GD45 §4), nhận xét tiến độ FR12 (§6.2)
export function ProgressPage() {
  return <ExecShell title="Tiến độ">{(t) => <Progress topic={t} />}</ExecShell>;
}

function Progress({ topic: t }) {
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, Number.parseInt(sp.get('page'), 10) || 1);
  const [creating, setCreating] = useState(false);
  const q = useQuery({
    queryKey: ['progress', t.id, page], placeholderData: keepPreviousData,
    queryFn: () => api(`/topics/${t.id}/progress${qs({ page })}`),
  });
  return (
    <div className="space-y-4">
      {t.permissions?.addProgress && (creating
        ? <ProgressForm topic={t} onDone={() => setCreating(false)} />
        : <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>Cập nhật tiến độ</button>)}
      <QueryBox query={q} empty="Chưa có cập nhật tiến độ nào." isEmpty={(d) => d.items.length === 0}>
        {(d) => (
          <>
            <ul className="space-y-3">{d.items.map((p) => <ProgressItem key={p.id} topic={t} p={p} />)}</ul>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(n) => setSp({ page: String(n) })} />
          </>
        )}
      </QueryBox>
    </div>
  );
}

function ProgressItem({ topic: t, p }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  // Chỉ chính tác giả sửa được và chỉ khi chưa bị khóa (FR10); backend kiểm lại
  const canEdit = t.permissions?.addProgress && p.author?.id === user.id && !p.lockedAt;
  return (
    <li className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-bold">{p.percent}%</span>
        <Badge tone="amber">Tự khai</Badge>
        {p.lockedAt && <Badge>Đã được giảng viên hướng dẫn nhận xét – không sửa được</Badge>}
      </div>
      <p className="break-words text-sm text-slate-700">{p.author?.fullName} ({p.author?.code}) · {fmtDateTime(p.createdAt)}</p>
      {editing ? <ProgressForm topic={t} p={p} onDone={() => setEditing(false)} /> : (
        <dl className="space-y-1 break-words">
          <dt className="font-medium">Việc đã làm</dt><dd className="whitespace-pre-wrap">{p.done}</dd>
          <dt className="font-medium">Khó khăn</dt><dd className="whitespace-pre-wrap">{p.issues || '—'}</dd>
          <dt className="font-medium">Kế hoạch tới</dt><dd className="whitespace-pre-wrap">{p.nextPlan}</dd>
        </dl>
      )}
      {canEdit && !editing && <button type="button" className={btnGhost} onClick={() => setEditing(true)}>Sửa</button>}
      <h3 className="font-medium">Nhận xét</h3>
      <FeedbackList items={p.feedbacks} />
      {t.permissions?.giveFeedback && <FeedbackForm topicId={t.id} path={`/progress/${p.id}/feedbacks`} kind="progress" />}
    </li>
  );
}

const FIELDS = ['done', 'issues', 'nextPlan', 'percent'];

function ProgressForm({ topic, p, onDone }) {
  const qc = useQueryClient();
  const cd = useCooldown();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(p ? progressUpdateSchema : progressCreateSchema),
    defaultValues: p ? { done: p.done, issues: p.issues, nextPlan: p.nextPlan, percent: p.percent } : { done: '', issues: '', nextPlan: '', percent: '' },
  });
  const submit = async (body) => {
    const err = await execSubmit(qc, topic.id, setError, FIELDS, async () => {
      await api(p ? `/progress/${p.id}` : `/topics/${topic.id}/progress`, { method: p ? 'PATCH' : 'POST', body });
      toast(p ? 'Đã sửa cập nhật tiến độ' : 'Đã gửi cập nhật tiến độ', { type: 'success' });
      onDone();
    });
    if (err?.status === 429) cd.start(err.retryAfter); // khóa nút đến hết Retry-After
  };
  return (
    <form noValidate onSubmit={handleSubmit(submit)} className="max-w-xl space-y-4 rounded-xl border bg-card p-5 shadow-sm" aria-label={p ? 'Sửa tiến độ' : 'Cập nhật tiến độ'}>
      <FormField label="Việc đã làm" error={errors.done?.message}><textarea rows={3} {...register('done')} /></FormField>
      <FormField label="Khó khăn" error={errors.issues?.message}><textarea rows={2} {...register('issues')} /></FormField>
      <FormField label="Kế hoạch tới" error={errors.nextPlan?.message}><textarea rows={2} {...register('nextPlan')} /></FormField>
      <FormField label="Phần trăm hoàn thành (tự khai, 0–100)" error={errors.percent?.message}>
        <input type="number" min={0} max={100} step={1} inputMode="numeric" {...register('percent', { valueAsNumber: true })} />
      </FormField>
      <FormError error={errors.root?.message} />
      {cd.active && <p role="status" className="text-sm text-amber-900">{cd.message}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={isSubmitting || cd.active} className={btnPrimary}>{isSubmitting ? 'Đang xử lý…' : 'Lưu'}</button>
        <button type="button" onClick={onDone} className={btnGhost}>Hủy</button>
      </div>
    </form>
  );
}
