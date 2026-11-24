import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CHANGE_TYPE_LABEL } from '@nckh/shared';
import { api } from '../lib/api.js';
import { WRONG_STATE_CODES, FORM_FIELDS, invalidateChangeRequests, makeResolver, mapServerDetails, toBody } from '../lib/changeRequests.js';
import { applyServerErrors } from '../lib/forms.js';
import { qs } from '../lib/format.js';
import { useCatalog } from '../lib/queries.js';
import { toast } from '../lib/toast.js';
import { useCooldown } from '../lib/useCooldown.js';
import { DebouncedInput } from './ListFilters.jsx';
import { FormField } from './FormField.jsx';
import { SimilarityPanel } from './SimilarityPanel.jsx';
import { FormError, Options, btnGhost, btnPrimary, keepOpenOnEscIf, keepOpenOnOutside, useReturnFocus } from './ui.jsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const HINT = {
  ADVISOR_CHANGE: 'Giảng viên mới phải đồng ý, sau đó cán bộ khoa duyệt. Trong lúc chờ, giảng viên hiện tại vẫn làm việc bình thường. Giảng viên cũ mất mọi quyền khi yêu cầu được duyệt, trừ khi cán bộ khoa cấp quyền chỉ đọc.',
  CANCEL: 'Cán bộ khoa sẽ quyết định kèm lý do. Đề tài bị hủy vẫn được lưu, không bị xóa.',
  LEAVE_GROUP: 'Đề tài đã được duyệt nên việc rời nhóm cần cán bộ khoa duyệt. Sau khi rời bạn chỉ xem được các phiên bản hồ sơ và tài liệu trong thời gian còn là thành viên.',
  TOPIC_CHANGE: 'Chỉ điền hoặc sửa phần muốn thay đổi. Đổi tên hoặc tóm tắt sẽ được kiểm tra trùng lặp lại. Thêm thành viên cần sinh viên đó đồng ý. Nếu bị từ chối, hồ sơ giữ nguyên.',
};

// Ô tìm gọi API có `q` (không giới hạn 100 GV đầu); đổi từ khóa thì danh sách chọn đổi theo
function LecturerSelect({ topic, register, error }) {
  const [q, setQ] = useState('');
  const list = useQuery({ queryKey: ['lecturers', topic.round.id, 'for-change', q], queryFn: () => api(`/lecturers${qs({ roundId: topic.round.id, q, pageSize: 100 })}`) });
  const items = (list.data?.items ?? []).filter((l) => l.id !== topic.advisor?.id);
  return (
    <>
    <DebouncedInput label="Tìm giảng viên" value={q} onCommit={setQ} placeholder="Mã hoặc họ tên" />
    <FormField label="Giảng viên mới" error={error ?? (list.isError ? list.error.message : undefined)}>
      <select {...register('newLecturerId')}>
        <Options placeholder={list.isPending ? 'Đang tải…' : 'Chọn giảng viên'}
          options={items.map((l) => ({ value: l.id, label: `${l.code} – ${l.fullName} (đã nhận ${l.activeTopicCount}/${l.maxTopics})` }))} />
      </select>
    </FormField>
    </>
  );
}

/**
 * Form tạo yêu cầu thay đổi (FR18–FR21), một khung cho bốn loại. kind ∈ CHANGE_TYPE.
 * Hiện trong hộp thoại; onDone() sau khi tạo xong hoặc khi đề tài đã đổi trạng thái.
 */
export function ChangeRequestForm({ topic, kind, onClose }) {
  const qc = useQueryClient();
  const cd = useCooldown();
  const returnFocus = useReturnFocus();
  const fields = useCatalog('fields', {}, { enabled: kind === 'TOPIC_CHANGE' });
  const [check, setCheck] = useState(null); // SimilarityCheckView từ details của lỗi FR06
  const [needJustification, setNeedJustification] = useState(false);
  const { register, handleSubmit, setError, formState: { errors, isDirty } } = useForm({
    resolver: makeResolver(kind, topic),
    defaultValues: {
      reason: '', newLecturerId: '', title: topic.title ?? '', summary: topic.summary ?? '', objectives: topic.objectives ?? '',
      keywordsText: (topic.keywords ?? []).join(', '), fieldId: topic.field?.id ?? '', addMemberCode: '', justification: '',
    },
  });
  const create = useMutation({
    mutationFn: (values) => api(`/topics/${topic.id}/change-requests`, { method: 'POST', body: toBody(kind, values, topic) }),
    onSuccess: () => { toast('Đã gửi yêu cầu', { type: 'success' }); onClose(); },
    onError: (err) => {
      if (err.sessionExpired) return;
      if (err.status === 429) cd.start(err.retryAfter);
      if (err.details?.similarityCheck) setCheck(err.details.similarityCheck);
      if (err.code === 'JUSTIFICATION_REQUIRED') setNeedJustification(true);
      if (WRONG_STATE_CODES.has(err.code)) { toast(err.message, { type: 'error' }); onClose(); return; }
      const msgs = err.code === 'SIMILARITY_NOT_CHECKED' ? ['Chưa kiểm tra được trùng lặp, vui lòng thử lại. Hệ thống không coi đây là "không trùng".']
        : applyServerErrors(mapServerDetails(err), setError, FORM_FIELDS);
      setError('root', { message: msgs.join(' ') });
    },
    onSettled: () => invalidateChangeRequests(qc, topic.id),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} {...keepOpenOnOutside} {...keepOpenOnEscIf(isDirty)} {...returnFocus} className="sm:max-w-lg">
      <form noValidate onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-3">
        <DialogTitle>{CHANGE_TYPE_LABEL[kind]}</DialogTitle>
        <DialogDescription className="text-slate-700">{HINT[kind]}</DialogDescription>
        {kind === 'ADVISOR_CHANGE' && <LecturerSelect topic={topic} register={register} error={errors.newLecturerId?.message} />}
        {kind === 'TOPIC_CHANGE' && (
          <>
            <FormField label="Tên đề tài" error={errors.title?.message}><input {...register('title')} /></FormField>
            <FormField label="Tóm tắt" error={errors.summary?.message}><textarea rows={4} {...register('summary')} /></FormField>
            <FormField label="Mục tiêu" error={errors.objectives?.message}><textarea rows={3} {...register('objectives')} /></FormField>
            <FormField label="Từ khóa" hint="Cách nhau bằng dấu phẩy" error={errors.keywordsText?.message}><input {...register('keywordsText')} /></FormField>
            <FormField label="Lĩnh vực" error={errors.fieldId?.message}>
              <select {...register('fieldId')}>
                <Options options={[...(fields.data ?? []), ...(topic.field && !(fields.data ?? []).some((f) => f.id === topic.field.id) ? [topic.field] : [])].map((f) => ({ value: f.id, label: f.name }))} />
              </select>
            </FormField>
            <FormField label="Mã sinh viên muốn thêm vào nhóm (nếu có)" error={errors.addMemberCode?.message}><input {...register('addMemberCode')} /></FormField>
            {check && <SimilarityPanel check={check} />}
            <FormField label={needJustification ? 'Giải trình (bắt buộc)' : 'Giải trình trùng lặp (nếu có)'} error={errors.justification?.message}>
              <textarea rows={4} {...register('justification')} />
            </FormField>
          </>
        )}
        <FormField label="Lý do" error={errors.reason?.message}><textarea rows={3} {...register('reason')} /></FormField>
        <FormError error={errors.root?.message} />
        {cd.active && <p role="status" className="text-sm text-amber-900">{cd.message}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={btnGhost}>Hủy</button>
          <button type="submit" disabled={create.isPending || cd.active} className={btnPrimary}>{create.isPending ? 'Đang xử lý…' : 'Gửi yêu cầu'}</button>
        </div>
      </form>
      </DialogContent>
    </Dialog>
  );
}
