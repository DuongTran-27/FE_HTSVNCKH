import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REQUEST_STATUS_LABEL } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { fmtDateTime, qs } from '../../lib/format.js';
import { toast } from '../../lib/toast.js';
import { ConfirmDialog, Pager, QueryBox, btnGhost, btnPrimary } from '../../components/ui.jsx';

const TABS = ['PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN'];

// R14 – UI §4.12, API §5.3
export function InvitationsPage() {
  const [sp, setSp] = useSearchParams();
  const status = TABS.includes(sp.get('status')) ? sp.get('status') : 'PENDING';
  const page = Number(sp.get('page')) || 1;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(null); // { inv, kind }
  const [error, setError] = useState('');
  const params = { status, page, pageSize: 20 };
  const query = useQuery({ queryKey: ['invitations', params], queryFn: () => api(`/invitations${qs(params)}`) });
  const respond = useMutation({
    mutationFn: ({ inv, kind }) => api(`/invitations/${inv.id}/${kind}`, { method: 'POST' }),
    onSuccess: (r, { inv, kind }) => {
      setConfirm(null);
      if (kind === 'accept') {
        toast('Đã chấp nhận lời mời', { type: 'success' });
        navigate(`/de-tai/${r.topicId ?? inv.topic.id}`);
      } else toast('Đã từ chối lời mời', { type: 'success' });
    },
    onError: (err, { inv }) => {
      if (err.sessionExpired) return;
      if (err.code === 'INVITATION_CLOSED') { setConfirm(null); toast(err.message, { type: 'error' }); } else setError(err.message);
      qc.invalidateQueries({ queryKey: ['topic', inv.topic.id] });
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['invitations'] }); qc.invalidateQueries({ queryKey: ['topics'] }); },
  });
  const ask = (inv, kind) => { setError(''); setConfirm({ inv, kind }); };
  return (
    <section>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Lời mời</h1>
      <div role="tablist" className="mt-3 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === status} onClick={() => setSp({ status: t })} className={`${btnGhost} ${t === status ? 'border-blue-700 font-bold' : ''}`}>{REQUEST_STATUS_LABEL[t]}</button>
        ))}
      </div>
      <div className="mt-3">
        <QueryBox query={query} empty={status === 'PENDING' ? 'Bạn không có lời mời nào đang chờ.' : 'Không có lời mời nào.'} isEmpty={(d) => d.items.length === 0}>
          {(d) => (
            <>
              <ul className="space-y-2">
                {d.items.map((inv) => (
                  <li key={inv.id} className="rounded-xl border bg-card p-4 shadow-sm">
                    <p className="break-words font-medium">{inv.topic.code}{inv.topic.title ? ` – ${inv.topic.title}` : ''}</p>
                    <p className="break-words text-sm text-slate-700">{inv.topic.round?.name} · Trưởng nhóm: {inv.topic.leader.fullName} ({inv.topic.leader.code}) · {inv.topic.memberCount} thành viên · Mời lúc {fmtDateTime(inv.createdAt)}</p>
                    {inv.status === 'PENDING' && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" className={btnPrimary} onClick={() => ask(inv, 'accept')}>Chấp nhận</button>
                        <button type="button" className={btnGhost} onClick={() => ask(inv, 'decline')}>Từ chối</button>
                      </div>
                    )}
                    {inv.status === 'ACCEPTED' && <Link to={`/de-tai/${inv.topic.id}`} className="inline-flex min-h-11 items-center text-blue-700 underline-offset-4 hover:underline">Xem đề tài</Link>}
                  </li>
                ))}
              </ul>
              <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => setSp({ status, page: p })} />
            </>
          )}
        </QueryBox>
      </div>
      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'accept' ? 'Chấp nhận lời mời' : 'Từ chối lời mời'}
          message={confirm.kind === 'accept' ? `Bạn sẽ trở thành thành viên đề tài ${confirm.inv.topic.code}` : `Từ chối lời mời vào đề tài ${confirm.inv.topic.code}?`}
          confirmLabel={confirm.kind === 'accept' ? 'Chấp nhận' : 'Từ chối'} danger={confirm.kind === 'decline'} busy={respond.isPending} error={error}
          onConfirm={() => respond.mutate(confirm)} onCancel={() => setConfirm(null)} />
      )}
    </section>
  );
}
