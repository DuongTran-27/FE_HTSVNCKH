import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_ROUND_CONFIG, REQUEST_STATUS_LABEL, TOPIC_STATUS_LABEL, availableActions } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { qs } from '../../lib/format.js';
import { useMyQuota } from '../../lib/queries.js';
import { inputClass } from '../../components/FormField.jsx';
import { AdvisingActions } from '../../components/AdvisingActions.jsx';
import { Badge, Options, Pager, QueryBox } from '../../components/ui.jsx';

const TABS = ['PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN'];

function Quota({ roundId, user }) {
  const q = useMyQuota(roundId, user).data;
  return q ? <span className="ml-2 text-sm font-normal">Đã nhận {q.activeTopicCount}/{q.maxTopics}{q.isFull && ' (đã đủ hạn mức)'}</span> : null;
}

function RequestCard({ r, user }) {
  const isLecturer = user.role === 'LECTURER';
  const t = r.topic;
  // GV: đề nghị đã đóng chỉ có id/mã/đợt (API §6), không có hồ sơ để mở
  const closedForLecturer = isLecturer && (r.status === 'DECLINED' || r.status === 'WITHDRAWN');
  // Ngưỡng theo đợt chưa có trong API: dùng mặc định, chỉ để tô màu
  const overdue = r.pendingDays != null && r.pendingDays >= DEFAULT_ROUND_CONFIG.advisorReminderDays;
  const actions = isLecturer && r.status === 'PENDING' ? availableActions(t.status, 'LECTURER') : [];
  return (
    <li className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="break-words font-medium">{t.code}{t.title ? ` – ${t.title}` : ''}</p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        {t.status && <Badge>{TOPIC_STATUS_LABEL[t.status] ?? t.status}</Badge>}
        {r.status !== 'PENDING' && <Badge>{REQUEST_STATUS_LABEL[r.status]}</Badge>}
        {!isLecturer && <span>Giảng viên: {r.lecturer.fullName}</span>}
        {r.pendingDays != null && <span className={overdue ? 'font-medium text-orange-700' : ''}>Chờ {r.pendingDays} ngày</span>}
      </p>
      {r.reason && <p className="mt-1 break-words text-sm text-slate-700">Lý do: {r.reason}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {!closedForLecturer && <Link to={`/de-tai/${t.id}`} className="inline-flex min-h-11 items-center text-blue-700 underline-offset-4 hover:underline">Xem hồ sơ</Link>}
        {actions.length > 0 && <AdvisingActions topic={t} actions={actions} redirectOnDecline={false} />}
      </div>
    </li>
  );
}

// R15 – API_GD2 §6. Thứ tự đúng như server trả, không sắp phía client
export function AdvisorRequestsPage() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const status = TABS.includes(sp.get('status')) ? sp.get('status') : 'PENDING';
  const roundId = sp.get('roundId') ?? '';
  const page = Number(sp.get('page')) || 1;
  const isStaff = user.role === 'STAFF';
  const set = (k, v) => setSp((old) => {
    const n = new URLSearchParams(old);
    if (v) n.set(k, v); else n.delete(k);
    if (k !== 'page') n.delete('page');
    return n;
  });
  const rounds = useQuery({ queryKey: ['rounds', 'all'], enabled: isStaff, queryFn: async () => (await api('/rounds?pageSize=100')).items });
  const query = useQuery({
    queryKey: ['advisor-requests', status, roundId, page],
    queryFn: () => api(`/advisor-requests${qs({ status, roundId, page, pageSize: 20 })}`),
  });
  const empty = !isStaff && status === 'PENDING' ? 'Không có đề nghị nào đang chờ bạn.' : 'Không có đề nghị nào.';

  return (
    <section>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Đề nghị hướng dẫn</h1>
      <div role="tablist" aria-label="Trạng thái đề nghị" className="mt-3 flex flex-wrap gap-2">
        {TABS.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={s === status} onClick={() => set('status', s === 'PENDING' ? '' : s)}
            className={`min-h-11 rounded-md border px-3 ${s === status ? 'border-blue-700 bg-navy text-white' : 'border-slate-300 bg-card'}`}>
            {REQUEST_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {isStaff && (
        <select aria-label="Đợt" className={`${inputClass} mt-3 sm:max-w-sm`} value={roundId} onChange={(e) => set('roundId', e.target.value)}>
          <Options placeholder="Mọi đợt" options={(rounds.data ?? []).map((r) => ({ value: r.id, label: `${r.name} (${r.academicYear})` }))} />
        </select>
      )}
      <div className="mt-3">
        <QueryBox query={query} empty={empty} isEmpty={(d) => d.items.length === 0}>
          {(d) => {
            const groups = [];
            for (const r of d.items) {
              const g = groups.find((x) => x.round.id === r.topic.round.id);
              if (g) g.items.push(r); else groups.push({ round: r.topic.round, items: [r] });
            }
            return (
              <>
                {groups.map((g) => (
                  <div key={g.round.id} className="mb-4">
                    <h2 className="font-bold">{g.round.name}{user.role === 'LECTURER' && <Quota roundId={g.round.id} user={user} />}</h2>
                    <ul className="mt-2 space-y-2">{g.items.map((r) => <RequestCard key={r.id} r={r} user={user} />)}</ul>
                  </div>
                ))}
                <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => set('page', String(p))} />
              </>
            );
          }}
        </QueryBox>
      </div>
    </section>
  );
}
