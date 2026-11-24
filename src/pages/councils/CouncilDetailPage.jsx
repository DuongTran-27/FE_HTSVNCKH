import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { COUNCIL_ROLE_LABEL, DEFENSE_DECISION_LABEL, TOPIC_STATUS_LABEL, councilCreateSchema } from '@nckh/shared';
import { ArrowLeft, Users } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { fmtScore, qs, searchTerm } from '../../lib/format.js';
import { applyServerErrors } from '../../lib/forms.js';
import { toast } from '../../lib/toast.js';
import { DebouncedInput } from '../../components/ListFilters.jsx';
import { FormField } from '../../components/FormField.jsx';
import { ReasonDialog } from '../../components/ReasonDialog.jsx';
import { Badge, FormError, QueryBox, STATUS_TONE, btnGhost, btnPrimary, card, keepOpenOnOutside, useReturnFocus } from '../../components/ui.jsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CouncilMembersFields, conflictLines } from './CouncilMembersFields.jsx';

const COLS = 'lg:grid-cols-[7rem_minmax(0,1fr)_minmax(0,9rem)_8rem_6rem_7rem_auto]';
// Form sửa trên R32: tên + thành viên (đợt không đổi được)
const editSchema = councilCreateSchema.omit({ roundId: true });

// R32 – UI §12.8, API_GD7 §6.1–6.5: thông tin + thành viên (trái), đề tài được gán (phải). Cán bộ sửa/gán/hủy gán;
// giảng viên thành viên hội đồng chỉ đọc (không có nút). Quyền thật do server kiểm.
export function CouncilDetailPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ['council', id], queryFn: async () => (await api(`/councils/${id}`)).council });
  return <section><QueryBox query={query}>{(c) => <CouncilDetail council={c} />}</QueryBox></section>;
}

// CouncilDetail – R32: thông tin hội đồng, thành viên và danh sách đề tài được gán; nút sửa/gán theo quyền server trả về
function CouncilDetail({ council: c }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const staff = user.role === 'STAFF';
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  // Sau mọi lần ghi (kể cả lỗi): tải lại hội đồng, danh sách hội đồng và danh sách đề tài (UI §12.12)
  const refresh = () => ['council', 'councils', 'topics'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const cancel = async (reason) => {
    try {
      await api(`/council-assignments/${cancelling.id}/cancel`, { method: 'POST', body: { reason } });
    } catch (err) {
      if (err.code === 'ASSIGNMENT_HAS_SCORES') err.message += '. Muốn bỏ phân công, dùng "Trả về đang thực hiện" ở trang đề tài.';
      throw err;
    } finally { refresh(); }
    toast(`Đã hủy gán đề tài ${cancelling.topic.code}`, { type: 'success' });
    setCancelling(null);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground tabular-nums">{c.code}</p>
          <h1 className="break-words text-2xl font-bold sm:text-3xl">{c.name}</h1>
        </div>
        {staff && <Link to="/hoi-dong" className={btnGhost}><ArrowLeft aria-hidden="true" className="size-4" />Danh sách hội đồng</Link>}
      </div>
      {!staff && <p role="note" className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-blue-900">Bạn là thành viên hội đồng – chỉ đọc.</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`${card} space-y-3 lg:self-start`}>
          <p className="text-sm">Đợt: <span className="font-medium">{c.round.name} ({c.round.academicYear})</span></p>
          {c.locked && <p className="flex flex-wrap items-center gap-2 text-sm"><Badge tone="green">Đã có điểm</Badge>Hội đồng đã có điểm, không đổi được thành viên</p>}
          {editing
            ? <EditCouncil council={c} onDone={() => setEditing(false)} refresh={refresh} />
            : (
              <>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-blue-900"><Users aria-hidden="true" className="size-4" />Thành viên ({c.members.length})</h2>
                <ul className="divide-y">
                  {c.members.map((m) => (
                    <li key={m.lecturerId} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                      <span className="font-medium">{m.fullName}</span><span className="text-muted-foreground">{COUNCIL_ROLE_LABEL[m.role]}</span>
                    </li>
                  ))}
                </ul>
                {staff && !c.locked && <button type="button" className={btnGhost} onClick={() => setEditing(true)}>Sửa tên và thành viên</button>}
              </>
            )}
        </div>

        <div className="space-y-3 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">Đề tài được gán ({c.assignments.length})</h2>
            {staff && <button type="button" className={btnPrimary} onClick={() => setAssigning(true)}>Gán đề tài</button>}
          </div>
          {c.assignments.length === 0
            ? <p className="rounded-xl border border-dashed bg-card px-4 py-8 text-center text-muted-foreground">Chưa có đề tài nào được gán cho hội đồng này.</p>
            : (
              <>
                <div aria-hidden="true" className={`hidden gap-3 px-4 text-xs font-semibold text-muted-foreground uppercase lg:grid ${COLS}`}>
                  <span>Mã</span><span>Tên đề tài</span><span>GVHD</span><span>Trạng thái</span><span>Đã chấm</span><span>Điểm cuối</span><span>Thao tác</span>
                </div>
                <ul className="space-y-3">
                  {c.assignments.map((a) => (
                    <li key={a.id} className={`rounded-xl border bg-card p-4 shadow-sm lg:grid lg:items-center lg:gap-3 ${COLS}`}>
                      <span className="font-medium tabular-nums text-muted-foreground">{a.topic.code}</span>
                      <Link to={`/de-tai/${a.topic.id}`} className="block break-words font-semibold text-blue-900 underline-offset-4 hover:underline">{a.topic.title}</Link>
                      <span className="block text-sm"><span className="lg:sr-only">GVHD: </span>{a.advisor?.fullName ?? '—'}</span>
                      <span className="mt-1 block lg:mt-0"><Badge tone={STATUS_TONE[a.topic.status]}>{TOPIC_STATUS_LABEL[a.topic.status] ?? a.topic.status}</Badge></span>
                      <span className="mt-1 block text-sm tabular-nums lg:mt-0">Đã chấm {a.scoredCount}/{a.memberCount}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-sm lg:mt-0">
                        <span className="tabular-nums">{a.finalScore ? fmtScore(a.finalScore) : '—'}</span>
                        {a.decision && <Badge tone={a.decision === 'PASSED' ? 'green' : 'red'}>{DEFENSE_DECISION_LABEL[a.decision]}</Badge>}
                      </span>
                      <span className="mt-2 block lg:mt-0">
                        {staff && !a.decidedAt && a.scoredCount === 0 && (
                          <button type="button" className={btnGhost} onClick={() => setCancelling(a)}>Hủy gán<span className="sr-only"> đề tài {a.topic.code}</span></button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
        </div>
      </div>

      {assigning && <AssignDialog council={c} refresh={refresh} onClose={() => setAssigning(false)} />}
      {cancelling && (
        <ReasonDialog title="Hủy gán đề tài" label="Lý do hủy gán" confirmLabel="Hủy gán"
          message={`Bỏ đề tài ${cancelling.topic.code} khỏi ${c.name}? Đề tài vẫn ở trạng thái Chờ bảo vệ để gán hội đồng khác.`}
          onSubmit={cancel} onCancel={() => setCancelling(null)} />
      )}
    </div>
  );
}

// Sửa tên (PATCH) và/hoặc thành viên (PUT, thay toàn bộ) – mỗi lệnh tăng version nên PUT dùng version PATCH trả về
function EditCouncil({ council: c, onDone, refresh }) {
  const { register, control, watch, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: { name: c.name, members: c.members.map(({ lecturerId, role }) => ({ lecturerId, role })) },
  });
  const submit = async ({ name, members }) => {
    let renamed = false; // PATCH tên đã thành công – nếu PUT thành viên lỗi phải báo rõ tên đã lưu (m2 DC-15)
    try {
      let version = c.version;
      if (name !== c.name) {
        version = (await api(`/councils/${c.id}`, { method: 'PATCH', body: { name, version } })).council.version;
        renamed = true;
      }
      const same = JSON.stringify(members) === JSON.stringify(c.members.map(({ lecturerId, role }) => ({ lecturerId, role })));
      if (!same) await api(`/councils/${c.id}/members`, { method: 'PUT', body: { members, version } });
      toast('Đã lưu hội đồng', { type: 'success' });
      onDone();
    } catch (err) {
      if (err.sessionExpired) return;
      const saved = renamed ? 'Đã lưu tên mới; thành viên chưa lưu' : null;
      // Đã có điểm: đóng form, khối thành viên về chỉ đọc (dữ liệu tải lại có locked = true)
      if (err.code === 'COUNCIL_LOCKED') { toast([saved, err.message].filter(Boolean).join('. '), { type: 'error' }); onDone(); return; }
      const lines = conflictLines(err);
      const msgs = lines.length ? [err.message, ...lines] : applyServerErrors(err, setError, ['name', 'members']);
      if (saved) msgs.unshift(saved);
      if (msgs.length) setError('root', { message: msgs.join('. ') });
    } finally { refresh(); }
  };
  return (
    <form noValidate onSubmit={handleSubmit(submit)} className="space-y-3">
      <FormField label="Tên hội đồng" error={errors.name?.message}><input maxLength={200} {...register('name')} /></FormField>
      <CouncilMembersFields control={control} register={register} watch={watch} errors={errors} facultyId={c.round.facultyId} known={c.members} />
      <FormError error={errors.root?.message} />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={btnGhost} onClick={onDone}>Hủy</button>
        <button type="submit" disabled={isSubmitting} className={btnPrimary}>{isSubmitting ? 'Đang lưu…' : 'Lưu'}</button>
      </div>
    </form>
  );
}

// Hộp "Gán đề tài": đề tài Chờ bảo vệ, chưa gán, cùng đợt; GVHD là thành viên hội đồng → đánh dấu đỏ, không chọn được
// (chỉ gợi ý; server kiểm lại và gán tất cả hoặc không – API_GD7 §6.3)
function AssignDialog({ council: c, refresh, onClose }) {
  const returnFocus = useReturnFocus();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // { message, lines }
  const topics = useQuery({
    queryKey: ['topics', 'council-unassigned', c.round.id, q],
    queryFn: () => api(`/topics${qs({ status: 'WAITING_DEFENSE', councilAssigned: 'false', roundId: c.round.id, q: searchTerm(q), pageSize: 100 })}`),
  });
  const memberIds = new Set(c.members.map((m) => m.lecturerId));
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const submit = async () => {
    if (!picked.length) { setError({ message: 'Chọn ít nhất 1 đề tài', lines: [] }); return; }
    setBusy(true);
    setError(null);
    try {
      await api(`/councils/${c.id}/assignments`, { method: 'POST', body: { topicIds: picked } });
      toast(`Đã gán ${picked.length} đề tài cho ${c.name}`, { type: 'success' });
      onClose();
    } catch (err) {
      if (!err.sessionExpired) {
        const codes = err.details?.topicCodes ?? [];
        const lines = conflictLines(err);
        setError({ message: err.message, lines: lines.length ? lines : codes.length ? [`Đề tài: ${codes.join(', ')}`] : [] });
      }
    } finally { setBusy(false); refresh(); }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} {...keepOpenOnOutside} {...returnFocus} className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogTitle>Gán đề tài cho {c.name}</DialogTitle>
        <DialogDescription>Đề tài Chờ bảo vệ, chưa có hội đồng, thuộc đợt {c.round.name}. Không đề tài nào được gán nếu một đề tài bị từ chối.</DialogDescription>
        <DebouncedInput label="Tìm đề tài" value={q} onCommit={setQ} placeholder="Mã, tên, từ khóa" />
        <QueryBox query={topics} empty="Không có đề tài nào đang chờ gán hội đồng." isEmpty={(d) => d.items.length === 0}>
          {(d) => (
            <ul className="divide-y rounded-lg border">
              {d.items.map((t) => {
                const conflict = t.advisor && memberIds.has(t.advisor.id);
                return (
                  <li key={t.id}>
                    <label className={`flex min-h-11 items-start gap-3 p-3 ${conflict ? 'bg-red-50' : 'cursor-pointer'}`}>
                      <input type="checkbox" className="mt-1 size-5 accent-blue-700" disabled={conflict} checked={picked.includes(t.id)} onChange={() => toggle(t.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-medium"><span className="mr-1.5 text-muted-foreground tabular-nums">{t.code}</span>{t.title}</span>
                        <span className="block text-sm text-muted-foreground">GVHD: {t.advisor?.fullName ?? '—'}</span>
                        {conflict && <span className="block text-sm font-medium text-red-700">Xung đột: GVHD là thành viên hội đồng</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </QueryBox>
        {error && (
          <div role="alert" className="break-words text-sm text-red-700">
            <p>{error.message}</p>
            {error.lines.length > 0 && <ul className="list-disc pl-5">{error.lines.map((l) => <li key={l}>{l}</li>)}</ul>}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={btnGhost}>Hủy</button>
          <button type="button" onClick={submit} disabled={busy} className={btnPrimary}>{busy ? 'Đang gán…' : picked.length ? `Gán ${picked.length} đề tài` : 'Gán đề tài'}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
