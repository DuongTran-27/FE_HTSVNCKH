import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { topicCreateSchema } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { applyServerErrors } from '../../lib/forms.js';
import { toast } from '../../lib/toast.js';
import { FormField } from '../../components/FormField.jsx';
import { FilePlus2 } from 'lucide-react';
import { Options, PageHeader, QueryBox, btnPrimary, card } from '../../components/ui.jsx';

const STEPS = [
  ['Tạo nháp', 'Chọn đợt đang mở đăng ký, đặt tên tạm cho đề tài.'],
  ['Soạn hồ sơ', 'Viết tóm tắt, mục tiêu, từ khóa, chọn lĩnh vực; mời thành viên.'],
  ['Mời giảng viên hướng dẫn', 'Gửi đề nghị và chờ giảng viên nhận.'],
  ['Kiểm tra trùng lặp và gửi', 'Hệ thống so với các đề tài đã có rồi chuyển hồ sơ cho khoa xét duyệt.'],
];

const LECTURER_STEPS = [
  ['Tạo nháp', 'Chọn đợt đang mở đăng ký, đặt tên tạm cho đề tài.'],
  ['Soạn hồ sơ', 'Viết tóm tắt, mục tiêu, từ khóa, yêu cầu ứng viên và số sinh viên cần tuyển.'],
  ['Kiểm tra trùng lặp và công bố', 'Hệ thống so với các đề tài đã có rồi đưa đề tài lên bảng tin để sinh viên ứng tuyển.'],
];

// R5 – UI §4.5; bản của giảng viên (UI §12.5) dùng chung form, chỉ đổi chữ và quy trình
export function TopicCreatePage() {
  const navigate = useNavigate();
  const lecturer = useAuth().user?.role === 'LECTURER'; // R5' (UI §12.5): giảng viên tạo nháp đề tài tuyển sinh viên
  const qc = useQueryClient();
  const rounds = useQuery({ queryKey: ['rounds', 'all'], queryFn: async () => (await api('/rounds?pageSize=100')).items });
  const { register, handleSubmit, setError, formState: { errors } } = useForm({ resolver: zodResolver(topicCreateSchema), defaultValues: { roundId: '', title: '' } });
  const create = useMutation({
    mutationFn: (body) => api('/topics', { method: 'POST', body }),
    onSuccess: ({ topic }) => {
      qc.setQueryData(['topic', topic.id], topic);
      qc.invalidateQueries({ queryKey: ['topics'] });
      toast(`Đã tạo đề tài ${topic.code}`, { type: 'success' });
      navigate(`/de-tai/${topic.id}/sua`);
    },
    onError: (err) => {
      if (err.sessionExpired) return;
      // REGISTRATION_CLOSED gắn vào ô đợt (UI §4.5); lỗi khác theo details hoặc cấp form
      if (err.code === 'REGISTRATION_CLOSED') setError('roundId', { type: 'server', message: err.message });
      else applyServerErrors(err, setError, ['roundId', 'title']).forEach((m) => setError('root', { message: m }));
    },
  });
  return (
    <section>
      <PageHeader title={lecturer ? 'Công bố đề tài tuyển sinh viên' : 'Tạo đề tài'} description={lecturer ? 'Bước 1/3: chọn đợt và đặt tên tạm. Yêu cầu ứng viên, số sinh viên cần tuyển và nội dung được soạn ở bước sau.' : 'Bước 1/4: chọn đợt và đặt tên tạm. Nội dung đầy đủ được soạn ở bước sau.'} />
      <QueryBox query={rounds} empty="Khoa chưa mở đợt đăng ký nào." isEmpty={(d) => d.length === 0}>
        {(items) => (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <form noValidate onSubmit={handleSubmit((v) => create.mutate({ roundId: v.roundId, title: v.title }))} className={`${card} space-y-5`}>
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-red-50 text-vlu-red"><FilePlus2 className="size-5" /></span>
                <div>
                  <h2 className="font-semibold">Thông tin ban đầu</h2>
                  <p className="text-sm text-muted-foreground">Có thể đổi tên đề tài khi soạn hồ sơ.</p>
                </div>
              </div>
              <FormField label="Đợt đăng ký" error={errors.roundId?.message}>
                <select {...register('roundId')}>
                  <Options placeholder="Chọn đợt" options={items.map((r) => ({ value: r.id, label: `${r.name} – ${r.academicYear} (${r.registrationOpen ? 'Đang mở đăng ký' : 'Chưa mở hoặc đã đóng đăng ký'})` }))} />
                </select>
              </FormField>
              <FormField label="Tên đề tài (có thể bổ sung sau)" error={errors.title?.message}><input type="text" placeholder="Ví dụ: Ứng dụng học sâu nhận dạng chữ viết tay tiếng Việt" {...register('title')} /></FormField>
              {errors.root?.message && <p role="alert" className="break-words rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{errors.root.message}</p>}
              <div className="flex justify-end border-t pt-5">
                <button type="submit" disabled={create.isPending} className={btnPrimary}>{create.isPending ? 'Đang xử lý…' : 'Tạo nháp'}</button>
              </div>
            </form>
            <aside aria-label="Quy trình đăng ký đề tài" className={card}>
              <h2 className="font-semibold">Quy trình</h2>
              <ol className="mt-4 space-y-4">
                {(lecturer ? LECTURER_STEPS : STEPS).map(([title, text], i) => (
                  <li key={title} className="flex gap-3">
                    <span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${i === 0 ? 'bg-vlu-red text-white' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${i === 0 ? 'text-blue-900' : 'text-muted-foreground'}`}>{title}</p>
                      <p className="text-xs text-muted-foreground">{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        )}
      </QueryBox>
    </section>
  );
}
