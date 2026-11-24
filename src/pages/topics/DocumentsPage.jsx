import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_ROUND_CONFIG, DOCUMENT_STAGE_LABEL, MILESTONE_EVAL_LABEL, documentLinkSchema, documentUploadFieldsSchema } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { execSubmit, fileError, fmtSize, useMilestones } from '../../lib/execution.js';
import { fmtDateTime, qs } from '../../lib/format.js';
import { toast } from '../../lib/toast.js';
import { useCooldown } from '../../lib/useCooldown.js';
import { ExecShell } from '../../components/ExecShell.jsx';
import { FeedbackForm, FeedbackList } from '../../components/Feedback.jsx';
import { FormField } from '../../components/FormField.jsx';
import { Badge, FormError, Options, Pager, QueryBox, btnGhost, btnPrimary } from '../../components/ui.jsx';

// Tab Tài liệu – FR11, FR24 (API_GD45 §5), nhận xét bản nộp + đánh giá mốc FR12 (§6.1)
export function DocumentsPage() {
  return <ExecShell title="Tài liệu">{(t) => <Documents topic={t} />}</ExecShell>;
}

function Documents({ topic: t }) {
  const p = t.permissions ?? {};
  const docs = useQuery({ queryKey: ['documents', t.id], queryFn: async () => (await api(`/topics/${t.id}/documents`)).items });
  const ms = useMilestones(t.id);
  const milestones = ms.data ?? [];
  // Chuỗi phiên bản: đề cương hoặc theo mốc (§5.1); API đã sắp theo mốc rồi version giảm dần
  const groups = new Map();
  for (const d of docs.data ?? []) {
    const key = d.milestoneId ?? 'PROPOSAL';
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const groupTitle = (key) => (key === 'PROPOSAL' ? DOCUMENT_STAGE_LABEL.PROPOSAL : `Mốc: ${milestones.find((m) => m.id === key)?.name ?? '…'}`);
  return (
    <div className="space-y-4">
      {(p.uploadProposal || p.uploadMilestone) && <SubmitForm topic={t} milestones={milestones} />}
      <QueryBox query={docs} empty="Chưa có tài liệu nào được nộp." isEmpty={(d) => d.length === 0}>
        {() => [...groups].map(([key, items]) => (
          <section key={key} className="space-y-2">
            <h2 className="break-words font-bold">{groupTitle(key)}</h2>
            <ul className="space-y-2">
              {items.map((d) => <DocumentRow key={d.id} topic={t} d={d} milestone={milestones.find((m) => m.id === d.milestoneId)} />)}
            </ul>
          </section>
        ))}
      </QueryBox>
    </div>
  );
}

function DocumentRow({ topic: t, d, milestone }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // FR24: xin URL ký mỗi lần bấm (kiểm quyền + ghi lịch sử ở server), không lưu URL
  const download = async () => {
    setBusy(true);
    try {
      const { url } = await api(`/documents/${d.id}/download-url`, { method: 'POST', body: {} });
      window.location.assign(url);
    } catch (err) {
      if (!err.sessionExpired) toast(err.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const canEvaluate = t.permissions?.giveFeedback && d.milestoneId && d.isLatest && milestone && milestone.evaluation !== 'PASSED';
  const safeLink = d.externalUrl?.startsWith('https://') ? d.externalUrl : null;
  return (
    <li className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Phiên bản {d.version}</span>
        <Badge>{DOCUMENT_STAGE_LABEL[d.stage] ?? d.stage}</Badge>
        {d.isLatest && <Badge tone="green">Mới nhất</Badge>}
        {d.isLate && <Badge tone="red">Nộp muộn</Badge>}
        {d.kind === 'LINK' && <Badge>Đường dẫn</Badge>}
      </div>
      <p className="break-all">{d.fileName}{d.sizeBytes != null && ` · ${fmtSize(d.sizeBytes)}`}</p>
      <p className="break-words text-sm text-slate-700">{d.uploadedBy?.fullName} · {fmtDateTime(d.uploadedAt)}</p>
      <div className="flex flex-wrap gap-2">
        {d.kind === 'FILE' && <button type="button" className={btnGhost} disabled={busy} onClick={download}>{busy ? 'Đang xử lý…' : 'Tải về'}</button>}
        {safeLink && <a href={safeLink} target="_blank" rel="noopener noreferrer" className={btnGhost}>Mở đường dẫn</a>}
        <button type="button" className={btnGhost} aria-expanded={open} onClick={() => setOpen((v) => !v)}>Nhận xét ({d.feedbackCount ?? 0})</button>
      </div>
      {open && (
        <div className="space-y-2">
          <DocFeedbacks topicId={t.id} documentId={d.id} />
          {t.permissions?.giveFeedback && (
            <FeedbackForm topicId={t.id} path={`/documents/${d.id}/feedbacks`} kind="document" evalMilestone={canEvaluate ? milestone : null} />
          )}
        </div>
      )}
    </li>
  );
}

function DocFeedbacks({ topicId, documentId }) {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['feedbacks', topicId, { documentId, page }], placeholderData: keepPreviousData,
    queryFn: () => api(`/topics/${topicId}/feedbacks${qs({ documentId, page, pageSize: 100 })}`),
  });
  return (
    <QueryBox query={q}>
      {(d) => (<><FeedbackList items={d.items} />{d.total > d.pageSize && <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />}</>)}
    </QueryBox>
  );
}

const FIELDS = ['stage', 'milestoneId', 'file', 'title', 'url'];

/** Nộp file (multipart) hoặc đường dẫn https cho sản phẩm lớn (FR11). Loại/dung lượng kiểm trước ở máy khách, backend kiểm lại */
function SubmitForm({ topic: t, milestones }) {
  const qc = useQueryClient();
  const cd = useCooldown();
  const [kind, setKind] = useState('FILE');
  const cfg = t.round?.effectiveConfig ?? DEFAULT_ROUND_CONFIG;
  const stages = t.permissions?.uploadProposal ? ['PROPOSAL'] : ['MIDTERM', 'FINAL', 'OTHER'];
  const resolver = async (v, c, o) => {
    const base = { stage: v.stage, milestoneId: v.stage === 'PROPOSAL' ? undefined : v.milestoneId || undefined };
    if (kind === 'LINK') return zodResolver(documentLinkSchema)({ ...base, title: v.title, url: v.url }, c, o);
    const r = await zodResolver(documentUploadFieldsSchema)(base, c, o);
    const file = v.file?.[0];
    const fe = fileError(file, cfg);
    if (fe) return { values: {}, errors: { ...r.errors, file: { type: 'client', message: fe } } };
    return Object.keys(r.errors).length ? r : { values: { ...r.values, file }, errors: {} };
  };
  const { register, handleSubmit, setError, reset, watch, formState: { errors, isSubmitting } } = useForm({
    resolver, defaultValues: { stage: stages[0], milestoneId: '', title: '', url: '' },
  });
  const stage = watch('stage');
  const submit = async (v) => {
    const err = await execSubmit(qc, t.id, setError, FIELDS, async () => {
      if (kind === 'LINK') {
        await api(`/topics/${t.id}/documents/links`, { method: 'POST', body: v });
      } else {
        const fd = new FormData();
        fd.append('stage', v.stage);
        if (v.milestoneId) fd.append('milestoneId', v.milestoneId);
        fd.append('file', v.file);
        await api(`/topics/${t.id}/documents`, { method: 'POST', body: fd });
      }
      reset({ stage: v.stage, milestoneId: v.milestoneId ?? '', title: '', url: '' });
      toast('Đã nộp tài liệu', { type: 'success' });
    });
    if (err?.status === 429) cd.start(err.retryAfter);
  };
  return (
    <form noValidate onSubmit={handleSubmit(submit)} className="max-w-xl space-y-4 rounded-xl border bg-card p-5 shadow-sm" aria-label="Nộp tài liệu">
      <h2 className="font-bold">Nộp tài liệu</h2>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="sr-only">Hình thức nộp</legend>
        <label className="inline-flex min-h-11 items-center gap-2"><input type="radio" className="size-5" checked={kind === 'FILE'} onChange={() => setKind('FILE')} /> Tải file lên</label>
        <label className="inline-flex min-h-11 items-center gap-2"><input type="radio" className="size-5" checked={kind === 'LINK'} onChange={() => setKind('LINK')} /> Đường dẫn (mã nguồn, video…)</label>
      </fieldset>
      <FormField label="Loại tài liệu" error={errors.stage?.message}>
        <select {...register('stage')}><Options options={stages.map((s) => ({ value: s, label: DOCUMENT_STAGE_LABEL[s] }))} /></select>
      </FormField>
      {stage !== 'PROPOSAL' && (
        <FormField label="Mốc" error={errors.milestoneId?.message}>
          <select {...register('milestoneId')}>
            <option value="">Chọn mốc</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id} disabled={m.evaluation === 'PASSED'}>
                {m.name}{m.evaluation === 'PASSED' ? ` (${MILESTONE_EVAL_LABEL.PASSED})` : ` – hạn ${fmtDateTime(m.dueAt)}`}
              </option>
            ))}
          </select>
        </FormField>
      )}
      {kind === 'FILE' ? (
        <FormField label="File" error={errors.file?.message} hint={`${cfg.allowedFileTypes.join(', ').toUpperCase()}, tối đa ${cfg.maxFileSizeMB} MB. Nộp sau hạn mốc sẽ bị gắn nhãn nộp muộn.`}>
          <input type="file" accept={cfg.allowedFileTypes.map((x) => `.${x}`).join(',')} className="block w-full min-h-11 text-base" {...register('file')} />
        </FormField>
      ) : (
        <>
          <FormField label="Tên tài liệu" error={errors.title?.message}><input type="text" {...register('title')} /></FormField>
          <FormField label="Đường dẫn (https)" error={errors.url?.message}><input type="url" inputMode="url" {...register('url')} /></FormField>
        </>
      )}
      <FormError error={errors.root?.message} />
      {cd.active && <p role="status" className="text-sm text-amber-800">{cd.message}</p>}
      <button type="submit" disabled={isSubmitting || cd.active} className={btnPrimary}>{isSubmitting ? 'Đang tải lên…' : 'Nộp'}</button>
    </form>
  );
}
