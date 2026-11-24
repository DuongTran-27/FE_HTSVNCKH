import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLE_LABEL, profileUpdateSchema } from '@nckh/shared';
import { api } from '../lib/api.js';
import { applyServerErrors } from '../lib/forms.js';
import { toast } from '../lib/toast.js';
import { useCooldown } from '../lib/useCooldown.js';
import { FormField } from '../components/FormField.jsx';
import { PageHeader, QueryBox, btnGhost, btnPrimary, card } from '../components/ui.jsx';

// R35 Hồ sơ cá nhân (FR30, UI §12.4, API_GD7 §10.1): mọi vai trò xem thông tin của mình, chỉ tự sửa số điện thoại.
// Thông tin còn lại do cán bộ khoa/nhập CSV quản lý nên chỉ đọc.
export function ProfilePage() {
  const query = useQuery({ queryKey: ['profile'], queryFn: async () => (await api('/me/profile')).profile });
  return (
    <main className="mx-auto max-w-3xl">
      <PageHeader title="Hồ sơ cá nhân" />
      <QueryBox query={query}>{(profile) => <ProfileView profile={profile} />}</QueryBox>
    </main>
  );
}

function ProfileView({ profile }) {
  const cls = profile.class;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-labelledby="profile-info" className={card}>
        <h2 id="profile-info" className="text-lg font-semibold">Thông tin tài khoản</h2>
        <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[7rem_1fr]">
          <dt className="text-muted-foreground">Mã</dt><dd className="break-all">{profile.code}</dd>
          <dt className="text-muted-foreground">Họ tên</dt><dd className="break-words">{profile.fullName}</dd>
          <dt className="text-muted-foreground">Email</dt><dd className="break-all">{profile.email}</dd>
          <dt className="text-muted-foreground">Vai trò</dt><dd>{ROLE_LABEL[profile.role] ?? profile.role}</dd>
          <dt className="text-muted-foreground">Khoa</dt><dd className="break-words">{profile.faculty?.name ?? '—'}</dd>
          {cls && <><dt className="text-muted-foreground">Lớp / ngành</dt><dd className="break-words">{cls.code} – {cls.major?.name}</dd></>}
        </dl>
        <p className="mt-4 text-sm text-muted-foreground">Liên hệ cán bộ khoa nếu thông tin sai.</p>
      </section>
      <PhoneForm phone={profile.phone} />
    </div>
  );
}

// Sau khi lưu, reset() đưa ô về giá trị server trả; cache ['profile'] đổi nên nút "Xóa số" ẩn/hiện theo số đã lưu
function PhoneForm({ phone }) {
  const qc = useQueryClient();
  const cd = useCooldown();
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, setError, setValue, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: { phone: phone ?? '' },
  });

  // `values.phone` đã qua schema: bỏ khoảng trắng/dấu chấm/gạch, rỗng → null (xóa số)
  const save = async (values) => {
    setFormError('');
    try {
      const { profile } = await api('/me/profile', { method: 'PATCH', body: values });
      qc.setQueryData(['profile'], profile);
      reset({ phone: profile.phone ?? '' });
      toast('Cập nhật thành công', { type: 'success' });
    } catch (err) {
      if (err.sessionExpired) return;
      if (err.status === 429) cd.start(err.retryAfter);
      setFormError(applyServerErrors(err, setError, ['phone']).join(' '));
    }
  };
  const busy = isSubmitting || cd.active;

  return (
    <form onSubmit={handleSubmit(save)} noValidate aria-labelledby="profile-phone" className={`${card} space-y-4`}>
      <h2 id="profile-phone" className="text-lg font-semibold">Liên hệ</h2>
      <FormField label="Số điện thoại" hint="Số di động Việt Nam, ví dụ 0912 345 678" error={errors.phone?.message}>
        <input type="tel" inputMode="tel" autoComplete="tel" {...register('phone')} />
      </FormField>
      {formError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 break-words">{formError}</p>}
      {cd.active && <p className="text-sm text-muted-foreground">{cd.message}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={btnPrimary}>{isSubmitting ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
        {phone && <button type="button" disabled={busy} onClick={() => { setValue('phone', ''); handleSubmit(save)(); }} className={btnGhost}>Xóa số</button>}
      </div>
    </form>
  );
}
