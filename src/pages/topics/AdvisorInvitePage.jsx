import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { qs } from '../../lib/format.js';
import { invalidateAfterAction } from '../../lib/queries.js';
import { SUBMIT_FIELDS, submitProblems, topicToForm } from '../../lib/topicForm.js';
import { toast } from '../../lib/toast.js';
import { inputClass } from '../../components/FormField.jsx';
import { Badge, ConfirmDialog, Pager, QueryBox, btnGhost, btnPrimary } from '../../components/ui.jsx';

// R9 – UI §4.9
export function AdvisorInvitePage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ['topic', id], queryFn: async () => (await api(`/topics/${id}`)).topic });
  return <section><QueryBox query={query}>{(t) => <Invite topic={t} />}</QueryBox></section>;
}

function Invite({ topic: t }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const allowed = t.availableActions.includes('REQUEST_ADVISOR');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pick, setPick] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { if (!allowed) navigate(`/de-tai/${t.id}`, { replace: true }); }, [allowed, t.id, navigate]);
  const problems = submitProblems(topicToForm(t), t.round.effectiveConfig);
  const missing = SUBMIT_FIELDS.filter(([k]) => problems[k]);
  const params = { roundId: t.round.id, q: q.trim(), page, pageSize: 20 };
  const list = useQuery({ queryKey: ['lecturers', t.round.id, params], queryFn: () => api(`/lecturers${qs(params)}`) });
  const send = useMutation({
    mutationFn: () => api(`/topics/${t.id}/actions`, { method: 'POST', body: { action: 'REQUEST_ADVISOR', version: t.version, lecturerId: pick.id } }),
    onSuccess: (r) => { qc.setQueryData(['topic', t.id], r.topic); toast('Đã gửi đề nghị hướng dẫn', { type: 'success' }); navigate(`/de-tai/${t.id}`); },
    onError: (err) => {
      if (err.sessionExpired) return;
      if (err.code === 'INVALID_TRANSITION') { toast(err.message, { type: 'error' }); navigate(`/de-tai/${t.id}`, { replace: true }); return; }
      setError(err.message);
    },
    onSettled: () => invalidateAfterAction(qc, t.id),
  });
  const ask = (l) => {
    setError('');
    // Hồ sơ chưa đủ: báo tại chỗ, không gọi API (UI §4.9)
    if (missing.length) { setError(`Hồ sơ chưa đủ thông tin bắt buộc: ${missing.map(([, label]) => label).join(', ')}`); return; }
    setPick(l);
  };
  return (
    <div className="space-y-3">
      <header>
        <p className="text-sm text-slate-700">{t.code}</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Mời giảng viên hướng dẫn</h1>
      </header>
      {missing.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="font-bold">Hồ sơ chưa đủ thông tin bắt buộc</p>
          <ul className="list-disc pl-5">{missing.map(([k, label]) => <li key={k}>{label}: {problems[k]}</li>)}</ul>
          {t.permissions?.edit && <Link to={`/de-tai/${t.id}/sua`} className={`${btnGhost} mt-2`}>Sửa hồ sơ</Link>}
        </div>
      )}
      {error && !pick && <p role="alert" className="break-words rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
      <input type="search" aria-label="Tìm giảng viên" placeholder="Tìm theo mã hoặc họ tên" className={inputClass} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      <QueryBox query={list} empty="Khoa chưa có giảng viên nào trong đợt này." isEmpty={(d) => d.items.length === 0 && !q.trim()}>
        {(d) => (
          <>
            {d.items.length === 0 ? <p className="text-slate-700">Không tìm thấy giảng viên phù hợp.</p> : (
              <ul className="space-y-2">
                {d.items.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4 shadow-sm">
                    <span className="break-words">{l.code} – {l.fullName} · Đã nhận {l.activeTopicCount}/{l.maxTopics} {l.isFull && <Badge tone="amber">Đã đủ</Badge>}</span>
                    <button type="button" className={btnPrimary} onClick={() => ask(l)}>Chọn</button>
                  </li>
                ))}
              </ul>
            )}
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </QueryBox>
      {pick && (
        <ConfirmDialog title="Gửi đề nghị hướng dẫn" message={`Gửi đề nghị hướng dẫn tới ${pick.fullName}? Các lời mời thành viên đang chờ sẽ bị rút.`} confirmLabel="Gửi đề nghị"
          busy={send.isPending} error={error} onConfirm={() => send.mutate()} onCancel={() => setPick(null)} />
      )}
    </div>
  );
}
