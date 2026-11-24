import { Link, useParams } from 'react-router';
import { fmtDateTime } from '../../lib/format.js';
import { useSubmission } from '../../lib/queries.js';
import { DecisionBox, SnapshotBody } from '../../components/Snapshot.jsx';
import { SimilarityPanel, UncheckedFlag } from '../../components/SimilarityPanel.jsx';
import { QueryBox } from '../../components/ui.jsx';

// R12 – API_GD2 §8.4: snapshot một lần gửi (nội dung + FR06 + giải trình + quyết định)
export function SubmissionPage() {
  const { id, seq } = useParams();
  const query = useSubmission(id, Number(seq));
  return (
    <section>
      <Link to={`/de-tai/${id}/lich-su`} className="inline-flex min-h-11 items-center text-blue-700 underline-offset-4 hover:underline">← Lịch sử</Link>
      <QueryBox query={query}>
        {(s) => (
          <div className="space-y-4">
            <header>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Lần gửi {s.seq}</h1>
              <p className="text-sm text-slate-700">{fmtDateTime(s.createdAt)} · {s.createdBy?.fullName}</p>
              {s.seq > 1 && <Link to={`/de-tai/${id}/so-sanh?from=${s.seq - 1}&to=${s.seq}`} className="text-blue-700 underline-offset-4 hover:underline">So sánh với lần trước</Link>}
            </header>
            <SnapshotBody payload={s.payload} />
            <div>
              <h2 className="font-bold">Kiểm tra trùng lặp {s.unchecked && <UncheckedFlag />}</h2>
              <SimilarityPanel check={s.similarityCheck} />
              {s.similarityBypass && (
                <p role="note" className="mt-2 break-words rounded-lg border border-amber-200 bg-amber-50 p-4">
                  {s.similarityBypass.grantedBy?.fullName} đã cho phép gửi khi chưa kiểm tra được trùng lặp ({fmtDateTime(s.similarityBypass.createdAt)}).
                  {s.similarityBypass.reason && <> Lý do: {s.similarityBypass.reason}</>}
                </p>
              )}
            </div>
            <DecisionBox decision={s.decision} />
          </div>
        )}
      </QueryBox>
    </section>
  );
}
