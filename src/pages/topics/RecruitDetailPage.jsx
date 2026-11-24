import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applicationCreateSchema } from '@nckh/shared';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { applyServerErrors } from '../../lib/forms.js';
import { toast } from '../../lib/toast.js';
import { FormField } from '../../components/FormField.jsx';
import { Badge, ConfirmDialog, FormError, QueryBox, btnGhost, btnPrimary, card } from '../../components/ui.jsx';
import { APPLICATION_LABEL } from './RecruitBoardPage.jsx';

// Sau mọi lần ghi (kể cả lỗi) tải lại bảng tin + hộp đơn: server là nơi quyết định còn chỗ/còn tuyển hay không
const invalidate = (qc) => ['recruitments', 'applications'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

// R27 – UI §12.6, API_GD7 §4.2–4.3: chi tiết đề tài đang tuyển + ứng tuyển / rút đơn. Giảng viên, cán bộ chỉ đọc.
export function RecruitDetailPage() {
  const { topicId } = useParams();
  const query = useQuery({ queryKey: ['recruitments', topicId], queryFn: async () => (await api(`/recruitments/${topicId}`)).recruitment, retry: false });
  const back = <Link to="/tuyen-sinh" className={btnGhost}><ArrowLeft aria-hidden="true" className="size-4" />Về bảng tin</Link>;
  if (query.error?.status === 404) {
    return <section role="alert" className="space-y-3"><p>Đề tài không còn tuyển hoặc không tồn tại.</p>{back}</section>;
  }
  return <section><QueryBox query={query}>{(t) => <Detail t={t} back={back} />}</QueryBox></section>;
}

// Bố cục chi tiết R27: nội dung đề tài bên trái, thông tin + khối ứng tuyển bên phải.
function Detail({ t, back }) {
  const { user } = useAuth();
  const left = Math.max(t.recruitSlots - t.acceptedCount, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground tabular-nums">{t.code}</p>
          <h1 className="break-words text-2xl font-bold sm:text-3xl">{t.title}</h1>
        </div>
        {back}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`${card} space-y-4 lg:col-span-2`}>
          <Block title="Tóm tắt">{t.summary}</Block>
          <Block title="Mục tiêu">{t.objectives}</Block>
          <Block title="Từ khóa">{(t.keywords ?? []).join(', ')}</Block>
          <Block title="Yêu cầu ứng viên">{t.requirements || 'Không có yêu cầu riêng.'}</Block>
        </div>
        <aside className={`${card} space-y-3 self-start lg:sticky lg:top-4`}>
          <p className="text-sm">Giảng viên: <span className="font-medium">{t.lecturer?.fullName}</span></p>
          <p className="text-sm">Lĩnh vực: {t.field?.name}</p>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            Đợt: {t.round?.name}{t.round?.registrationOpen === false && <Badge tone="amber">Đã đóng đăng ký</Badge>}
          </p>
          <p><Badge tone={left > 0 ? 'green' : 'amber'}>Còn {left} chỗ</Badge></p>
          {user?.role === 'STUDENT' && <ApplyBlock t={t} mine={t.myApplication} />}
        </aside>
      </div>
    </div>
  );
}

// Một mục văn bản có tiêu đề (tóm tắt, mục tiêu, yêu cầu…).
const Block = ({ title, children }) => (
  <div><h2 className="font-semibold">{title}</h2><p className="mt-1 whitespace-pre-wrap break-words text-sm">{children}</p></div>
);

// Chưa có đơn còn hiệu lực (không có đơn hoặc đã bị từ chối) → form; đơn chờ → rút; đã nhận → vào đề tài
function ApplyBlock({ t, mine }) {
  const [withdrawing, setWithdrawing] = useState(false);
  if (mine?.status === 'PENDING') {
    return (
      <div className="space-y-2">
        <p><Badge tone="blue">{APPLICATION_LABEL.PENDING}</Badge></p>
        <button type="button" className={btnGhost} onClick={() => setWithdrawing(true)}>Rút đơn</button>
        {withdrawing && <WithdrawDialog app={mine} onClose={() => setWithdrawing(false)} />}
      </div>
    );
  }
  if (mine?.status === 'ACCEPTED') {
    return <div className="space-y-2"><p><Badge tone="green">{APPLICATION_LABEL.ACCEPTED}</Badge></p><Link to={`/de-tai/${t.topicId}`} className={btnPrimary}>Vào đề tài</Link></div>;
  }
  return <ApplyForm t={t} declined={mine?.status === 'DECLINED'} />;
}

// Form "Lời giới thiệu": gửi đơn ứng tuyển, lỗi nghiệp vụ của server hiện dưới form.
function ApplyForm({ t, declined }) {
  const qc = useQueryClient();
  const { register, handleSubmit, setError, watch, formState: { errors } } = useForm({ resolver: zodResolver(applicationCreateSchema), defaultValues: { coverLetter: '' } });
  const length = watch('coverLetter').trim().length;
  const apply = useMutation({
    mutationFn: (body) => api(`/recruitments/${t.topicId}/applications`, { method: 'POST', body }),
    onSuccess: () => toast('Đã gửi đơn ứng tuyển', { type: 'success' }),
    onError: (err) => {
      if (err.sessionExpired) return;
      // 400 theo trường vào ô; mọi mã khác (APPLICATION_EXISTS, REGISTRATION_CLOSED, STUDENT_TOPIC_LIMIT, ALREADY_MEMBER, NOT_RECRUITING…) hiện err.message của server
      setError('root', { message: applyServerErrors(err, setError, ['coverLetter']).join(' ') || undefined });
    },
    onSettled: () => invalidate(qc),
  });
  return (
    <form noValidate onSubmit={handleSubmit((v) => apply.mutate(v))} className="space-y-3">
      {declined && <p className="text-sm text-muted-foreground">Đơn trước của bạn đã bị từ chối; bạn có thể gửi đơn mới.</p>}
      <FormField label="Lời giới thiệu" error={errors.coverLetter?.message} hint={`${length}/2000 ký tự (tối thiểu 20)`}>
        <textarea rows={6} maxLength={2000} {...register('coverLetter')} />
      </FormField>
      <FormError error={errors.root?.message} />
      <button type="submit" disabled={apply.isPending} className={btnPrimary}>{apply.isPending ? 'Đang gửi…' : 'Gửi ứng tuyển'}</button>
    </form>
  );
}

// Dùng ở R27 và R28: rút đơn có xác nhận; APPLICATION_CLOSED (đơn đã được xử lý) hiện ngay trong hộp thoại rồi tải lại
export function WithdrawDialog({ app, onClose }) {
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const withdraw = useMutation({
    mutationFn: () => api(`/applications/${app.id}/withdraw`, { method: 'POST', body: {} }),
    onSuccess: () => { onClose(); toast('Đã rút đơn ứng tuyển', { type: 'success' }); },
    onError: (err) => { if (!err.sessionExpired) setError(err.message); },
    onSettled: () => invalidate(qc),
  });
  return (
    <ConfirmDialog title="Rút đơn ứng tuyển" message="Bạn có chắc muốn rút đơn? Bạn có thể gửi đơn mới sau đó nếu đề tài còn tuyển." confirmLabel="Rút đơn" danger
      busy={withdraw.isPending} error={error} onConfirm={() => withdraw.mutate()} onCancel={onClose} />
  );
}
