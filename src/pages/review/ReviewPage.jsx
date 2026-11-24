import { Link, useLocation, useParams } from 'react-router';
import { fmtDateTime } from '../../lib/format.js';
import { useSubmission, useSubmissions, useTopic } from '../../lib/queries.js';
import { DecisionBox, SnapshotBody } from '../../components/Snapshot.jsx';
import { SimilarityPanel } from '../../components/SimilarityPanel.jsx';
import { ReviewActions } from '../../components/ReviewActions.jsx';
import { ArrowLeft, Clock, GitCompareArrows, History, Users } from 'lucide-react';
import { QueryBox, card } from '../../components/ui.jsx';

// R17 – FR07, FR17. Quyết định luôn gắn với lần gửi mới nhất của đề tài (latestSubmission)
export function ReviewPage() {
  const { id } = useParams();
  const topic = useTopic(id);
  const seq = topic.data?.latestSubmission?.seq;
  const sub = useSubmission(id, seq, !!seq);
  const prev = useSubmission(id, seq ? seq - 1 : undefined, seq > 1);
  const list = useSubmissions(id, !!seq);
  const back = useLocation().state?.from ?? '/xet-duyet';

  return (
    <section>
      <Link to={back} className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-blue-700"><ArrowLeft aria-hidden="true" className="size-4" />Hàng chờ xét duyệt</Link>
      <QueryBox query={topic}>
        {(t) => (!t.latestSubmission
          ? <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-4">Hồ sơ chưa được gửi xét duyệt lần nào.</p>
          : (
            <QueryBox query={sub}>
              {(s) => (
                <div className="space-y-4">
                  <header className={card}>
                    <p className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-700">{t.code}</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Xét duyệt – lần gửi {s.seq}</h1>
                    <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-600"><Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>
                      Gửi lúc {fmtDateTime(s.createdAt)} bởi {s.createdBy?.fullName} · Hạn xét duyệt {fmtDateTime(t.round.reviewDeadline)}
                      {list.data && ` · Tổng ${list.data.length} lần gửi`}
                    </span></p>
                    <p className="mt-3 flex flex-wrap gap-x-4 border-t border-slate-200 pt-2 text-sm font-medium">
                      {s.seq > 1 && <Link to={`/de-tai/${id}/so-sanh?from=${s.seq - 1}&to=${s.seq}`} className="inline-flex min-h-11 items-center gap-1.5 text-blue-700 hover:underline"><GitCompareArrows aria-hidden="true" className="size-4" />So sánh với lần gửi trước</Link>}
                      <Link to={`/de-tai/${id}/lich-su`} className="inline-flex min-h-11 items-center gap-1.5 text-blue-700 hover:underline"><History aria-hidden="true" className="size-4" />Lịch sử</Link>
                    </p>
                  </header>
                  {t.status !== 'UNDER_REVIEW' && <p role="note" className="rounded-lg border border-blue-100 bg-blue-50 p-4">Hồ sơ không còn ở trạng thái chờ xét duyệt.</p>}
                  <div className="grid items-start gap-4 lg:grid-cols-2">
                    <div className={`${card} space-y-5`}>
                      <SnapshotBody payload={s.payload} />
                      <div className="border-t border-slate-200 pt-4">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-blue-900"><Users aria-hidden="true" className="size-4" />Nhóm</h3>
                        <ul className="mt-1.5 list-disc pl-5">{t.members.map((m) => <li key={m.userId}>{m.fullName} ({m.code}){m.role === 'LEADER' && ' – trưởng nhóm'}</li>)}</ul>
                        <p className="mt-2 text-sm">Giảng viên hướng dẫn: <span className="font-medium">{t.advisor?.fullName ?? 'Chưa có'}</span></p>
                      </div>
                    </div>
                    <div className="space-y-3 lg:sticky lg:top-20">
                      <h3 className="font-semibold">Kiểm tra trùng lặp</h3>
                      <SimilarityPanel check={s.similarityCheck} />
                      {s.seq > 1 && prev.data && <DecisionBox decision={prev.data.decision} title="Quyết định lần trước" />}
                      {s.decision && <DecisionBox decision={s.decision} />}
                      <ReviewActions topic={t} submission={s} backTo={back} />
                    </div>
                  </div>
                </div>
              )}
            </QueryBox>
          ))}
      </QueryBox>
    </section>
  );
}
