import { useEffect, useState } from 'react';
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { countWords } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { applyServerErrors } from '../../lib/forms.js';
import { useCatalog, useSimilarityLatest } from '../../lib/queries.js';
import { PUBLISH_FIELDS, SUBMIT_FIELDS, editSchemaFor, submitProblems, topicToForm } from '../../lib/topicForm.js';
import { toast } from '../../lib/toast.js';
import { useCooldown } from '../../lib/useCooldown.js';
import { FormField, inputClass } from '../../components/FormField.jsx';
import { SimilarityPanel } from '../../components/SimilarityPanel.jsx';
import { ArrowLeft, CircleAlert, CircleCheck, FileText, Megaphone, Save, ScanSearch, Tags, X } from 'lucide-react';
import { ConfirmDialog, Options, QueryBox, btnGhost, btnPrimary, card, keepOpenOnOutside, useReturnFocus } from '../../components/ui.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';

/** Một mục của form: biểu tượng + tiêu đề + mô tả ngắn, nội dung bên dưới */
function Section({ icon: Icon, title, description, children }) {
  return (
    <div className={`${card} space-y-5`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><Icon className="size-[18px]" /></span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

const FIELD_NAMES = ['title', 'summary', 'objectives', 'keywords', 'fieldId', 'requirements', 'recruitSlots'];

// R7 – UI §4.7; R7' (UI §12.5) khi topic.origin === 'LECTURER': thêm yêu cầu ứng viên + số sinh viên cần tuyển, điều kiện đủ = topicPublishSchema. Chỉ dựng form khi đã có dữ liệu; tải lại ngầm không được unmount form (mất chữ đang nhập).
export function TopicEditPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ['topic', id], queryFn: async () => (await api(`/topics/${id}`)).topic });
  if (query.data) return <EditForm topic={query.data} />;
  return <section><QueryBox query={query}>{() => null}</QueryBox></section>;
}

function KeywordsInput({ value, max, onChange, error }) {
  const [text, setText] = useState('');
  const add = () => {
    const k = text.trim().replace(/,$/, '').trim();
    if (k && !value.includes(k) && value.length < max) onChange([...value, k]);
    setText('');
  };
  return (
    <FormField label="Từ khóa" error={error} hint={`${value.length}/${max} từ khóa. Nhấn Enter hoặc dấu phẩy để thêm.`}>
      <input type="text" value={text} disabled={value.length >= max} onChange={(e) => setText(e.target.value)} onBlur={add}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }} />
    </FormField>
  );
}

// Không có Esc: phải chọn một trong hai để không mất/ghi đè dữ liệu ngoài ý muốn
export function ConflictDialog({ onTakeNew, onKeepMine }) {
  const returnFocus = useReturnFocus();
  return (
    <Dialog open>
      <DialogContent showCloseButton={false} onEscapeKeyDown={(e) => e.preventDefault()} {...keepOpenOnOutside} {...returnFocus} className="sm:max-w-md">
        <DialogTitle>Hồ sơ vừa được thành viên khác cập nhật</DialogTitle>
        <DialogDescription>Chọn tải bản mới (bỏ thay đổi của bạn) hoặc giữ nội dung của bạn rồi lưu lại để ghi đè.</DialogDescription>
        <DialogFooter>
          <button type="button" onClick={onTakeNew} className={btnGhost}>Tải bản mới (bỏ thay đổi của tôi)</button>
          <button type="button" onClick={onKeepMine} className={btnPrimary}>Giữ nội dung của tôi</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ topic }) {
  const { id } = topic;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const incomplete = useLocation().state?.incomplete;
  // R7: giá trị ban đầu nạp đúng một lần. Về sau chỉ `topic.version` đọc từ cache được cập nhật, không đụng ô đang nhập.
  const [initial] = useState(() => topicToForm(topic));
  const { register, handleSubmit, setError, setValue, reset, watch, formState: { errors, isDirty } } = useForm({
    resolver: zodResolver(editSchemaFor(topic)), defaultValues: initial,
  });
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [formError, setFormError] = useState('');
  const [check, setCheck] = useState(null);
  const cd = useCooldown();
  const fields = useCatalog('fields');
  const latest = useSimilarityLatest(id, topic.permissions?.checkSimilarity);
  const cfg = topic.round.effectiveConfig;
  const values = watch();
  const recruit = topic.origin === 'LECTURER';
  const conditions = recruit ? PUBLISH_FIELDS : SUBMIT_FIELDS;
  const problems = submitProblems(values, cfg, recruit);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!topic.permissions?.edit) {
      toast('Chỉ sửa được hồ sơ ở trạng thái Nháp hoặc Cần chỉnh sửa', { type: 'error' });
      navigate(`/de-tai/${id}`, { replace: true });
    }
  }, [topic.permissions?.edit, id, navigate]);
  useEffect(() => { if (incomplete) applyServerErrors({ code: 'TOPIC_INCOMPLETE', details: incomplete }, setError, FIELD_NAMES); }, [incomplete, setError]);
  useEffect(() => {
    if (!isDirty) return undefined;
    const h = (e) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [isDirty]);

  /** PUT đủ mọi trường (API §5.1). Ném lại lỗi sau khi đã xử lý để "Kiểm tra trước" dừng. */
  const save = async (v) => {
    setFormError('');
    try {
      const r = await api(`/topics/${id}`, { method: 'PUT', body: { ...v, fieldId: v.fieldId || null, version: topic.version } });
      qc.setQueryData(['topic', id], r.topic);
      qc.invalidateQueries({ queryKey: ['similarity-latest', id] });
      qc.invalidateQueries({ queryKey: ['topics'] });
      reset(topicToForm(r.topic));
      toast('Đã lưu nháp', { type: 'success' });
      return r.topic;
    } catch (err) {
      if (err.sessionExpired) throw err;
      if (err.code === 'CONCURRENT_UPDATE') { qc.invalidateQueries({ queryKey: ['topic', id] }); setConflict(true); }
      else if (err.code === 'TOPIC_NOT_EDITABLE') { toast(err.message, { type: 'error' }); qc.invalidateQueries({ queryKey: ['topic', id] }); navigate(`/de-tai/${id}`, { replace: true }); }
      else setFormError(applyServerErrors(err, setError, FIELD_NAMES).join(' '));
      throw err;
    }
  };
  const onSave = handleSubmit(async (v) => { setBusy(true); try { await save(v); } catch { /* đã hiển thị */ } finally { setBusy(false); } });
  const onCheck = handleSubmit(async (v) => {
    setBusy(true);
    try {
      if (isDirty) await save(v); // API §7.1 so nội dung đã lưu
      const r = await api(`/topics/${id}/similarity-checks`, { method: 'POST' });
      setCheck(r.similarityCheck);
      qc.invalidateQueries({ queryKey: ['similarity-latest', id] });
      qc.invalidateQueries({ queryKey: ['topic', id] });
      qc.invalidateQueries({ queryKey: ['topics'] });
    } catch (err) {
      if (err.status === 429) cd.start(err.retryAfter);
      if (!err.sessionExpired && err.code !== 'CONCURRENT_UPDATE' && err.code !== 'TOPIC_NOT_EDITABLE' && err.code !== 'VALIDATION_ERROR') setFormError(err.message);
    } finally { setBusy(false); }
  });
  const keepMine = async () => { await qc.refetchQueries({ queryKey: ['topic', id] }); setConflict(false); };
  const takeNew = async () => {
    await qc.refetchQueries({ queryKey: ['topic', id] });
    const data = qc.getQueryData(['topic', id]);
    if (data) reset(topicToForm(data));
    setConflict(false);
  };

  const options = fields.data ?? [];
  const inactiveField = topic.field && !options.some((f) => f.id === topic.field.id) && fields.data ? topic.field : null;
  const fieldValue = values.fieldId;
  const showInactive = inactiveField && fieldValue === inactiveField.id;
  const words = countWords(values.summary);

  const passed = conditions.filter(([k]) => !problems[k]).length;
  const keywordError = errors.keywords?.message ?? Object.entries(errors.keywords ?? {}).map(([, e]) => e?.message).find(Boolean);

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p data-testid="topic-code" className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tracking-wide text-muted-foreground tabular-nums">{topic.code}</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Soạn hồ sơ</h1>
          <p className="mt-1 text-sm text-muted-foreground">{topic.round.name} · Lưu nháp thường xuyên; {recruit ? 'chỉ công bố tuyển sinh viên khi đủ mọi điều kiện.' : 'chỉ gửi xét duyệt khi đủ mọi điều kiện.'}</p>
        </div>
        <Link to={`/de-tai/${id}`} className={btnGhost}><ArrowLeft aria-hidden="true" className="size-4" />Về chi tiết</Link>
      </div>

      <form noValidate onSubmit={onSave} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Section icon={FileText} title="Thông tin chung" description="Tên đề tài và lĩnh vực nghiên cứu.">
            <FormField label="Tên đề tài" error={errors.title?.message}><input type="text" {...register('title')} /></FormField>
            <FormField label="Lĩnh vực" error={errors.fieldId?.message ?? (showInactive ? 'Lĩnh vực này đã ngừng dùng, hãy chọn lĩnh vực khác trước khi lưu' : undefined)}>
              {/* key: dựng lại khi danh mục tải xong để ô hiện đúng lĩnh vực đã lưu (option đến sau khi form gắn giá trị) */}
              <select key={options.length} {...register('fieldId')} className={inputClass}>
                <Options placeholder="Chọn lĩnh vực" options={[...(inactiveField ? [{ value: inactiveField.id, label: `${inactiveField.name} (Ngừng dùng)` }] : []), ...options.map((f) => ({ value: f.id, label: f.name }))]} />
              </select>
            </FormField>
          </Section>

          <Section icon={ScanSearch} title="Nội dung" description="Tóm tắt và mục tiêu được dùng để kiểm tra trùng lặp.">
            <FormField label="Tóm tắt" error={errors.summary?.message} hint={`${words}/${cfg.minSummaryWords} từ`}><textarea rows={7} {...register('summary')} /></FormField>
            <FormField label="Mục tiêu" error={errors.objectives?.message}><textarea rows={4} {...register('objectives')} /></FormField>
          </Section>

          {recruit && (
            <Section icon={Megaphone} title="Tuyển sinh viên" description="Yêu cầu đối với ứng viên và số sinh viên cần tuyển cho đề tài.">
              <FormField label="Yêu cầu ứng viên" error={errors.requirements?.message}><textarea rows={4} {...register('requirements')} /></FormField>
              <FormField label="Số sinh viên cần tuyển" error={errors.recruitSlots?.message} hint={`Từ 1 đến ${cfg.maxMembers} sinh viên`}>
                {/* Ô trống → null (nháp chưa nhập), khác 0: để schema báo "ít nhất 1" */}
                <input type="number" inputMode="numeric" min={1} max={cfg.maxMembers} {...register('recruitSlots', { setValueAs: (v) => (v === '' || v == null ? null : Number(v)) })} />
              </FormField>
            </Section>
          )}

          <Section icon={Tags} title="Từ khóa" description={`Tối đa ${cfg.maxKeywords} từ khóa, mỗi từ khóa là một cụm chuyên môn ngắn.`}>
            <KeywordsInput value={values.keywords ?? []} max={cfg.maxKeywords} error={keywordError}
              onChange={(k) => setValue('keywords', k, { shouldDirty: true, shouldValidate: true })} />
            {values.keywords?.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Danh sách từ khóa">
                {values.keywords.map((k) => (
                  <li key={k} className="inline-flex items-center gap-1 rounded-full border bg-accent py-1 pr-1 pl-3 text-sm font-medium text-blue-800">
                    {k}
                    <button type="button" aria-label={`Xóa từ khóa ${k}`} className="relative grid size-6 place-items-center rounded-full text-blue-700 transition-colors before:absolute before:-inset-2.5 hover:bg-blue-100"
                      onClick={() => setValue('keywords', values.keywords.filter((x) => x !== k), { shouldDirty: true })}><X aria-hidden="true" className="size-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {topic.permissions?.checkSimilarity && (check || latest.data) && (
            <div><h2 className="mb-2 font-semibold">Kết quả kiểm tra trùng lặp</h2><SimilarityPanel check={check ?? latest.data} /></div>
          )}
        </div>

        <aside aria-label="Điều kiện gửi và thao tác" className="space-y-4 lg:sticky lg:top-24">
          <div className={card}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">{recruit ? 'Đủ điều kiện công bố' : 'Đủ điều kiện gửi'}</h2>
              <span className="text-sm font-medium text-muted-foreground tabular-nums">{passed}/{conditions.length}</span>
            </div>
            <div aria-hidden="true" className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full transition-[width] duration-300 ${passed === conditions.length ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${(passed / conditions.length) * 100}%` }} />
            </div>
            <ul className="mt-4 space-y-3 text-sm">
              {conditions.map(([k, label]) => (
                <li key={k} className="flex gap-2.5">
                  {problems[k]
                    ? <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    : <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-600" />}
                  <span className="min-w-0">
                    <span className="sr-only">{problems[k] ? 'Chưa đạt' : 'Đạt'} – </span>
                    <span className={problems[k] ? 'font-medium text-blue-900' : 'text-muted-foreground'}>{label}</span>
                    {problems[k] && <span className="block text-xs text-amber-800">{problems[k]}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className={`${card} space-y-2`}>
            {formError && <p role="alert" className="break-words rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formError}</p>}
            <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}><Save aria-hidden="true" className="size-4" />{busy ? 'Đang xử lý…' : 'Lưu nháp'}</button>
            {topic.permissions?.checkSimilarity && (
              <button type="button" disabled={busy || cd.active} onClick={onCheck} className={`${btnGhost} w-full`}><ScanSearch aria-hidden="true" className="size-4" />Kiểm tra trước</button>
            )}
            {cd.active && <p role="status" className="text-sm text-amber-900">{cd.message}</p>}
            {isDirty && <p className="text-center text-xs text-muted-foreground">Có thay đổi chưa lưu</p>}
          </div>
        </aside>
      </form>

      {conflict && <ConflictDialog onTakeNew={takeNew} onKeepMine={keepMine} />}
      {blocker.state === 'blocked' && (
        <ConfirmDialog title="Rời trang?" message="Bạn có thay đổi chưa lưu. Rời trang sẽ mất các thay đổi này." confirmLabel="Rời trang" danger
          onConfirm={() => blocker.proceed()} onCancel={() => blocker.reset()} />
      )}
    </section>
  );
}
