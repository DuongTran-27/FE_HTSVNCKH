import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { changePasswordSchema } from '@nckh/shared';
import { Navigate, useNavigate } from 'react-router';
import { api, logout } from '../lib/api.js';
import { auth, useAuth } from '../lib/auth.js';
import { applyServerErrors } from '../lib/forms.js';
import { useCooldown } from '../lib/useCooldown.js';
import { homePath } from '../lib/nav.js';
import { toast } from '../lib/toast.js';
import { FormField } from '../components/FormField.jsx';
import { btnGhost, btnPrimary } from '../components/ui.jsx';
import { KeyRound } from 'lucide-react';

// "Nhập lại" chỉ kiểm phía client (UI §4.2)
const formSchema = changePasswordSchema
  .extend({ confirmPassword: z.string() })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'Mật khẩu nhập lại không khớp' });

export function ChangePasswordPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState('');
  const cd = useCooldown();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  if (!user) return <Navigate to="/dang-nhap" replace />;

  const onSubmit = async ({ currentPassword, newPassword }) => {
    setFormError('');
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
    } catch (err) {
      if (err.sessionExpired) return;
      if (err.status === 429) cd.start(err.retryAfter);
      const fields = { WRONG_PASSWORD: 'currentPassword', SAME_PASSWORD: 'newPassword' };
      if (fields[err.code]) setError(fields[err.code], { type: 'server', message: err.message }, { shouldFocus: true });
      else setFormError(applyServerErrors(err, setError, ['currentPassword', 'newPassword']).join(' '));
      return;
    }
    // Mật khẩu đã đổi; /me lỗi thì không báo lỗi đổi mật khẩu, tạm hạ cờ (review T302-bao-mat #2)
    try {
      auth.setUser((await api('/auth/me')).user);
    } catch {
      auth.setUser({ ...user, mustChangePassword: false });
    }
    toast('Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.');
    navigate(homePath(user.role), { replace: true });
  };

  return (
    <main className="mx-auto max-w-md py-4 sm:py-8">
      <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-8">
      <span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-700"><KeyRound aria-hidden="true" className="size-5" /></span>
      <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Đổi mật khẩu</h1>
      {user.mustChangePassword && (
        <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">Bạn cần đổi mật khẩu trước khi tiếp tục</p>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-4 space-y-4">
        <FormField label="Mật khẩu hiện tại" error={errors.currentPassword?.message}>
          <input type="password" autoComplete="current-password" {...register('currentPassword')} />
        </FormField>
        <FormField label="Mật khẩu mới" hint="Tối thiểu 8 ký tự, có chữ và số" error={errors.newPassword?.message}>
          <input type="password" autoComplete="new-password" {...register('newPassword')} />
        </FormField>
        <FormField label="Nhập lại mật khẩu mới" error={errors.confirmPassword?.message}>
          <input type="password" autoComplete="new-password" {...register('confirmPassword')} />
        </FormField>
        {formError && <p role="alert" className="text-sm text-red-700 break-words">{formError}</p>}
        {cd.active && <p className="text-sm text-slate-700">{cd.message}</p>}
        <button type="submit" disabled={isSubmitting || cd.active} className={`${btnPrimary} w-full`}>
          {isSubmitting ? 'Đang lưu…' : 'Đổi mật khẩu'}
        </button>
      </form>
      {user.mustChangePassword && (
        <button type="button" onClick={logout} className={`${btnGhost} mt-4 w-full`}>Đăng xuất</button>
      )}
      </div>
    </main>
  );
}
