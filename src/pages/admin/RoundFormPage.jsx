import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_ROUND_CONFIG, effectiveRoundConfig, roundCreateSchema } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { fromLocalInput, toLocalInput } from '../../lib/format.js';
import { applyServerErrors } from '../../lib/forms.js';
import { useScopedFaculties } from '../../lib/queries.js';
import { toast } from '../../lib/toast.js';
import { FormField } from '../../components/FormField.jsx';
import { CheckGroup, Options, QueryBox, btnPrimary, opt } from '../../components/ui.jsx';

const FILE_TYPES = ['pdf', 'docx', 'pptx', 'xlsx'];
// [khóa, nhãn] – khóa 'similarity.x' nằm trong config.similarity (API_GD2 §4.3 roundConfigSchema)
const CONFIG_FIELDS = [
  ['minMembers', 'Số thành viên tối thiểu'], ['maxMembers', 'Số thành viên tối đa'],
  ['maxActiveTopicsPerStudent', 'Số đề tài hoạt động tối đa mỗi sinh viên'], ['maxTopicsPerLecturer', 'Hạn mức đề tài mỗi giảng viên'],
  ['advisorReminderDays', 'Số ngày nhắc giảng viên phản hồi'], ['dueReminderDays', 'Số ngày nhắc trước hạn'],
  ['minSummaryWords', 'Số từ tóm tắt tối thiểu'], ['minKeywords', 'Số từ khóa tối thiểu'], ['maxKeywords', 'Số từ khóa tối đa'],
  ['maxFileSizeMB', 'Dung lượng file tối đa (MB)'],
  ['similarity.titleReview', 'Ngưỡng tên: cần xem xét (0–1)'], ['similarity.titleHigh', 'Ngưỡng tên: nghi trùng cao (0–1)'],
  ['similarity.contentReview', 'Ngưỡng nội dung: cần xem xét (0–1)'], ['similarity.contentHigh', 'Ngưỡng nội dung: nghi trùng cao (0–1)'],
  ['similarity.minJustificationWords', 'Số từ giải trình tối thiểu'],
];
const MILESTONES = [['regOpenAt', 'Mở đăng ký'], ['regCloseAt', 'Đóng đăng ký'], ['reviewDeadline', 'Hạn xét duyệt'], ['endAt', 'Kết thúc']];
const FIELD_NAMES = ['facultyId', 'name', 'academicYear', ...MILESTONES.map(([k]) => k), ...CONFIG_FIELDS.map(([k]) => `config.${k}`), 'config.allowedFileTypes'];

const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const sameAsDefault = (key, v) => Number(v) === getPath(DEFAULT_ROUND_CONFIG, key);

// Form (mốc dạng datetime-local giờ VN) -> body API; luôn gửi đủ config (UI §4.21, U4)
export const toPayload = (v) => ({
  facultyId: v.facultyId, name: v.name, academicYear: v.academicYear,
  ...Object.fromEntries(MILESTONES.map(([k]) => [k, fromLocalInput(v[k])])),
  config: v.config,
});
const resolver = (values, ctx, opts) => zodResolver(roundCreateSchema)(toPayload(values), ctx, opts);

const toFormValues = (round, facultyId) => {
  const c = effectiveRoundConfig(round?.effectiveConfig ?? DEFAULT_ROUND_CONFIG);
  return {
    facultyId: round?.facultyId ?? facultyId, name: round?.name ?? '', academicYear: round?.academicYear ?? '',
    ...Object.fromEntries(MILESTONES.map(([k]) => [k, toLocalInput(round?.[k])])),
    config: c,
  };
};

// R24 – API_GD2 §4.3 POST/PATCH /api/rounds
export function RoundFormPage({ create }) {
  const { id } = useParams();
  const query = useQuery({ queryKey: ['rounds', 'detail', id], queryFn: () => api(`/rounds/${id}`), enabled: !create });
  if (create) return <RoundForm />;
  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold tracking-tight sm:text-3xl">Chi tiết đợt</h1>
      <QueryBox query={query}>{(d) => <RoundForm key={JSON.stringify(d.round)} round={d.round} />}</QueryBox>
    </section>
  );
}

function RoundForm({ round }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const faculties = useScopedFaculties(user);
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm({
    resolver, defaultValues: toFormValues(round, ''),
  });
  const config = watch('config');
  const err = (k) => getPath(errors, k)?.message;

  // Cảnh báo (không chặn) khi siết điều kiện gửi hồ sơ – review RV INFO 12
  const old = round?.effectiveConfig;
  const tightened = (k) => old && (k === 'maxKeywords' ? Number(config[k]) < old[k] : ['minSummaryWords', 'minKeywords'].includes(k) && Number(config[k]) > old[k]);

  const onSubmit = async (values) => {
    setFormError('');
    const body = values; // resolver đã trả payload đã kiểm (mốc ISO +07:00)
    try {
      if (round) {
        await api(`/rounds/${round.id}`, { method: 'PATCH', body: { ...body, facultyId: undefined } });
      } else {
        const res = await api('/rounds', { method: 'POST', body });
        qc.invalidateQueries({ queryKey: ['rounds'] });
        toast('Đã tạo đợt', { type: 'success' });
        navigate(`/quan-ly/dot/${res.round.id}`, { replace: true });
        return;
      }
      qc.invalidateQueries({ queryKey: ['rounds'] });
      toast('Đã lưu đợt', { type: 'success' });
    } catch (e) {
      if (!e.sessionExpired) setFormError(applyServerErrors(e, setError, FIELD_NAMES).join(' '));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-3xl space-y-4" aria-label={round ? 'Sửa đợt' : 'Tạo đợt'}>
      {!round && <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Tạo đợt</h1>}
      {round && <p className="text-sm text-slate-700">Thay đổi áp dụng từ lần kiểm tra kế tiếp, không áp dụng lại cho dữ liệu cũ.</p>}
      <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      {!round && (
        <FormField label="Khoa" error={err('facultyId')}>
          <select {...register('facultyId')}><Options placeholder="Chọn khoa" options={opt(faculties.data ?? [])} /></select>
        </FormField>
      )}
      <FormField label="Tên đợt" error={err('name')}><input {...register('name')} /></FormField>
      <FormField label="Năm học" hint="Dạng 2026-2027" error={err('academicYear')}><input {...register('academicYear')} /></FormField>
      </div>
      <fieldset className="rounded-xl border bg-card p-4 shadow-sm sm:p-5 grid gap-3 sm:grid-cols-2">
        <legend className="float-left mb-1 w-full font-semibold sm:col-span-2">Mốc thời gian (giờ Việt Nam)</legend>
        {MILESTONES.map(([k, label]) => (
          <FormField key={k} label={label} error={err(k)}><input type="datetime-local" {...register(k)} /></FormField>
        ))}
      </fieldset>
      <fieldset className="rounded-xl border bg-card p-4 shadow-sm sm:p-5 grid gap-3 sm:grid-cols-2">
        <legend className="float-left mb-1 w-full font-semibold sm:col-span-2">Cấu hình tham số</legend>
        {CONFIG_FIELDS.map(([k, label]) => {
          const isDefault = sameAsDefault(k, getPath(config, k));
          const step = k.startsWith('similarity.') && !k.endsWith('Words') ? '0.01' : '1';
          const warn = tightened(k);
          return (
            <FormField key={k} label={label} error={err(`config.${k}`)}
              hint={[isDefault ? '(mặc định)' : '', warn ? 'Đề tài đang chờ hoặc đã có giảng viên hướng dẫn có thể không còn đủ điều kiện gửi và không tự sửa được' : ''].filter(Boolean).join(' · ') || undefined}>
              <input type="number" inputMode="decimal" step={step} {...register(`config.${k}`, { valueAsNumber: true })} />
            </FormField>
          );
        })}
        <div className="sm:col-span-2">
          <CheckGroup legend="Loại file được phép" error={err('config.allowedFileTypes')} value={config.allowedFileTypes}
            options={FILE_TYPES.map((t) => ({ id: t, label: t }))}
            onChange={(v) => setValue('config.allowedFileTypes', FILE_TYPES.filter((t) => v.includes(t)), { shouldDirty: true, shouldValidate: true })} />
        </div>
      </fieldset>
      {formError && <p role="alert" className="text-sm text-red-700 break-words">{formError}</p>}
      <button type="submit" disabled={isSubmitting} className={btnPrimary}>{isSubmitting ? 'Đang lưu…' : round ? 'Lưu đợt' : 'Tạo đợt'}</button>
    </form>
  );
}
