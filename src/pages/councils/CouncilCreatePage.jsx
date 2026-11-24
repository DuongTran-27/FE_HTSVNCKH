import { useNavigate, Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { councilCreateSchema } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { applyServerErrors } from '../../lib/forms.js';
import { toast } from '../../lib/toast.js';
import { FormField } from '../../components/FormField.jsx';
import { FormError, Options, PageHeader, btnGhost, btnPrimary, card } from '../../components/ui.jsx';
import { CouncilMembersFields, conflictLines, emptyMembers } from './CouncilMembersFields.jsx';

/** Các đợt cán bộ thấy (cùng khóa với bảng tin R26 để dùng lại cache) */
export const useRounds = () => useQuery({ queryKey: ['rounds', 'all'], queryFn: async () => (await api('/rounds?pageSize=100')).items });

// R31 – UI §12.8, API_GD7 §6.2: lập hội đồng (đợt, tên, Chủ tịch, Thư ký, 1–5 Ủy viên). Thành công → R32.
export function CouncilCreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const rounds = useRounds();
  const { register, control, watch, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(councilCreateSchema), defaultValues: { roundId: '', name: '', members: emptyMembers() },
  });
  const round = (rounds.data ?? []).find((r) => r.id === watch('roundId'));
  const submit = async (body) => {
    try {
      const { council } = await api('/councils', { method: 'POST', body });
      qc.invalidateQueries({ queryKey: ['councils'] });
      toast(`Đã lập ${council.name} (${council.code})`, { type: 'success' });
      navigate(`/hoi-dong/${council.id}`);
    } catch (err) {
      if (err.sessionExpired) return;
      const lines = conflictLines(err);
      const msgs = lines.length ? [err.message, ...lines] : applyServerErrors(err, setError, ['roundId', 'name', 'members']);
      if (msgs.length) setError('root', { message: msgs.join('. ') });
    }
  };
  return (
    <section>
      <PageHeader title="Lập hội đồng" description="Hội đồng gồm 1 Chủ tịch, 1 Thư ký và 1–5 Ủy viên cùng khoa với đợt." />
      <form noValidate onSubmit={handleSubmit(submit)} className={`${card} max-w-3xl space-y-4`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Đợt" error={errors.roundId?.message ?? (rounds.isError ? rounds.error.message : undefined)}>
            <select {...register('roundId')}>
              <Options placeholder={rounds.isPending ? 'Đang tải…' : '— Chọn đợt —'} options={(rounds.data ?? []).map((r) => ({ value: r.id, label: `${r.name} (${r.academicYear})` }))} />
            </select>
          </FormField>
          <FormField label="Tên hội đồng" error={errors.name?.message}><input maxLength={200} {...register('name')} /></FormField>
        </div>
        <CouncilMembersFields control={control} register={register} watch={watch} errors={errors} facultyId={round?.facultyId} />
        <FormError error={errors.root?.message} />
        <div className="flex flex-wrap justify-end gap-2">
          <Link to="/hoi-dong" className={btnGhost}>Hủy</Link>
          <button type="submit" disabled={isSubmitting} className={btnPrimary}>{isSubmitting ? 'Đang lưu…' : 'Lập hội đồng'}</button>
        </div>
      </form>
    </section>
  );
}
