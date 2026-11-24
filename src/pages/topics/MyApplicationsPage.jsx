import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { fmtDateTime, qs } from '../../lib/format.js';
import { Badge, Pager, QueryBox, btnGhost, btnPrimary } from '../../components/ui.jsx';
import { APPLICATION_LABEL, APPLICATION_TONE } from './RecruitBoardPage.jsx';
import { WithdrawDialog } from './RecruitDetailPage.jsx';

// R28 – UI §12.6, API_GD7 §4.2: các đơn ứng tuyển của sinh viên; nút "Rút đơn" chỉ hiện khi server trả WITHDRAW.
export function MyApplicationsPage() {
  const [page, setPage] = useState(1);
  const [withdrawing, setWithdrawing] = useState(null);
  const query = useQuery({ queryKey: ['applications', 'mine', page], queryFn: () => api(`/applications${qs({ page, pageSize: 20 })}`), placeholderData: keepPreviousData });
  return (
    <section>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Đơn ứng tuyển</h1>
      <div className="mt-3">
        <QueryBox query={query} isEmpty={(d) => d.items.length === 0} empty="Bạn chưa ứng tuyển đề tài nào.">
          {(d) => (
            <>
              {/* Mỗi đơn: đề tài, trạng thái, ngày nộp, lý do từ chối và nút theo availableActions */}
              <ul className="space-y-3">
                {d.items.map((a) => (
                  <li key={a.id} className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
                    <p className="break-words font-semibold"><span className="mr-1.5 font-medium text-muted-foreground tabular-nums">{a.topic.code}</span>{a.topic.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <Badge tone={APPLICATION_TONE[a.status]}>{APPLICATION_LABEL[a.status] ?? a.status}</Badge>
                      {a.topic.advisor && <span>GV: {a.topic.advisor.fullName}</span>}
                      <span className="text-muted-foreground">Nộp {fmtDateTime(a.createdAt)}</span>
                    </p>
                    {a.status === 'DECLINED' && a.reason && <p className="mt-1 break-words text-sm">Lý do từ chối: {a.reason}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {a.status === 'ACCEPTED' && <Link to={`/de-tai/${a.topic.id}`} className={btnPrimary}>Vào đề tài</Link>}
                      {a.availableActions.includes('WITHDRAW') && <button type="button" className={btnGhost} onClick={() => setWithdrawing(a)}>Rút đơn</button>}
                    </div>
                  </li>
                ))}
              </ul>
              <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
            </>
          )}
        </QueryBox>
        {query.data?.items.length === 0 && <Link to="/tuyen-sinh" className={`${btnPrimary} mt-3`}>Xem đề tài đang tuyển</Link>}
      </div>
      {withdrawing && <WithdrawDialog app={withdrawing} onClose={() => setWithdrawing(null)} />}
    </section>
  );
}
