import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { qs } from '../../lib/format.js';
import { ChangeRequestCard } from '../../components/ChangeRequestCard.jsx';
import { ChangeRequestForm } from '../../components/ChangeRequestForm.jsx';
import { ExecTabs, TopicQuery } from '../../components/ExecShell.jsx';
import { ReadOnlyBanner } from '../../components/MembershipActions.jsx';
import { Pager, QueryBox, btnPrimary } from '../../components/ui.jsx';

// Nút tạo theo permissions của server (API_GD6 §2.5): [quyền, loại, nhãn]
const CREATE = [
  ['requestTopicChange', 'TOPIC_CHANGE', 'Thay đổi hồ sơ'],
  ['requestAdvisorChange', 'ADVISOR_CHANGE', 'Thay giảng viên'],
  ['requestCancel', 'CANCEL', 'Đề nghị hủy đề tài'],
  ['requestLeave', 'LEAVE_GROUP', 'Xin rời nhóm'],
];

// /de-tai/:id/yeu-cau – API_GD6 §12
export function TopicRequestsPage() {
  return <section><TopicQuery>{(t) => <TopicRequests topic={t} />}</TopicQuery></section>;
}

function TopicRequests({ topic: t }) {
  const location = useLocation();
  const [form, setForm] = useState(location.state?.open ?? null);
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['change-requests', 'topic', t.id, page],
    queryFn: () => api(`/topics/${t.id}/change-requests${qs({ page, pageSize: 20 })}`),
  });
  const p = t.permissions ?? {};
  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <Link to={`/de-tai/${t.id}`} className="inline-flex min-h-11 items-center text-blue-700 underline-offset-4 hover:underline">← Chi tiết đề tài</Link>
        <p className="break-words text-sm text-slate-700">{t.code}</p>
        <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">Yêu cầu thay đổi</h1>
        <ExecTabs topic={t} />
      </header>
      <ReadOnlyBanner topic={t} />
      <div className="flex flex-wrap gap-2">
        {CREATE.filter(([perm]) => p[perm]).map(([, kind, label]) => (
          <button key={kind} type="button" className={btnPrimary} onClick={() => setForm(kind)}>{label}</button>
        ))}
      </div>
      <QueryBox query={list} empty="Chưa có yêu cầu nào" isEmpty={(d) => d.items.length === 0}>
        {(d) => (
          <>
            <ul className="space-y-3">
              {d.items.map((cr) => <ChangeRequestCard key={cr.id} cr={cr} linkTopic={false} />)}
            </ul>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </QueryBox>
      {form && <ChangeRequestForm topic={t} kind={form} onClose={() => setForm(null)} />}
    </div>
  );
}
