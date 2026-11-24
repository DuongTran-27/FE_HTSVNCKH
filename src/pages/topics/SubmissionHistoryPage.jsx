import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ACTION_LABEL, ROLE_LABEL, TOPIC_STATUS_LABEL } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { fmtDateTime } from '../../lib/format.js';
import { useSubmissions } from '../../lib/queries.js';
import { SimilarityBadge, UncheckedFlag } from '../../components/SimilarityPanel.jsx';
import { QueryBox, btnPrimary } from '../../components/ui.jsx';

// R11 – API_GD2 §8.4: danh sách lần gửi + lịch sử trạng thái
export function SubmissionHistoryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [picked, setPicked] = useState([]);
  const subs = useSubmissions(id);
  const history = useQuery({ queryKey: ['status-history', id], queryFn: async () => (await api(`/topics/${id}/status-history`)).items });
  const toggle = (seq) => setPicked((p) => (p.includes(seq) ? p.filter((x) => x !== seq) : [...p, seq].slice(-2)));
  const [from, to] = [...picked].sort((a, b) => a - b);
  return (
    <section className="space-y-6">
      <div>
        <Link to={`/de-tai/${id}`} className="inline-flex min-h-11 items-center text-blue-700 underline-offset-4 hover:underline">← Chi tiết đề tài</Link>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Lịch sử</h1>
      </div>
      <div>
        <h2 className="font-bold">Các lần gửi</h2>
        <QueryBox query={subs} empty="Hồ sơ chưa được gửi xét duyệt lần nào." isEmpty={(d) => d.length === 0}>
          {(items) => (
            <>
              <ul className="mt-2 space-y-2">
                {items.map((s) => (
                  <li key={s.id} className="rounded-xl border bg-card p-4 shadow-sm">
                    <label className="inline-flex min-h-11 items-center gap-2">
                      <input type="checkbox" className="size-5" checked={picked.includes(s.seq)} onChange={() => toggle(s.seq)} aria-label={`Chọn lần gửi ${s.seq} để so sánh`} />
                      <Link to={`/de-tai/${id}/lan-gui/${s.seq}`} className="font-medium text-blue-700 underline-offset-4 hover:underline">Lần gửi {s.seq}</Link>
                    </label>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span>{fmtDateTime(s.createdAt)} · {s.createdBy?.fullName}</span>
                      <SimilarityBadge similarity={{ level: s.similarityLevel, status: s.similarityStatus }} />
                      {s.unchecked && <UncheckedFlag />}
                      <span>{s.decision ? `${ACTION_LABEL[s.decision.action] ?? s.decision.action} · ${fmtDateTime(s.decision.decidedAt)}` : 'Chưa xử lý'}</span>
                    </p>
                  </li>
                ))}
              </ul>
              <button type="button" disabled={picked.length !== 2} className={`${btnPrimary} mt-2`} onClick={() => navigate(`/de-tai/${id}/so-sanh?from=${from}&to=${to}`)}>So sánh 2 lần đã chọn</button>
            </>
          )}
        </QueryBox>
      </div>
      <div>
        <h2 className="font-bold">Lịch sử trạng thái</h2>
        <QueryBox query={history} empty="Chưa có thay đổi trạng thái." isEmpty={(d) => d.length === 0}>
          {(items) => (
            <ul className="mt-2 space-y-2">
              {items.map((h, i) => (
                <li key={i} className="rounded-xl border bg-card p-4 shadow-sm text-sm">
                  <p className="font-medium">{TOPIC_STATUS_LABEL[h.from] ?? h.from ?? '—'} → {TOPIC_STATUS_LABEL[h.to] ?? h.to} ({ACTION_LABEL[h.action] ?? h.action})</p>
                  <p>{h.actor?.fullName} ({ROLE_LABEL[h.actor?.role] ?? h.actor?.role}) · {fmtDateTime(h.at)}</p>
                  {h.reason && <p className="whitespace-pre-wrap break-words">Lý do: {h.reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </QueryBox>
      </div>
    </section>
  );
}
