import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { SSO_ERROR_LABEL, loginSchema } from '@nckh/shared';
import { useNavigate, useSearchParams } from 'react-router';
import { api, login } from '../lib/api.js';
import { applyServerErrors } from '../lib/forms.js';
import { useCooldown } from '../lib/useCooldown.js';
import { afterLoginPath, safeNext } from '../lib/nav.js';
import { FormField } from '../components/FormField.jsx';
import { btn, btnPrimary } from '../components/ui.jsx';
import { Eye, EyeOff, FlaskConical } from 'lucide-react';

// Panel trái luôn nền navy, tờ hồ sơ luôn giấy trắng: dùng mã màu cố định, không theo thang blue-*/slate-* đảo ở chế độ tối
// Vòng đời một đề tài trong hệ thống (chuỗi thật, theo bảng chuyển trạng thái) – minh họa trên tờ hồ sơ ở panel trái
const LIFECYCLE = ['Đăng ký đề tài', 'Xét duyệt', 'Thực hiện', 'Bảo vệ trước hội đồng', 'Nghiệm thu'];

/**
 * Panel trái (≥ lg): tờ hồ sơ đề tài mẫu (hư cấu) đã đi hết vòng đời, có con dấu son "Đã nghiệm thu" đóng một lần khi
 * tải trang – cùng mô-típ con dấu ở trang chi tiết đề tài. Trang trí, trình đọc màn hình bỏ qua.
 */
function DossierSheet() {
  return (
    <div aria-hidden="true" className="relative mt-10 max-w-xl">
      <div className="rounded-lg bg-white p-8 text-[#101129] shadow-[0_24px_48px_-12px_rgb(0_0_0/0.45)]">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-[#5b6178]">Mã đề tài</dt><dd className="font-semibold tabular-nums">NCKH-2026-0031</dd>
          <dt className="text-[#5b6178]">Đợt</dt><dd>Đợt 1, năm học 2026–2027</dd>
        </dl>
        <p className="mt-4 text-xl leading-snug font-semibold text-balance">Hệ thống gợi ý học liệu cho sinh viên năm nhất</p>
        <ol className="mt-6 space-y-3 border-t border-[#e2e4e9] pt-5">
          {LIFECYCLE.map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              <span className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums ${i === LIFECYCLE.length - 1 ? 'bg-navy text-vlu-gold' : 'bg-[#e2e5f4] text-navy'}`}>{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
      <span className="absolute -right-8 bottom-10 inline-flex animate-stamp flex-col items-center whitespace-nowrap rounded-md border-[5px] border-double border-seal bg-white/85 px-6 py-2 text-seal">
        <span className="text-2xl leading-tight font-bold">Đã nghiệm thu</span>
        <span className="text-sm font-semibold">Khoa Công nghệ Thông tin</span>
      </span>
    </div>
  );
}

// Chỉ dev: tài khoản dữ liệu mẫu (prisma/seed.js). Bản build production thay DEV = false nên mảng và mật khẩu bị loại khỏi bundle.
const DEMO_ACCOUNTS = import.meta.env.DEV ? [
  ['Quản trị viên', 'QT001'], ['Cán bộ khoa', 'CB001'], ['Giảng viên', 'GV001'], ['Sinh viên', '2374801030010'],
].map(([label, code]) => ({ label, code, password: 'Nckh@2026-dev' })) : [];

// Mã `sso_error` do callback Google gắn lên URL (UI §12.3); mã lạ → thông điệp chung
// Chỉ tra khóa riêng của bảng nhãn: mã tùy ý trên URL (vd. `constructor`) không được lấy giá trị thừa kế từ Object
const ssoMessage = (code) =>
  code ? (Object.hasOwn(SSO_ERROR_LABEL, code) ? SSO_ERROR_LABEL[code] : 'Đăng nhập bằng Google không thành công') : '';

// Logo "G" nhiều màu của Google (nhận diện nút theo hướng dẫn thương hiệu); trang trí, trình đọc màn hình đọc chữ của nút
function GoogleLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.4 0 24 0 14.6 0 6.6 5.4 2.6 13.3l8 6.2C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z" />
      <path fill="#FBBC05" d="M10.6 28.5c-.5-1.4-.8-2.9-.8-4.5s.3-3.1.8-4.5l-8-6.2C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l8-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-8 6.2C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [show, setShow] = useState(false);
  const [formError, setFormError] = useState(() => ssoMessage(params.get('sso_error')));
  // Nút Google chỉ hiện khi server bật SSO; lỗi gọi coi như tắt, form mật khẩu vẫn dùng được (UI §12.3)
  const providers = useQuery({ queryKey: ['auth-providers'], queryFn: () => api('/auth/providers'), staleTime: Infinity, retry: false });
  const next = safeNext(params.get('next'));
  // Thông điệp đã giữ trong state; bỏ `sso_error` khỏi URL để tải lại/chia sẻ link không hiện lỗi cũ
  useEffect(() => {
    if (params.has('sso_error')) setParams((p) => { const n = new URLSearchParams(p); n.delete('sso_error'); return n; }, { replace: true });
  }, [params, setParams]);
  const cd = useCooldown();
  const { register, handleSubmit, setError, resetField, setFocus, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const onSubmit = async (values) => {
    setFormError('');
    try {
      const user = await login(values);
      // next là trang của phiên trước (có thể vai trò khác): vai trò mới không vào được thì về trang chủ của vai trò
      navigate(afterLoginPath(user, next), { replace: true });
    } catch (err) {
      if (err.status === 429) cd.start(err.retryAfter);
      const msgs = applyServerErrors(err, setError, ['identifier', 'password']);
      setFormError(msgs.join(' '));
      // Giữ ô mã, xóa ô mật khẩu (UI §4.1)
      resetField('password', { defaultValue: '' });
      setFocus('password');
    }
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-[7fr_5fr]">
      {/* Panel nhận diện (≥ lg): thương hiệu, câu giới thiệu, tờ hồ sơ có con dấu */}
      <div className="hidden overflow-hidden bg-navy px-14 py-12 text-white xl:px-20 lg:flex lg:flex-col lg:justify-between">
        <p className="flex items-center gap-3 text-lg font-bold"><span className="grid size-9 place-items-center rounded-lg bg-vlu-red"><FlaskConical aria-hidden="true" className="size-5" /></span>Nghiên cứu khoa học sinh viên</p>
        <div>
          <p className="text-5xl leading-[1.08] font-semibold tracking-tight"><span className="block">Từ ý tưởng đến nghiệm thu,</span><span className="block">trên một hồ sơ.</span></p>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-[#e2e5f4]">Sinh viên, giảng viên và cán bộ khoa cùng theo dõi một đề tài qua từng bước.</p>
          <DossierSheet />
        </div>
        <p className="text-sm text-[#e2e5f4]/80">Khoa Công nghệ Thông tin, Trường Đại học Văn Lang</p>
      </div>
      <div className="flex items-center justify-center p-4 sm:p-10">
      <div className="w-full max-w-sm">
      <p className="mb-8 flex items-center gap-2.5 font-semibold text-blue-800 lg:hidden"><span className="grid size-8 place-items-center rounded-lg bg-vlu-red text-white"><FlaskConical aria-hidden="true" className="size-4" /></span>Nghiên cứu khoa học sinh viên</p>
      <h1 className="text-3xl font-semibold tracking-tight">Đăng nhập</h1>
      <p className="mt-2 text-slate-600">Dùng mã sinh viên, mã giảng viên hoặc email do khoa cấp.</p>
      {providers.data?.google === true && (
        <>
          {/* Liên kết GET cấp trên cùng, không form/window.location: CSP form-action 'self' chặn chuỗi chuyển hướng sang Google (API_GD7 §8.2) */}
          <a href={`/api/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ''}`} className={`${btn} mt-6 w-full gap-3`}>
            <GoogleLogo />Đăng nhập bằng Google
          </a>
          <p className="mt-4 flex items-center gap-3 text-sm text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">hoặc</p>
        </>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
        <FormField label="Mã hoặc email" error={errors.identifier?.message}>
          <input type="text" autoComplete="username" autoCapitalize="none" {...register('identifier')} />
        </FormField>
        <FormField label="Mật khẩu" error={errors.password?.message}>
          <input type={show ? 'text' : 'password'} autoComplete="current-password" {...register('password')} />
        </FormField>
        <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
          {show ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
          {show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        </button>
        {formError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 break-words">{formError}</p>}
        {cd.active && <p className="text-sm text-slate-700">{cd.message}</p>}
        <button type="submit" disabled={isSubmitting || cd.active} className={`${btnPrimary} w-full`}>
          {isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
      {import.meta.env.DEV && (
        <section aria-label="Đăng nhập nhanh" className="mt-8 border-t border-slate-300 pt-5">
          <h2 className="text-sm font-semibold">Đăng nhập nhanh (dữ liệu mẫu)</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.code} type="button" disabled={isSubmitting || cd.active}
                onClick={() => { setValue('identifier', a.code); setValue('password', a.password); handleSubmit(onSubmit)(); }}
                className="min-h-11 rounded-md border border-slate-300 bg-card px-3 py-2 text-left text-sm hover:border-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                <span className="block font-semibold">{a.label}</span><span className="text-slate-600">{a.code}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      </div>
      </div>
    </main>
  );
}
