import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invitationCreateSchema } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { fmtDateTime } from '../../lib/format.js';
import { toast } from '../../lib/toast.js';
import { FormField } from '../../components/FormField.jsx';
import { Badge, ConfirmDialog, Options, QueryBox, btnGhost, btnPrimary, initials } from '../../components/ui.jsx';

// R8 – UI §4.8, API §5.3–5.4. GV và cán bộ chỉ xem (permissions đều false).
export function GroupPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ['topic', id], queryFn: async () => (await api(`/topics/${id}`)).topic });
  return <section><QueryBox query={query}>{(t) => <Group topic={t} />}</QueryBox></section>;
}

const refresh = (qc, id) => {
  qc.invalidateQueries({ queryKey: ['topic', id] });
  qc.invalidateQueries({ queryKey: ['invitations'] });
  qc.invalidateQueries({ queryKey: ['topics'] });
};

function InviteForm({ topic }) {
  const qc = useQueryClient();
  const { register, handleSubmit, setError, reset, formState: { errors } } = useForm({ resolver: zodResolver(invitationCreateSchema), defaultValues: { inviteeCode: '' } });
  const invite = useMutation({
    mutationFn: (body) => api(`/topics/${topic.id}/invitations`, { method: 'POST', body }),
    onSuccess: () => { reset(); toast('Đã gửi lời mời', { type: 'success' }); },
    onError: (err) => {
      if (err.sessionExpired) return;
      if (err.code === 'TOPIC_NOT_EDITABLE') toast(err.message, { type: 'error' });
      else setError('inviteeCode', { type: 'server', message: err.message }); // VALIDATION_ERROR, ALREADY_MEMBER, GROUP_FULL
    },
    onSettled: () => refresh(qc, topic.id),
  });
  return (
    <form noValidate onSubmit={handleSubmit((v) => invite.mutate(v))} className="max-w-sm space-y-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <FormField label="Mã sinh viên" error={errors.inviteeCode?.message}><input type="text" {...register('inviteeCode')} /></FormField>
      <button type="submit" disabled={invite.isPending} className={btnPrimary}>{invite.isPending ? 'Đang xử lý…' : 'Mời thành viên'}</button>
    </form>
  );
}

function Group({ topic: t }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const max = t.round.effectiveConfig?.maxMembers;
  const [newLeader, setNewLeader] = useState('');
  const [confirmLeader, setConfirmLeader] = useState(false);
  const [error, setError] = useState('');
  const others = t.members.filter((m) => m.userId !== user.id);
  const cancel = useMutation({
    mutationFn: (inv) => api(`/invitations/${inv.id}/cancel`, { method: 'POST' }),
    onSuccess: () => toast('Đã hủy lời mời', { type: 'success' }),
    onError: (err) => { if (!err.sessionExpired) toast(err.message, { type: 'error' }); },
    onSettled: () => refresh(qc, t.id),
  });
  const transfer = useMutation({
    mutationFn: () => api(`/topics/${t.id}/leader`, { method: 'POST', body: { userId: newLeader, version: t.version } }),
    onSuccess: (r) => { qc.setQueryData(['topic', t.id], r.topic); setConfirmLeader(false); setNewLeader(''); toast('Đã đổi trưởng nhóm', { type: 'success' }); },
    onError: (err) => {
      if (err.sessionExpired) return;
      if (err.code === 'CONCURRENT_UPDATE' || err.code === 'TOPIC_NOT_EDITABLE') { setConfirmLeader(false); toast(err.message, { type: 'error' }); } else setError(err.message);
    },
    onSettled: () => refresh(qc, t.id),
  });
  return (
    <div className="space-y-5">
      <header>
        <Link to={`/de-tai/${t.id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-blue-900"><ArrowLeft aria-hidden="true" className="size-4" />Về chi tiết đề tài</Link>
        <p className="text-sm text-muted-foreground tabular-nums">{t.code}</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Nhóm ({t.members.length}{max ? `/${max}` : ''})</h1>
      </header>
      <ul className="space-y-2">
        {t.members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
            <Avatar aria-hidden="true" className="size-10"><AvatarFallback className="bg-blue-100 text-sm font-semibold text-blue-800">{initials(m.fullName)}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1">
              <p className="break-words font-medium">{m.code} – {m.fullName}</p>
              <p className="text-xs text-muted-foreground">tham gia {fmtDateTime(m.joinedAt)}</p>
            </div>
            <Badge tone={m.role === 'LEADER' ? 'blue' : 'slate'}>{m.role === 'LEADER' ? 'Trưởng nhóm' : 'Thành viên'}</Badge>
          </li>
        ))}
      </ul>

      {(t.permissions?.invite || t.pendingInvitations.length > 0 || t.members.some((m) => m.userId === user.id)) && (
        <div>
          <h2 className="font-bold">Lời mời đang chờ</h2>
          {t.pendingInvitations.length === 0 ? <p className="text-slate-700">Chưa có lời mời nào đang chờ</p> : (
            <ul className="mt-1 space-y-2">
              {t.pendingInvitations.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-2 break-words">
                  <span>{inv.invitee.code} – {inv.invitee.fullName} · {fmtDateTime(inv.createdAt)}</span>
                  {t.permissions?.invite && <button type="button" className={btnGhost} disabled={cancel.isPending} onClick={() => cancel.mutate(inv)}>Hủy lời mời</button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {t.permissions?.invite && <InviteForm topic={t} />}

      {t.permissions?.transferLeader && others.length > 0 && (
        <div className="max-w-sm space-y-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
          <FormField label="Đổi trưởng nhóm sang">
            <select value={newLeader} onChange={(e) => setNewLeader(e.target.value)}>
              <Options placeholder="Chọn thành viên" options={others.map((m) => ({ value: m.userId, label: `${m.code} – ${m.fullName}` }))} />
            </select>
          </FormField>
          <button type="button" disabled={!newLeader} className={btnGhost} onClick={() => { setError(''); setConfirmLeader(true); }}>Đổi trưởng nhóm</button>
        </div>
      )}
      {confirmLeader && (
        <ConfirmDialog title="Đổi trưởng nhóm" message="Bạn sẽ không còn là trưởng nhóm." confirmLabel="Đổi trưởng nhóm" danger busy={transfer.isPending} error={error}
          onConfirm={() => transfer.mutate()} onCancel={() => setConfirmLeader(false)} />
      )}
    </div>
  );
}
