import { useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { COUNCIL_ROLE_LABEL } from '@nckh/shared';
import { Minus, Plus } from 'lucide-react';
import { api } from '../../lib/api.js';
import { qs } from '../../lib/format.js';
import { DebouncedInput } from '../../components/ListFilters.jsx';
import { FormField } from '../../components/FormField.jsx';
import { btnGhost } from '../../components/ui.jsx';

// Mảng members của form: phần tử 0 là Chủ tịch, 1 là Thư ký, từ 2 trở đi là Ủy viên (API_GD7 §6.2)
export const emptyMembers = () => [{ lecturerId: '', role: 'CHAIR' }, { lecturerId: '', role: 'SECRETARY' }, { lecturerId: '', role: 'MEMBER' }];
const MAX_MEMBER = 5;

/** Lỗi chung của khối thành viên (cơ cấu sai, GV không hợp lệ từ server) – zod đặt ở `members` hoặc `members.root` */
export const membersError = (errors) => errors.members?.message ?? errors.members?.root?.message;

/**
 * Ba khối "Chủ tịch" (1), "Thư ký" (1), "Ủy viên" (1–5) – UI §12.8. Mỗi ô là một ô chọn giảng viên; một ô tìm kiếm chung
 * lọc danh sách qua `GET /api/users?role=LECTURER&facultyId=&q=`. GV đã chọn ở ô khác bị làm mờ (disabled) trong danh sách.
 * Chỉ truy vấn khi đã biết khoa của đợt (`facultyId`) – server chỉ nhận GV cùng khoa (m1 DC-15).
 * `known`: tên của GV đã có sẵn (khi sửa) để ô vẫn hiện tên dù không nằm trong kết quả tìm.
 */
export function CouncilMembersFields({ control, register, watch, errors, facultyId, known = [] }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'members' });
  const [q, setQ] = useState('');
  const lecturers = useQuery({
    queryKey: ['users', 'council-lecturers', facultyId ?? '', q],
    queryFn: async () => (await api(`/users${qs({ role: 'LECTURER', isLocked: 'false', facultyId, q, pageSize: 100 })}`)).items,
    enabled: !!facultyId,
  });
  const selected = (watch('members') ?? []).map((m) => m.lecturerId);
  // Gộp kết quả tìm + người đã chọn trước đó để ô chọn không mất tên khi đổi từ khóa
  const [names, setNames] = useState(() => Object.fromEntries(known.map((m) => [m.lecturerId, m.fullName])));
  const found = Object.fromEntries((lecturers.data ?? []).map((l) => [l.id, `${l.fullName} (${l.code})`]));
  if (Object.keys(found).some((id) => names[id] !== found[id])) setNames((n) => ({ ...n, ...found }));
  const memberCount = fields.filter((f) => f.role === 'MEMBER').length;
  // Một vị trí trong hội đồng: nhãn vai trò + ô chọn giảng viên từ kết quả tìm chung
  const slot = (f, i, label) => {
    const value = selected[i];
    const ids = [...new Set([...(lecturers.data ?? []).map((l) => l.id), ...(value ? [value] : [])])];
    return (
      <FormField key={f.id} label={label} error={errors.members?.[i]?.lecturerId?.message} className="min-w-0 flex-1">
        <select {...register(`members.${i}.lecturerId`)}>
          <option value="">— Chọn giảng viên —</option>
          {ids.map((id) => <option key={id} value={id} disabled={id !== value && selected.includes(id)}>{names[id] ?? found[id] ?? id}</option>)}
        </select>
      </FormField>
    );
  };
  let n = 0;
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">Thành viên hội đồng</legend>
      {membersError(errors) && <p role="alert" className="break-words text-sm text-red-700">{membersError(errors)}</p>}
      <DebouncedInput label="Tìm giảng viên" value={q} onCommit={setQ} placeholder="Họ tên hoặc mã giảng viên" />
      {!facultyId && <p className="text-sm text-muted-foreground">Chọn đợt trước để tìm giảng viên cùng khoa.</p>}
      {lecturers.isError && <p role="alert" className="text-sm text-red-700">{lecturers.error.message}</p>}
      {fields.map((f, i) => {
        if (f.role !== 'MEMBER') return slot(f, i, COUNCIL_ROLE_LABEL[f.role]);
        n += 1;
        return (
          <div key={f.id} className="flex items-end gap-2">
            {slot(f, i, `${COUNCIL_ROLE_LABEL.MEMBER} ${n}`)}
            {memberCount > 1 && <button type="button" className={btnGhost} onClick={() => remove(i)} aria-label={`Bớt ủy viên ${n}`}><Minus aria-hidden="true" className="size-4" /></button>}
          </div>
        );
      })}
      {memberCount < MAX_MEMBER && (
        <button type="button" className={btnGhost} onClick={() => append({ lecturerId: '', role: 'MEMBER' })}><Plus aria-hidden="true" className="size-4" />Thêm ủy viên</button>
      )}
    </fieldset>
  );
}

/** Hộp lỗi xung đột lợi ích (CONFLICT_OF_INTEREST – API_GD7 §1.3): liệt kê "{GV} là GVHD của đề tài {mã}" */
export const conflictLines = (err) => (err?.details?.conflicts ?? []).map((c) => `${c.lecturerName} là GVHD của đề tài ${c.topicCode}`);
