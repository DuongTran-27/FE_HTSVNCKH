import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ROLE_LABEL, userCreateSchema } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { applyServerErrors } from '../../lib/forms.js';
import { useCooldown } from '../../lib/useCooldown.js';
import { useCatalog, useScopedFaculties } from '../../lib/queries.js';
import { FormField } from '../../components/FormField.jsx';
import { CheckGroup, Options, PageHeader, TempPasswordBox, btnPrimary, card, opt } from '../../components/ui.jsx';

const FIELDS = ['code', 'email', 'fullName', 'role', 'facultyId', 'classId', 'staffFacultyIds'];

// Bỏ trường không thuộc vai trò đang chọn (ô ẩn) trước khi kiểm bằng userCreateSchema
export const cleanUserForm = (v) => {
  const out = { code: v.code, email: v.email, fullName: v.fullName, role: v.role };
  if (v.role !== 'ADMIN' && v.facultyId) out.facultyId = v.facultyId;
  if (v.role === 'STUDENT' && v.classId) out.classId = v.classId;
  if (v.role === 'STAFF' && v.staffFacultyIds?.length) out.staffFacultyIds = v.staffFacultyIds;
  return out;
};
const resolver = (values, ctx, opts) => zodResolver(userCreateSchema)(cleanUserForm(values), ctx, opts);

// R19 – API_GD2 §3.2 POST /api/users
export function UserCreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cd = useCooldown();
  const [formError, setFormError] = useState('');
  const [created, setCreated] = useState(null); // { id, password } – chỉ state cục bộ, không vào cache
  const roles = user.role === 'ADMIN' ? ['STUDENT', 'LECTURER', 'STAFF', 'ADMIN'] : ['STUDENT', 'LECTURER'];
  const { register, handleSubmit, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm({
    resolver, defaultValues: { code: '', email: '', fullName: '', role: roles[0], facultyId: '', classId: '', staffFacultyIds: [] },
  });
  const role = watch('role');
  const facultyId = watch('facultyId');
  const faculties = useScopedFaculties(user);
  const allFaculties = useCatalog('faculties');
  const majors = useCatalog('majors', { facultyId }, { enabled: role === 'STUDENT' && !!facultyId });
  const classes = useCatalog('classes', {}, { enabled: role === 'STUDENT' && !!facultyId });
  const majorIds = new Set((majors.data ?? []).map((m) => m.id));
  const classOptions = (classes.data ?? []).filter((c) => majorIds.has(c.majorId));

  const onSubmit = async (values) => {
    setFormError('');
    try {
      const res = await api('/users', { method: 'POST', body: values });
      qc.invalidateQueries({ queryKey: ['users'] });
      setCreated({ id: res.user.id, password: res.temporaryPassword });
    } catch (err) {
      if (err.sessionExpired) return;
      if (err.status === 429) cd.start(err.retryAfter);
      setFormError(applyServerErrors(err, setError, FIELDS).join(' '));
    }
  };

  if (created) {
    return (
      <section>
        <PageHeader title="Đã tạo tài khoản" />
        <TempPasswordBox password={created.password} onClose={() => navigate(`/quan-ly/tai-khoan/${created.id}`, { replace: true })} />
      </section>
    );
  }
  return (
    <section className="max-w-xl">
      <PageHeader title="Tạo tài khoản" description="Mật khẩu tạm được tạo tự động và chỉ hiện một lần sau khi tạo." />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className={`${card} space-y-4`}>
        <FormField label="Mã" error={errors.code?.message}><input autoComplete="off" {...register('code')} /></FormField>
        <FormField label="Email" error={errors.email?.message}><input type="email" autoComplete="off" {...register('email')} /></FormField>
        <FormField label="Họ tên" error={errors.fullName?.message}><input autoComplete="off" {...register('fullName')} /></FormField>
        <FormField label="Vai trò" error={errors.role?.message}>
          <select {...register('role')}><Options options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} /></select>
        </FormField>
        {role !== 'ADMIN' && (
          <FormField label="Khoa" error={errors.facultyId?.message}>
            <select {...register('facultyId', { onChange: () => setValue('classId', '') })}>
              <Options placeholder="Chọn khoa" options={opt(faculties.data ?? [])} />
            </select>
          </FormField>
        )}
        {role === 'STUDENT' && (
          <FormField label="Lớp" error={errors.classId?.message} hint={facultyId ? undefined : 'Chọn khoa trước'}>
            <select {...register('classId')} disabled={!facultyId}>
              <Options placeholder="Chọn lớp" options={opt(classOptions, 'id', (c) => c.code)} />
            </select>
          </FormField>
        )}
        {role === 'STAFF' && (
          <CheckGroup legend="Khoa phụ trách" error={errors.staffFacultyIds?.message} value={watch('staffFacultyIds')}
            options={(allFaculties.data ?? []).map((f) => ({ id: f.id, label: f.name }))}
            onChange={(v) => setValue('staffFacultyIds', v, { shouldValidate: true })} />
        )}
        {formError && <p role="alert" className="text-sm text-red-700 break-words">{formError}</p>}
        {cd.active && <p className="text-sm text-slate-700">{cd.message}</p>}
        <button type="submit" disabled={isSubmitting || cd.active} className={`${btnPrimary} w-full sm:w-auto`}>{isSubmitting ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
      </form>
    </section>
  );
}
